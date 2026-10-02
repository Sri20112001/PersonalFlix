#!/usr/bin/env python3
"""Merge duplicate studio rows: re-point their scenes, delete the loser.

Pairs (keeper first):
  mommys-girl  <- mommys-girl-alias   (15 + 14 scenes)
  sexart       <- sex-art             (8 + 6 scenes)
  lesbian-x    <- lesbianx            (18 + 10 scenes)

Files stay where they are (studio follows the row, not the folder).
Verified: no favorites reference the loser ids.

Usage:
  python scripts/merge_studios.py           # dry run
  python scripts/merge_studios.py --apply   # execute
"""

from __future__ import annotations

import argparse
import sqlite3

DEFAULT_DB = r"C:\Users\pugal\AppData\Local\PersonalFlix\app.db"
PAIRS = [
    ("mommys-girl", "mommys-girl-alias"),
    ("sexart", "sex-art"),
    ("lesbian-x", "lesbianx"),
]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Merge duplicate studio rows.")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)

    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row
    cur = db.cursor()
    for keep, lose in PAIRS:
        k = cur.execute("SELECT id, name FROM studios WHERE id=?", (keep,)).fetchone()
        l = cur.execute("SELECT id, name FROM studios WHERE id=?", (lose,)).fetchone()
        if k is None or l is None:
            print(f"  SKIP {lose} -> {keep} (row missing: keep={k is not None}, lose={l is not None})")
            continue
        n = cur.execute("SELECT COUNT(*) FROM scenes WHERE studio_id=?", (lose,)).fetchone()[0]
        fav = cur.execute("SELECT COUNT(*) FROM favorites WHERE type='studio' AND target_id=?",
                          (lose,)).fetchone()[0]
        print(f"  {'MERGE' if args.apply else 'PLAN'} {l['id']} ({l['name']}, {n} scenes) "
              f"-> {k['id']} ({k['name']}) favs={fav}")
        if not args.apply or fav:
            if fav:
                print("    BLOCKED: favorites reference the loser id")
            continue
        cur.execute("UPDATE scenes SET studio_id=?, studio=? WHERE studio_id=?",
                    (k["id"], k["name"], l["id"]))
        cur.execute("DELETE FROM studios WHERE id=?", (l["id"],))
        print(f"    moved {n} scenes, deleted row {l['id']}")
    if args.apply:
        db.commit()
        left = cur.execute("SELECT COUNT(*) FROM studios").fetchone()[0]
        print(f"Done. studios now: {left}")
    else:
        print("Dry run. Re-run with --apply to execute.")
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
