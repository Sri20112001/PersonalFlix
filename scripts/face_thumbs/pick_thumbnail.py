#!/usr/bin/env python3
"""Pick the best video thumbnail by face detection (uniface/SCRFD).

Extracts N candidate frames spread across the video, runs face detection on
each, and writes the highest-scoring frame to --out. Score = largest face
area (fraction of frame) x detection confidence, so close-up confident faces
win. When no frame contains a face, falls back to the middle candidate
(same as the legacy fixed-frame behavior, but centered).

Stdout: one JSON line with the result (ok / fallback / error fields).
Designed to be invoked by the PersonalFlix Rust backend as a sidecar.
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

try:
    import cv2
except ImportError:
    print(json.dumps({"ok": False, "error": "opencv (cv2) not installed"}))
    sys.exit(3)


def ffprobe_duration(video: str):
    """Duration in seconds via ffprobe, else cv2 properties, else None."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", video],
            capture_output=True, text=True, timeout=30,
        )
        dur = float(out.stdout.strip())
        if dur > 0:
            return dur
    except Exception:
        pass
    try:
        cap = cv2.VideoCapture(video)
        fps = cap.get(cv2.CAP_PROP_FPS) or 0
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        cap.release()
        if fps > 0 and frames > 0:
            return frames / fps
    except Exception:
        pass
    return None


def candidate_times(duration, n: int):
    """Spread candidates across 4%..96% of the runtime (skip edge slates)."""
    if not duration or duration <= 0:
        return [10.0]
    if n <= 1:
        return [duration / 2.0]
    return [duration * (0.04 + 0.92 * i / (n - 1)) for i in range(n)]


def extract_frames(video: str, times, workdir: str):
    """One ffmpeg frame per timestamp. Returns [(t, path)]."""
    got = []
    for i, t in enumerate(times):
        dst = os.path.join(workdir, f"cand_{i:03d}.jpg")
        r = subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.1f}",
             "-i", video, "-vframes", "1", "-q:v", "3", dst],
            capture_output=True, timeout=120,
        )
        if r.returncode == 0 and os.path.exists(dst):
            got.append((t, dst))
    return got


def score_frame(detector, img):
    """Best-face score for one frame: (area fraction * confidence).

    Returns (score, faces, best_bbox_xyxy). Empty faces -> (0.0, 0, None).
    """
    h, w = img.shape[:2]
    area = float(h * w) or 1.0
    try:
        faces = detector.detect(img)
    except Exception:
        return 0.0, 0, None
    best, best_box = 0.0, None
    for f in faces or []:
        try:
            x1, y1, x2, y2 = (float(v) for v in f.bbox[:4])
            conf = float(f.confidence)
        except Exception:
            continue
        frac = max(0.0, (x2 - x1) * (y2 - y1)) / area
        s = frac * conf
        if s > best:
            best, best_box = s, [x1, y1, x2, y2]
    return best, len(faces or []), best_box


def pick(detector, frames):
    """Score every candidate frame. Returns (best, details, fallback)."""
    details = []
    best = None
    for t, path in frames:
        img = cv2.imread(path)
        if img is None:
            details.append({"t": t, "faces": 0, "score": 0.0, "unreadable": True})
            continue
        s, n, box = score_frame(detector, img)
        details.append({"t": t, "faces": n, "score": round(s, 5)})
        if best is None or s > best[0]:
            best = (s, n, box, t, path)
    if best is None:
        return None, details, True
    s, _, _, _, _ = best
    return best, details, s <= 0.0


def main() -> int:
    ap = argparse.ArgumentParser(description="Face-aware video thumbnail picker")
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--candidates", type=int, default=12)
    ap.add_argument("--det-thresh", type=float, default=0.3)
    ap.add_argument("--work-dir", default=None)
    args = ap.parse_args()

    if not os.path.exists(args.video):
        print(json.dumps({"ok": False, "error": "video not found"}))
        return 2

    from uniface.detection import SCRFD
    detector = SCRFD(confidence_threshold=args.det_thresh)

    with tempfile.TemporaryDirectory(prefix="pfx-face-", dir=args.work_dir) as work:
        dur = ffprobe_duration(args.video)
        times = candidate_times(dur, max(1, args.candidates))
        frames = extract_frames(args.video, times, work)
        if not frames:
            print(json.dumps({"ok": False, "error": "frame extraction failed"}))
            return 2
        (s, n, box, t, path), details, fallback = pick(detector, frames)

        outdir = os.path.dirname(os.path.abspath(args.out))
        if outdir:
            os.makedirs(outdir, exist_ok=True)
        shutil.copyfile(path, args.out)

    print(json.dumps({
        "ok": True,
        "fallback": fallback,
        "faces": n,
        "score": round(s, 5),
        "bbox": [round(float(v), 1) for v in box] if box else None,
        "timestamp": round(t, 1),
        "duration": round(dur, 1) if dur else None,
        "frames": details,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
