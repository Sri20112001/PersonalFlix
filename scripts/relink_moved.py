#!/usr/bin/env python3
"""Re-link scenes whose video files were moved by hand.

For every scene with a recorded file_path:
  * resolves (strip the leading "Porn/" prefix, join to library root);
    if present -> refresh file_exists/size_bytes/mtime.
  * if missing -> search the whole library by basename; exactly one hit
    relinks the row (file_path/file_name/size/mtime/file_exists).
    Zero hits -> flagged missing (file_exists=0). Multiple hits ->
    conflict, left alone for review.

Mirrors the Rust scanner's matching (basename + stored/rel path forms)
without creating new rows or moving files.

Usage:
  python scripts/relink_moved.py                 # dry run
  python scripts/relink_moved.py --apply         # write DB

Exit code: 0 = done, 2 = error.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys

DEFAULT_DB = r"C:\Users\pugal\AppData\Local\PersonalFlix\app.db"
DEFAULT_LIBRARY = r"P:\Personal\Porn"
SKIP_DIRS = {"netflix-app", ".git"}


def resolve(library: str, stored: str) -> str:
    p = (stored or "").replace("\\", "/")
    first, _, rest = p.partition("/")
    if rest and first.lower() == os.path.basename(library).lower():
        p = rest
    return os.path.join(library, *p.split("/"))


def stored_for(library: str, abs_path: str) -> str:
    rel = os.path.relpath(abs_path, library).replace("\\", "/")
    return f"{os.path.basename(library)}/{rel}"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Re-link manually moved video files.")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--library", default=DEFAULT_LIBRARY)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)

    lib, base = args.library, os.path.basename(args.library)

    # One walk: basename-lower -> [(abs path, size, mtime)].
    by_name: dict[str, list] = {}
    n_files = 0
    for dirpath, dirnames, filenames in os.walk(lib):
        dirnames[:] = sorted(d for d in dirnames
                             if d not in SKIP_DIRS and not d.startswith("."))
        for fn in filenames:
            fp = os.path.join(dirpath, fn)
            try:
                st = os.stat(fp)
            except OSError:
                continue
            n_files += 1
            by_name.setdefault(fn.lower(), []).append((fp, st.st_size, st.st_mtime))
    print(f"[*] indexed {n_files} files on disk")

    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row
    cur = db.cursor()
    scenes = cur.execute(
        "SELECT id, title, file_name, file_path, file_exists, size_bytes "
        "FROM scenes ORDER BY id").fetchall()

    ok, relinked, missing, conflicts = 0, [], [], []
    for s in scenes:
        sid = s["id"]
        fp = s["file_path"] or ""
        if not fp:
            continue
        if os.path.exists(resolve(lib, fp)):
            ok += 1
            if args.apply:
                st = os.stat(resolve(lib, fp))
                cur.execute("UPDATE scenes SET file_exists=1, size_bytes=?, mtime=? "
                            "WHERE id=?", (st.st_size, st.st_mtime, sid))
            continue
        keys = {os.path.basename(fp).lower()}
        if s["file_name"]:
            keys.add(s["file_name"].lower())
        hits: dict[str, tuple] = {}
        for k in keys:
            for h in by_name.get(k, []):
                hits[h[0]] = h
        if len(hits) == 1:
            path, size, mtime = next(iter(hits.values()))
            relinked.append((sid, fp, stored_for(lib, path)))
            if args.apply:
                cur.execute(
                    "UPDATE scenes SET file_path=?, file_name=?, file_exists=1, "
                    "size_bytes=?, mtime=? WHERE id=?",
                    (stored_for(lib, path), os.path.basename(path), size, mtime, sid))
        elif not hits:
            missing.append((sid, fp))
            if args.apply:
                cur.execute("UPDATE scenes SET file_exists=0 WHERE id=?", (sid,))
        else:
            conflicts.append((sid, fp, sorted(hits)))
    if args.apply:
        db.commit()

    print(f"[*] {ok} already resolve, {len(relinked)} relinked, "
          f"{len(missing)} still missing, {len(conflicts)} conflicts")
    for sid, old, new in relinked:
        print(f"  LINK scene {sid}:\n    {old}\n    -> {new}")
    for sid, fp in missing:
        print(f"  MISSING scene {sid}: {fp}")
    for sid, fp, hs in conflicts:
        print(f"  CONFLICT scene {sid}: {fp} matches {len(hs)} files")
        for h in hs[:5]:
            print(f"    - {h}")
    if not args.apply:
        print("Dry run clean. Re-run with --apply to write the DB.")
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
