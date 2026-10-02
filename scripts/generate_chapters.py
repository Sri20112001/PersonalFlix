#!/usr/bin/env python3
"""Auto-create chapters for videos that have none.

Method: ffmpeg scene-cut detection over the full file, then keep the
strongest cuts that are at least --min-gap apart (capped at --max-chapters).
With --method ai, boundaries come from CLIP embedding change detection
instead (semantic cuts: new room/position/light, not just pixel jumps) —
needs torch+open_clip, so run it with the video-analysis venv python:
  D:\\Pugal.Sri Ganesh\\Programs\\React\\video-analysis\\server\\.venv\\Scripts\\python.exe scripts/generate_chapters.py --method ai --apply --limit 3
Each chapter spans until the next one, so thumbnails land on real content.
Labels are generic ("Chapter 1"...) — rename in the app's chapter editor.

Only scenes with zero chapters are touched (unless --force). Full decode per
video, so work in batches: --limit N and/or --scene ID [ID ...].

Usage:
  python scripts/generate_chapters.py                        # dry run, first 5
  python scripts/generate_chapters.py --apply --limit 3      # do 3 videos
  python scripts/generate_chapters.py --apply --scene 1405284
  python scripts/generate_chapters.py --apply --force --scene 1859450

Exit code: 0 = done, 2 = error.
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone

DEFAULT_DB = r"C:\Users\pugal\AppData\Local\PersonalFlix\app.db"
DEFAULT_LIBRARY = r"P:\Personal\Porn"
FFMPEG = "ffmpeg"

PTS_RE = re.compile(r"pts_time:([0-9.]+)")
SCORE_RE = re.compile(r"lavfi\.scene_score=([0-9.]+)")


def detect_cuts(video: str, threshold: float):
    """Return [(pts_seconds, score)] for frames above the scene threshold."""
    cp = subprocess.run(
        [FFMPEG, "-v", "info", "-i", video, "-filter:v",
         f"select='gt(scene,{threshold})',metadata=print", "-f", "null", "-"],
        capture_output=True, text=True)
    cuts = []
    pending_ts = None
    for line in (cp.stderr or "").splitlines():
        m = PTS_RE.search(line)
        if m:
            try:
                pending_ts = float(m.group(1))
            except ValueError:
                pending_ts = None
            continue
        m = SCORE_RE.search(line)
        if m and pending_ts is not None:
            try:
                cuts.append((pending_ts, float(m.group(1))))
            except ValueError:
                pass
            pending_ts = None
    return cuts


def pick_chapters(cuts, min_gap: float, max_chapters: int, duration: float):
    """Strongest cuts first, min_gap apart; always start at 0."""
    ranked = sorted(cuts, key=lambda c: -c[1])
    starts = [0.0]
    for t, _s in ranked:
        if len(starts) - 1 >= max_chapters:
            break
        if t < min_gap:
            continue
        if duration and t > duration - min_gap:
            continue
        if all(abs(t - s) >= min_gap for s in starts):
            starts.append(t)
    return sorted(starts)


def probe_duration(video: str) -> float:
    cp = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", video], capture_output=True, text=True)
    try:
        return float((cp.stdout or "").strip())
    except ValueError:
        return 0.0


def detect_ai(video: str, scene_id: int, model_name: str, min_gap: float,
              max_chapters: int):
    """CLIP semantic boundaries: 1fps frames embedded, change-point peaks.

    Requires torch + open_clip (run with the video-analysis venv python).
    Returns sorted start-second list including 0.
    """
    try:
        import numpy as np
        import torch
        import open_clip
        from PIL import Image
    except ImportError:
        print("  --method ai needs torch+open_clip. Run with the video-analysis venv:")
        print(r"  D:\Pugal.Sri Ganesh\Programs\React\video-analysis\server\.venv\Scripts\python.exe"
              " scripts/generate_chapters.py --method ai [...]")
        return None
    work = os.path.join(os.environ.get("TEMP", os.path.expanduser("~")),
                        "opencode", "ai_chapters", f"frames_{scene_id}")
    os.makedirs(work, exist_ok=True)
    if not os.listdir(work):
        cp = subprocess.run(
            [FFMPEG, "-y", "-v", "error", "-i", video, "-vf",
             "fps=1,scale=320:-1", os.path.join(work, "f%06d.jpg")],
            capture_output=True, text=True)
        if cp.returncode != 0:
            print("  frame extraction failed")
            return None
    fps = sorted(f for f in os.listdir(work) if f.endswith(".jpg"))
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, _, preprocess = open_clip.create_model_and_transforms(
        model_name, pretrained="openai", device=device)
    model.eval()
    embs = []
    with torch.no_grad():
        for i in range(0, len(fps), 128):
            imgs = [preprocess(Image.open(os.path.join(work, f)).convert("RGB"))
                    for f in fps[i:i + 128]]
            x = torch.stack(imgs).to(device)
            e = model.encode_image(x)
            embs.append((e / e.norm(dim=-1, keepdim=True)).cpu().numpy())
    E = np.concatenate(embs)
    change = 1.0 - (E[:-1] * E[1:]).sum(axis=1)
    thresh = change.mean() + 1.5 * change.std()
    cands = sorted(((i + 1, float(change[i])) for i in range(len(change))
                    if change[i] > thresh), key=lambda c: -c[1])
    starts = [0]
    for idx, _score in cands:
        if len(starts) - 1 >= max_chapters:
            break
        if all(abs(idx - s) >= min_gap for s in starts):
            starts.append(idx)
    return sorted(starts)


# Zero-shot chapter categories: (CLIP label, app category). Themean probability
# across 3 span frames picks the dominant theme; applied only above
# DESCRIBE_CONF, otherwise the chapter stays main (mixed spans stay honest).
DESCRIBE_LABELS = [
    ("interview or dialogue scene", "main"),
    ("kissing and foreplay", "main"),
    ("oral sex scene", "oral"),
    ("group sex scene", "main"),
    ("solo woman posing", "solo"),
    ("outdoor scene", "main"),
    ("massage scene", "main"),
]
DESCRIBE_CONF = 0.45


def describe_spans(video: str, spans, model_name: str):
    """Vote a category per chapter from frames at 25/50/75% of its span."""
    import torch
    import open_clip
    from PIL import Image
    import tempfile
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, _, preprocess = open_clip.create_model_and_transforms(
        model_name, pretrained="openai", device=device)
    model.eval()
    tok = open_clip.get_tokenizer(model_name)
    with torch.no_grad():
        text = tok([label for label, _ in DESCRIBE_LABELS]).to(device)
        tf = model.encode_text(text)
        tf = tf / tf.norm(dim=-1, keepdim=True)
        cats = []
        with tempfile.TemporaryDirectory() as tmp:
            for st, en in spans:
                votes = []
                for frac in (0.25, 0.5, 0.75):
                    t = st if en is None else st + (en - st) * frac
                    fp = os.path.join(tmp, "d.jpg")
                    subprocess.run(
                        [FFMPEG, "-y", "-v", "error", "-ss", str(round(t, 1)),
                         "-i", video, "-frames:v", "1", "-vf", "scale=320:-1", fp],
                        capture_output=True)
                    if not os.path.exists(fp):
                        continue
                    img = preprocess(Image.open(fp).convert("RGB")).unsqueeze(0).to(device)
                    f = model.encode_image(img)
                    f = f / f.norm(dim=-1, keepdim=True)
                    probs = (100.0 * (f @ tf.T)).softmax(dim=-1).cpu().tolist()[0]
                    votes.append(probs)
                if not votes:
                    cats.append("main")
                    continue
                # Dominant theme = highest mean probability across span frames.
                means = [sum(p[j] for p in votes) / len(votes)
                         for j in range(len(DESCRIBE_LABELS))]
                best = max(range(len(means)), key=lambda j: means[j])
                cats.append(DESCRIBE_LABELS[best][1] if means[best] >= DESCRIBE_CONF else "main")
    return cats


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Auto-create chapters from scene cuts.")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--library", default=DEFAULT_LIBRARY)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--force", action="store_true", help="Also redo scenes that have chapters.")
    ap.add_argument("--scene", type=int, nargs="*", default=[], help="Only these scene ids.")
    ap.add_argument("--limit", type=int, default=5)
    ap.add_argument("--threshold", type=float, default=0.35, help="Scene-cut sensitivity.")
    ap.add_argument("--min-gap", type=float, default=90.0, help="Min seconds between chapters.")
    ap.add_argument("--max-chapters", type=int, default=10)
    ap.add_argument("--method", choices=["cuts", "ai"], default="cuts",
                    help="cuts: ffmpeg pixel scene detection (fast). ai: CLIP semantic "
                         "segmentation (needs torch+open_clip, use the video-analysis venv).")
    ap.add_argument("--ai-gap", type=float, default=75.0, help="Min seconds between AI chapters.")
    ap.add_argument("--ai-model", default="ViT-B-32",
                    help="OpenCLIP model for --method ai (weights shared via HF_HOME).")
    ap.add_argument("--describe", action="store_true",
                    help="Zero-shot label each chapter's category with CLIP (dominant "
                         "theme across 3 span frames, applied above 0.45 mean "
                         "confidence; needs torch+open_clip like --method ai).")
    args = ap.parse_args(argv)
    if args.describe:
        try:
            import torch
            import open_clip
            from PIL import Image
        except ImportError:
            print("  --describe needs torch+open_clip. Run with the video-analysis venv:")
            print(r"  D:\Pugal.Sri Ganesh\Programs\React\video-analysis\server\.venv\Scripts\python.exe"
                  " scripts/generate_chapters.py --describe [...]")
            return 2

    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row
    cur = db.cursor()
    if args.scene:
        ph = ",".join("?" * len(args.scene))
        scenes = cur.execute(
            f"SELECT id, file_path FROM scenes WHERE id IN ({ph})", args.scene).fetchall()
    else:
        scenes = cur.execute(
            "SELECT s.id, s.file_path FROM scenes s LEFT JOIN timestamps t "
            "ON t.scene_id=s.id WHERE s.file_exists=1 AND s.file_path IS NOT NULL "
            "GROUP BY s.id HAVING COUNT(t.id)=0 ORDER BY s.id LIMIT ?",
            (args.limit,)).fetchall()
    if args.force and not args.scene:
        scenes = cur.execute(
            "SELECT id, file_path FROM scenes WHERE file_exists=1 AND file_path IS NOT NULL "
            "ORDER BY id LIMIT ?", (args.limit,)).fetchall()

    print(f"scenes to process: {len(scenes)}")
    total_added = 0
    for s in scenes:
        sid = s["id"]
        fp = s["file_path"] or ""
        p = fp[5:] if fp.lower().startswith("porn/") else fp
        video = os.path.join(args.library, *p.replace("\\", "/").split("/"))
        if not os.path.exists(video):
            print(f"  [{sid}] video missing, skipped")
            continue
        duration = probe_duration(video)
        if args.method == "ai":
            starts = detect_ai(video, sid, args.ai_model, args.ai_gap,
                               args.max_chapters)
            if starts is None:
                return 2
            print(f"  [{sid}] AI semantic chapters: {starts} "
                  f"({duration / 60:.1f} min video)")
        else:
            cuts = detect_cuts(video, args.threshold)
            starts = pick_chapters(cuts, args.min_gap, args.max_chapters, duration)
            print(f"  [{sid}] {len(cuts)} cuts -> {len(starts)} chapters "
                  f"({duration / 60:.1f} min video)")
        if len(starts) <= 1:
            print(f"    only the opening found; skipped (raise --threshold? no: lower it)")
            continue
        spans = []
        for i, st in enumerate(starts):
            en = starts[i + 1] if i + 1 < len(starts) else None
            spans.append((st, en))
        cats = describe_spans(video, spans, args.ai_model) if args.describe else ["main"] * len(spans)
        for i, ((st, en), cat) in enumerate(zip(spans, cats)):
            print(f"    ch{i + 1} [{cat}]: {st:.1f}s -> {('%.1f' % en) + 's' if en else 'end'}")
        if not args.apply:
            continue
        if args.force:
            cur.execute("DELETE FROM timestamps WHERE scene_id=?", (sid,))
        now = datetime.now(timezone.utc).isoformat()
        for i, ((st, en), cat) in enumerate(zip(spans, cats)):
            cur.execute(
                "INSERT INTO timestamps(scene_id, seconds, label, end_seconds, "
                "category, created_at, performer_ids) VALUES(?, ?, ?, ?, ?, ?, '[]')",
                (sid, round(st, 3), f"Chapter {i + 1}", en and round(en, 3), cat, now))
            total_added += 1
        db.commit()
        print(f"    inserted {len(spans)} chapters")
    if not args.apply:
        print("Dry run. Re-run with --apply to write chapters.")
    else:
        print(f"Done: {total_added} chapters added.")
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
