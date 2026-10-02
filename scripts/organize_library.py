#!/usr/bin/env python3
"""Organize loose library-root files: `<Studio> - rest DATE_RES.ext`.

For every video file sitting directly in the library root whose name starts
with "<Studio> - ":
  * strip the studio prefix,
  * move it into the studio's folder (created when missing),
  * create the scene row (fresh files) or update the placeholder row left by
    the last library scan — title/date/resolution parsed exactly like the
    Rust scanner (`parse_descriptive`), studio linked, performers NEVER
    inferred (mapping invariants).

Studios resolve by exact (case-insensitive) name, then by normalized match
(punctuation/spacing-insensitive, only when unambiguous), then by explicit
OVERRIDES below. Unknown studios are created along with their folder.

Usage:
  python scripts/organize_library.py              # dry run, prints plan
  python scripts/organize_library.py --apply      # execute

Exit code: 0 = clean (or dry run), 1 = nothing to do / items skipped, 2 = error.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
import time

DEFAULT_DB = r"C:\Users\pugal\AppData\Local\PersonalFlix\app.db"
DEFAULT_LIBRARY = r"P:\Personal\Porn"
VIDEO_EXTS = (".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v", ".wmv", ".flv", ".ts")

# Prefix quirks that plain "<Studio> - " matching cannot express:
#   raw leading token -> (studio display name, text to strip from the front).
OVERRIDES = {
    "team skeet x series": ("Team Skeet", "Team Skeet X Series - "),
}

RESOLUTIONS = ["2160p", "4k", "1440p", "1080p", "1080", "720p", "720m", "720",
               "480p", "480m", "480"]


def detect_resolution(name: str) -> str:
    lower = name.lower()
    for r in RESOLUTIONS:
        if r in lower:
            return r
    return ""


def parse_descriptive(stem: str):
    """Mirror scanner.rs parse_descriptive: (title, date_iso, resolution)."""
    if "  " in stem:
        head, tail = stem.rsplit("  ", 1)
        t = tail.split("_")
        if len(t) == 2 and len(t[0]) == 10:
            d = t[0].split(".")
            if (len(d) == 3 and all(p.isdigit() for p in d)
                    and len(d[0]) == 2 and len(d[1]) == 2 and len(d[2]) == 4
                    and 1 <= int(d[0]) <= 31 and 1 <= int(d[1]) <= 12):
                res = detect_resolution(t[1]) or t[1]
                return head.strip(), f"{d[2]}-{d[1]}-{d[0]}", res
    if "_" in stem:
        b, r = stem.rsplit("_", 1)
        if detect_resolution(r) and b:
            return b, "", detect_resolution(r)
    return stem, "", detect_resolution(stem)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def load_studios(cur):
    return [(r[0], r[1]) for r in cur.execute("SELECT id, name FROM studios")]


def resolve_studio(stem: str, studios, folders):
    """Return (studio_id|None, studio_name|None, folder|None, stripped_stem|None).

    Longest "<name> - " prefix wins; falls back to normalized match and
    OVERRIDES. Returns Nones when nothing matches.
    """
    low = stem.lower()
    for key, (sname, strip) in OVERRIDES.items():
        if low.startswith(key.lower() + " - "):
            rest = stem[len(strip):] if stem.startswith(strip) else stem
            return match_studio_name(sname, studios, folders, rest, stem)
    cands = []
    for _sid, sname in studios:
        if low.startswith(sname.lower() + " - "):
            cands.append((len(sname), sname))
    for f in folders:
        if low.startswith(f.lower() + " - ") and not any(
                c[1].lower() == f.lower() for c in cands):
            cands.append((len(f), f))
    if not cands:
        # Head-token fallback: "Dad Crush - ..." matches studio DadCrush by
        # normalized name; brand-new prefixes ("Passion HD") become a studio
        # row + folder of their own.
        if " - " in stem:
            head, rest = stem.split(" - ", 1)
            hits = [(i, n) for i, n in studios if norm(n) == norm(head)]
            if len(hits) == 1:
                return match_studio_name(hits[0][1], studios, folders, rest, stem)
            for f in folders:
                if norm(f) == norm(head):
                    return match_studio_name(f, studios, folders, rest, stem)
            if not hits:
                return None, head, head, rest
        return None, None, None, None
    cands.sort()
    sname = cands[-1][1]
    rest = stem[len(sname) + 3:]
    return match_studio_name(sname, studios, folders, rest, stem)


def match_studio_name(sname, studios, folders, rest, stem):
    sid = sname_out = folder = None
    for i, n in studios:
        if n.lower() == sname.lower():
            sid, sname_out = i, n
            break
    if sid is None:
        hits = [(i, n) for i, n in studios if norm(n) == norm(sname)]
        if len(hits) == 1:
            sid, sname_out = hits[0]
    if sid is None:
        sid, sname_out = None, sname  # caller creates the studio row
    for f in folders:
        if f.lower() == (sname_out or sname).lower():
            folder = f
            break
    if folder is None:
        folder = sname_out or sname  # caller creates the folder
    return sid, sname_out or sname, folder, rest


def looks_fresh_placeholder(row) -> bool:
    if row is None:
        return True
    rid = row["id"]
    if isinstance(rid, int) and rid >= 90000000:
        return True
    title = (row["title"] or "")
    fname = (row["file_name"] or "")
    stem = fname.rsplit(".", 1)[0] if "." in fname else fname
    return title in ("", stem) or title.startswith("Unknown (")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Organize studio-prefixed root files.")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--library", default=DEFAULT_LIBRARY)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)

    lib = args.library
    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row
    cur = db.cursor()
    studios = load_studios(cur)
    folders = sorted(d for d in os.listdir(lib)
                     if os.path.isdir(os.path.join(lib, d)) and d != "netflix-app")

    plans, skips = [], []
    for fn in sorted(os.listdir(lib)):
        src = os.path.join(lib, fn)
        if not os.path.isfile(src) or not fn.lower().endswith(VIDEO_EXTS):
            continue
        stem = fn.rsplit(".", 1)[0]
        if re.match(r"^\d{5,}", stem):
            continue  # numeric files belong to the scanner, not the organizer
        sid, sname, folder, rest = resolve_studio(stem, studios, folders)
        if rest is None:
            skips.append((fn, "no studio/folder match"))
            continue
        row = cur.execute("SELECT * FROM scenes WHERE file_name=?", (fn,)).fetchone()
        if row is not None:
            fp = (row["file_path"] or "").replace("\\", "/")
            if fp != f"Porn/{fn}" and fp != fn:
                skips.append((fn, f"row {row['id']} points elsewhere ({fp})"))
                continue
            if not looks_fresh_placeholder(row):
                skips.append((fn, f"row {row['id']} is a curated scene, left alone"))
                continue
        ext = "." + fn.rsplit(".", 1)[1]
        new_name = rest + ext
        title, date, res = parse_descriptive(rest)
        plans.append({"src": src, "old": fn, "new": new_name, "rest": rest,
                      "folder": folder, "studio_id": sid, "studio_name": sname,
                      "title": title, "date": date, "res": res, "row": row})

    print(f"root studio-prefixed files to organize: {len(plans)}, skipped: {len(skips)}")
    for fn, why in skips:
        print(f"  SKIP {fn} ({why})")
    for p in plans:
        print(f"  {'MOVE' if args.apply else 'PLAN'} {p['old']}")
        print(f"      -> {p['folder']}/{p['new']}  title={p['title']!r} date={p['date']!r} "
              f"res={p['res']!r} studio={p['studio_name']!r} row="
              f"{p['row']['id'] if p['row'] is not None else 'NEW'}")
    if not args.apply:
        print("Dry run clean. Re-run with --apply to execute.")
        return 0 if plans else 1

    lib_base = os.path.basename(lib.rstrip(os.sep))
    for p in plans:
        dest_dir = os.path.join(lib, p["folder"])
        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, p["new"])
        if os.path.exists(dest):
            print(f"  CONFLICT target exists, skipped: {dest}")
            continue
        # Ensure the studio row exists.
        if p["studio_id"] is None:
            new_id = re.sub(r"[^a-z0-9]+", "-", p["studio_name"].lower()).strip("-")
            cur.execute("INSERT OR IGNORE INTO studios(id, name) VALUES(?, ?)",
                        (new_id, p["studio_name"]))
            p["studio_id"] = new_id
            studios.append((new_id, p["studio_name"]))
            print(f"  studio row created: {new_id} / {p['studio_name']}")
        st = os.stat(p["src"])
        stored = f"{lib_base}/{p['folder']}/{p['new']}"
        if p["row"] is not None:
            cur.execute(
                "UPDATE scenes SET file_name=?, original_name=?, file_path=?, title=?, "
                "date=?, resolution=?, studio=?, studio_id=?, file_exists=1, "
                "size_bytes=?, mtime=? WHERE id=?",
                (p["new"], p["rest"], stored, p["title"], p["date"] or None, p["res"],
                 p["studio_name"], p["studio_id"], st.st_size, st.st_mtime,
                 p["row"]["id"]))
        else:
            cur.execute(
                "INSERT INTO scenes(file_name, original_name, title, file_path, "
                "resolution, studio, studio_id, date, file_exists, size_bytes, mtime) "
                "VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
                (p["new"], p["rest"], p["title"], stored, p["res"], p["studio_name"],
                 p["studio_id"], p["date"] or None, st.st_size, st.st_mtime))
        shutil.move(p["src"], dest)
        print(f"  done row={p['row']['id'] if p['row'] is not None else 'new'} -> {stored}")
    db.commit()
    # Show the JSON we stored for one row as a sanity sample.
    print("Done.")
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
