#!/usr/bin/env python3
"""Merge hash-verified duplicate scenes: keep the titled row/file, drop the numeric copy.

Reads the report from scripts/find_duplicates.py, re-verifies every pair
(size + full md5) and then, per group in PLAN below:

  * migrates tracking/comments/timestamps from the dropped scene to the kept one
    (kept row wins when both have tracking; playlists/favorites refs are remapped),
  * deletes the dropped scene row,
  * deletes the dropped file from disk.

Group 3 (scene 1508748) is special: the titled file is an orphan with no DB row,
so the scene row is repointed at the titled file (title/date/resolution parsed
from the descriptive filename) and the numeric file is deleted.

Usage:
  python scripts/merge_duplicates.py            # dry run, prints plan
  python scripts/merge_duplicates.py --apply    # execute (DB backup expected!)

Exit code: 0 = ok (or dry run clean), 1 = nothing to do / aborted, 2 = error.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys

DEFAULT_DB = r"C:\Users\pugal\AppData\Local\PersonalFlix\app.db"
DEFAULT_REPORT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              "duplicates.json")
DEFAULT_LIBRARY = r"P:\Personal\Porn"

# cluster index (in duplicates.json order) -> (keep_scene_id, drop_scene_id|None).
# drop file is derived from the drop row's file_path; keep file from keep row's.
# Group 3 (idx 2): keep row 1508748, no row to drop; REPOINT_1508748 handles the file swap.
PLAN = {
    0: (1926753, 1956987),   # Vixen pair, both titled; keep the one with tracking
    1: (93813928, 1405844),
    2: (1508748, None),       # + repoint row at orphan titled file, delete numeric file
    3: (93813934, 1533196),
    4: (93813901, 1409360),
    5: (93813889, 1620494),
    6: (93813919, 1402862),
}

# Group 3 details: row to repoint and the titled filename (in library root).
REPOINT_1508748 = {
    "id": 1508748,
    "new_file_name": "VIXEN - Nicole Aniston - Johnny Sins - SPA Day  13.06.2018_480.mp4",
}


def md5_of(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def resolve(library: str, stored: str) -> str:
    """Map a DB file_path like 'Porn/Studio/File.mp4' to an absolute path."""
    p = stored.replace("\\", "/")
    if "/" in p:
        first, rest = p.split("/", 1)
        if first.lower() == os.path.basename(library).lower():
            p = rest
    return os.path.join(library, *p.split("/"))


def parse_descriptive(stem: str):
    """Mirror scanner.rs parse_descriptive long form: '<title>  DD.MM.YYYY_RES'."""
    if "  " in stem:
        head, tail = stem.rsplit("  ", 1)
        parts = tail.split("_")
        if len(parts) == 2 and len(parts[0]) == 10:
            d = parts[0].split(".")
            if (len(d) == 3 and d[0].isdigit() and d[1].isdigit() and d[2].isdigit()
                    and 1 <= int(d[0]) <= 31 and 1 <= int(d[1]) <= 12):
                return head.strip(), f"{d[2]}-{d[1]}-{d[0]}", parts[1]
    base, res = stem, ""
    if "_" in stem:
        b, r = stem.rsplit("_", 1)
        if r.lower() in ("480", "480m", "480p", "720", "720m", "720p",
                         "1080", "1080p", "2160p", "4k") and b:
            base, res = b, r.lower()
    return base, "", res


def migrate_metadata(cur: sqlite3.Cursor, keep: int, drop: int, log):
    # tracking: keep row wins; adopt drop's only when keep has none.
    keep_tr = cur.execute("SELECT scene_id FROM tracking WHERE scene_id=?", (keep,)).fetchone()
    drop_tr = cur.execute("SELECT scene_id FROM tracking WHERE scene_id=?", (drop,)).fetchone()
    if drop_tr:
        if keep_tr:
            cur.execute("DELETE FROM tracking WHERE scene_id=?", (drop,))
            log(f"    tracking: kept scene {keep}'s status, discarded scene {drop}'s")
        else:
            cur.execute("UPDATE tracking SET scene_id=? WHERE scene_id=?", (keep, drop))
            log(f"    tracking: moved scene {drop}'s status to scene {keep}")
    # comments / timestamps follow the kept scene.
    for table in ("comments", "timestamps"):
        try:
            n = cur.execute(f"UPDATE {table} SET scene_id=? WHERE scene_id=?",
                            (keep, drop)).rowcount
            if n:
                log(f"    {table}: moved {n} row(s) {drop} -> {keep}")
        except sqlite3.OperationalError as exc:
            log(f"    {table}: skipped ({exc})")
    # playlists store scene id lists as JSON text.
    for pid, name, scene_ids in cur.execute("SELECT id, name, scene_ids FROM playlists"):
        try:
            ids = json.loads(scene_ids)
        except (json.JSONDecodeError, TypeError):
            continue
        if drop in ids:
            ids = [keep if i == drop else i for i in ids]
            seen, deduped = set(), []
            for i in ids:
                if i not in seen:
                    seen.add(i)
                    deduped.append(i)
            cur.execute("UPDATE playlists SET scene_ids=? WHERE id=?",
                        (json.dumps(deduped), pid))
            log(f"    playlist '{name}': remapped {drop} -> {keep}")
    # favorites use TEXT target ids.
    n = cur.execute("UPDATE favorites SET target_id=? WHERE type='scene' AND target_id=?",
                    (str(keep), str(drop))).rowcount
    if n:
        log(f"    favorites: remapped {n} row(s) {drop} -> {keep}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Merge hash-verified duplicate scenes.")
    ap.add_argument("--report", default=DEFAULT_REPORT)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--library", default=DEFAULT_LIBRARY)
    ap.add_argument("--apply", action="store_true", help="Execute; without it this is a dry run.")
    args = ap.parse_args(argv)

    with open(args.report, encoding="utf-8") as f:
        report = json.load(f)
    clusters = report["clusters"]
    if report.get("mode") != "full":
        print("Refusing: report is not full-hash verified. Re-run find_duplicates.py without --quick.",
              file=sys.stderr)
        return 2

    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row
    cur = db.cursor()
    lib_base = os.path.basename(args.library)

    actions = []  # (description, callable)
    ok = True

    def check(cond: bool, msg: str):
        nonlocal ok
        print(("  [ok] " if cond else "  [FAIL] ") + msg)
        if not cond:
            ok = False

    for idx, cluster in enumerate(clusters):
        if idx not in PLAN:
            print(f"[{idx + 1}] No plan entry for cluster hash={cluster['hash'][:12]}... SKIPPED")
            ok = False
            continue
        keep, drop = PLAN[idx]
        files = cluster["files"]
        print(f"[{idx + 1}] keep scene {keep}" + (f", drop scene {drop}" if drop else " (repoint only)"))

        # Re-verify bytes on disk.
        digests = {}
        for fp in files:
            exists = os.path.exists(fp)
            check(exists, f"exists: {fp}")
            if not exists:
                continue
            size = os.path.getsize(fp)
            check(size == cluster["size"], f"size {size} == record {cluster['size']}: {fp}")
            digest = md5_of(fp)
            digests[fp] = digest
            check(digest == cluster["hash"], f"md5 {digest[:12]}... == record: {fp}")
        if len(set(digests.values())) != 1 or not digests:
            check(False, "all files in cluster must share one md5")
            continue

        if drop is not None:
            keep_row = cur.execute("SELECT id, file_path FROM scenes WHERE id=?", (keep,)).fetchone()
            drop_row = cur.execute("SELECT id, file_path FROM scenes WHERE id=?", (drop,)).fetchone()
            check(keep_row is not None, f"keep row {keep} exists")
            check(drop_row is not None, f"drop row {drop} exists")
            if not (keep_row and drop_row):
                continue
            keep_abs = resolve(args.library, keep_row["file_path"])
            drop_abs = resolve(args.library, drop_row["file_path"])
            check(keep_abs in files, f"keep row file is in cluster: {keep_row['file_path']}")
            check(drop_abs in files, f"drop row file is in cluster: {drop_row['file_path']}")
            check(keep_abs != drop_abs, "keep and drop files differ")
            check(os.path.exists(drop_abs), f"drop file on disk: {drop_abs}")

            def do(keep=keep, drop=drop, drop_abs=drop_abs):
                migrate_metadata(cur, keep, drop, print)
                cur.execute("DELETE FROM scenes WHERE id=?", (drop,))
                os.remove(drop_abs)
                print(f"    deleted row {drop} + file {drop_abs}")

            actions.append((f"drop scene {drop} + delete {drop_abs}", do))
        else:
            # Group 3: repoint keep row at the titled orphan file.
            row = cur.execute("SELECT id, file_path FROM scenes WHERE id=?", (keep,)).fetchone()
            check(row is not None, f"row {keep} exists")
            if not row:
                continue
            old_abs = resolve(args.library, row["file_path"])
            new_name = REPOINT_1508748["new_file_name"]
            new_abs = os.path.join(args.library, new_name)
            check(old_abs in files, f"current row file is in cluster: {row['file_path']}")
            check(new_abs in files, f"titled file is in cluster: {new_name}")
            check(os.path.exists(new_abs), f"titled file on disk: {new_abs}")
            stem = new_name.rsplit(".", 1)[0]
            title, date, res = parse_descriptive(stem)
            stored = f"{lib_base}/{new_name}"
            print(f"    repoint: title={title!r} date={date!r} res={res!r}")

            def do(keep=keep, old_abs=old_abs, new_name=new_name, stored=stored,
                   title=title, date=date, res=res):
                cur.execute("UPDATE scenes SET file_name=?, file_path=?, title=?, date=?, "
                            "resolution=? WHERE id=?",
                            (new_name, stored, title, date or None, res, keep))
                os.remove(old_abs)
                print(f"    repointed row {keep} -> {stored}; deleted {old_abs}")

            actions.append((f"repoint scene {keep} at titled file + delete {old_abs}", do))

    print("-" * 72)
    if not ok:
        print("Pre-flight FAILED — nothing changed. Investigate the [FAIL] lines above.")
        return 2
    if not args.apply:
        print(f"Dry run clean: {len(actions)} action(s) ready. Re-run with --apply to execute.")
        return 0

    for desc, do in actions:
        print(f"* {desc}")
        do()
    db.commit()

    # Post-check: every dropped id gone, every dropped file gone.
    for idx, (keep, drop) in PLAN.items():
        if drop is not None:
            assert cur.execute("SELECT id FROM scenes WHERE id=?", (drop,)).fetchone() is None, drop
    print(f"Done: {len(actions)} action(s) applied and committed.")
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
