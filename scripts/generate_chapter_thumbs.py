#!/usr/bin/env python3
"""Pre-render thumbnails for existing chapters.

Uses the exact same logic as GET /api/timestamps/{id}/thumbnail so the app
serves these straight from its disk cache:
  time = midpoint of [seconds, end_seconds], else seconds + 2.0
  file = %LOCALAPPDATA%/PersonalFlix/chapter_thumbs/{id}_{ms}.jpg
  ffmpeg -y -v error -ss {t} -i video -frames:v 1 -q:v 4 -vf scale=320:-1 out

Usage:
  python scripts/generate_chapter_thumbs.py              # only missing thumbs
  python scripts/generate_chapter_thumbs.py --force       # regenerate all
  python scripts/generate_chapter_thumbs.py --limit 5     # trial run

Exit code: 0 = done, 2 = error.
"""

from __future__ import annotations

import argparse
import glob
import os
import sqlite3
import subprocess
import sys

DEFAULT_DB = r"C:\Users\pugal\AppData\Local\PersonalFlix\app.db"
DEFAULT_LIBRARY = r"P:\Personal\Porn"
FFMPEG = "ffmpeg"


def thumb_time(start: float, end) -> float:
    if end is not None and end > start:
        return max(0.0, (start + end) / 2.0)
    return max(0.0, start + 2.0)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Pre-render chapter thumbnails.")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--library", default=DEFAULT_LIBRARY)
    ap.add_argument("--force", action="store_true", help="Regenerate even if cached.")
    ap.add_argument("--limit", type=int, default=0, help="Only process N chapters.")
    args = ap.parse_args(argv)

    thumb_dir = os.path.join(os.environ["LOCALAPPDATA"], "PersonalFlix", "chapter_thumbs")
    os.makedirs(thumb_dir, exist_ok=True)

    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row
    cur = db.cursor()
    rows = cur.execute(
        "SELECT t.id, t.seconds, t.end_seconds, s.file_path FROM timestamps t "
        "LEFT JOIN scenes s ON s.id=t.scene_id ORDER BY t.id").fetchall()
    if args.limit > 0:
        rows = rows[:args.limit]

    done = skipped = failed = 0
    for r in rows:
        cid, start = r["id"], r["seconds"]
        end, fp = r["end_seconds"], r["file_path"]
        t = thumb_time(start, end)
        dest = os.path.join(thumb_dir, f"{cid}_{round(t * 1000)}.jpg")
        if os.path.exists(dest) and not args.force:
            skipped += 1
            continue
        if not fp:
            print(f"  [{cid}] no scene file, skipped")
            failed += 1
            continue
        p = fp[5:] if fp.lower().startswith("porn/") else fp
        video = os.path.join(args.library, *p.replace("\\", "/").split("/"))
        if not os.path.exists(video):
            print(f"  [{cid}] video missing on disk, skipped")
            failed += 1
            continue
        # Sweep stale renders for this chapter (same as the endpoint).
        for old in glob.glob(os.path.join(thumb_dir, f"{cid}_*.jpg")):
            if old != dest:
                try:
                    os.remove(old)
                except OSError:
                    pass
        cp = subprocess.run(
            [FFMPEG, "-y", "-v", "error", "-ss", str(t), "-i", video,
             "-frames:v", "1", "-q:v", "4", "-vf", "scale=320:-1", dest],
            capture_output=True, text=True)
        if cp.returncode != 0 or not os.path.exists(dest):
            print(f"  [{cid}] ffmpeg failed @ {t:.1f}s")
            try:
                os.remove(dest)
            except OSError:
                pass
            failed += 1
            continue
        done += 1
        print(f"  [{cid}] {os.path.basename(dest)} ({os.path.getsize(dest) // 1024} KB)")

    print(f"Done: {done} rendered, {skipped} already cached, {failed} failed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
