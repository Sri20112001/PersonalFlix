#!/usr/bin/env python3
"""Apply instruction-notes left as scene comments, then delete the ones done.

Understood instruction shapes (case-insensitive):
  * "title is X" / "the title is X"  -> SET scenes.title = X (verbatim).
  * "need (a) data for|on NAMES"     -> link performer NAMES to the scene,
    creating stub performer rows (name-only, enrichable later) when missing.
    A remainder naming a studio ("... studio", "Bang Bros") is routed to the
    studio flow instead.
  * "need studio data for X"         -> set the scene's studio (created when
    missing).

Comments that contain no executable instruction are kept and reported.

Usage:
  python scripts/apply_notes.py           # dry run, prints plan
  python scripts/apply_notes.py --apply   # execute (deletes executed notes)

Exit code: 0 = clean (or dry run), 1 = nothing to do, 2 = error.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys

DEFAULT_DB = r"C:\Users\pugal\AppData\Local\PersonalFlix\app.db"

TITLE_RE = re.compile(r"^(the\s+)?title\s+is\s+(.+)$", re.IGNORECASE | re.DOTALL)
NEED_RE = re.compile(r"^need\s+(?:a\s+|studio\s+)*data\s+(for+|on)\s+(.+)$",
                     re.IGNORECASE | re.DOTALL)
NAME_IS_RE = re.compile(r"\b(?:her|his|their)\s+name\s+is\s+([a-zA-Z'.\- ]+?)(?:\s+i\s+think)?$",
                        re.IGNORECASE)
STUDIO_HINT_RE = re.compile(r"studio|network|\bbros\b|films|media|entertainment", re.IGNORECASE)

# Comment ids with no executable instruction (remarks / needs-human-review).
KEEP_IDS = {25, 29, 74}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def proper(name: str) -> str:
    return " ".join(w[:1].upper() + w[1:] for w in name.split())


def split_names(remainder: str):
    rem = remainder.strip()
    rem = re.sub(r"^a\s+girl\s+named\s+", "", rem, flags=re.IGNORECASE)
    rem = re.split(r"\s+who\s+", rem, maxsplit=1)[0]
    parts = re.split(r"\s+and\s+|,", rem)
    return [p.strip(" .") for p in parts if p.strip(" .")]


def get_performer(cur, name: str):
    r = cur.execute(
        "SELECT id, name FROM performers WHERE lower(name)=lower(?)", (name,)).fetchone()
    if r:
        return r["id"], r["name"]
    r = cur.execute(
        "SELECT id, name FROM performers WHERE id=?", (slugify(name),)).fetchone()
    return (r["id"], r["name"]) if r else (None, None)


def ensure_performer(cur, name: str):
    pid, pname = get_performer(cur, name)
    if pid:
        return pid, pname, False
    pname = proper(name)
    pid = slugify(name)
    cur.execute(
        "INSERT INTO performers(id, name, slug, gender, attributes, category_ids) "
        "VALUES(?, ?, ?, 'unknown', '{}', '[]')", (pid, pname, pid))
    return pid, pname, True


def ensure_studio(cur, name: str):
    r = cur.execute(
        "SELECT id, name FROM studios WHERE lower(name)=lower(?)", (name,)).fetchone()
    if r:
        return r["id"], r["name"], False
    r = cur.execute(
        "SELECT id, name FROM studios WHERE id=?", (slugify(name),)).fetchone()
    if r:
        return r["id"], r["name"], False
    for r in cur.execute("SELECT id, name FROM studios"):
        if norm(r["name"]) == norm(name) or norm(r["id"]) == norm(name):
            return r["id"], r["name"], False
    sid = slugify(name)
    cur.execute("INSERT INTO studios(id, name) VALUES(?, ?)", (sid, proper(name)))
    return sid, proper(name), True


def link_performers(cur, sid: int, names, log):
    row = cur.execute(
        "SELECT performers, performer_ids FROM scenes WHERE id=?", (sid,)).fetchone()
    if row is None:
        return False, "scene row missing"
    try:
        ids = json.loads(row["performer_ids"] or "[]")
        names_now = json.loads(row["performers"] or "[]")
    except json.JSONDecodeError:
        ids, names_now = [], []
    ids = [str(i) for i in ids]
    added = []
    for n in names:
        pid, pname, created = ensure_performer(cur, n)
        if created:
            log.append(f"performer stub created: {pid} / {pname}")
        if pid not in ids:
            ids.append(pid)
            names_now.append(pname)
            added.append(pname)
    cur.execute("UPDATE scenes SET performer_ids=?, performers=? WHERE id=?",
                (json.dumps(ids), json.dumps(names_now), sid))
    return True, ("linked " + ", ".join(added)) if added else "already linked"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Apply instruction-notes, delete done ones.")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)

    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row
    cur = db.cursor()
    notes = cur.execute(
        "SELECT id, scene_id, text FROM comments ORDER BY id").fetchall()

    done_ids, kept = [], []
    for n in notes:
        nid, sid, text = n["id"], n["scene_id"], (n["text"] or "").strip()
        if nid in KEEP_IDS:
            kept.append((nid, sid, text, "no executable instruction / needs review"))
            continue
        m = TITLE_RE.match(text)
        if m:
            title = m.group(2).strip()
            row = cur.execute("SELECT title FROM scenes WHERE id=?", (sid,)).fetchone()
            if row is None:
                kept.append((nid, sid, text, "scene row missing"))
                continue
            print(f"  note {nid} scene {sid}: title {row['title']!r} -> {title!r}")
            if args.apply:
                cur.execute("UPDATE scenes SET title=? WHERE id=?", (title, sid))
                done_ids.append(nid)
            continue
        m = NEED_RE.match(text)
        if m is None:
            nm = NAME_IS_RE.search(text)
            if nm:
                names = [nm.group(1).strip(" .")]
                print(f"  note {nid} scene {sid}: link performers {names}")
                if args.apply:
                    log = []
                    ok, detail = link_performers(cur, sid, names, log)
                    for line in log:
                        print(f"    {line}")
                    print(f"    {detail}")
                    if ok:
                        done_ids.append(nid)
                    else:
                        kept.append((nid, sid, text, detail))
                continue
            kept.append((nid, sid, text, "unrecognized shape"))
            continue
        remainder = m.group(2).strip()
        if STUDIO_HINT_RE.search(text):
            sname = re.sub(r"\s+studio\s*$", "", remainder, flags=re.IGNORECASE).strip()
            sname = proper(sname)
            print(f"  note {nid} scene {sid}: set studio -> {sname!r}")
            if args.apply:
                row = cur.execute("SELECT studio FROM scenes WHERE id=?",
                                  (sid,)).fetchone()
                if row is None:
                    kept.append((nid, sid, text, "scene row missing"))
                    continue
                stid, stname, created = ensure_studio(cur, sname)
                if created:
                    print(f"    studio row created: {stid} / {stname}")
                if (row["studio"] or "") != stname:
                    print(f"    studio {(row['studio'] or '(none)')!r} -> {stname!r}")
                cur.execute("UPDATE scenes SET studio=?, studio_id=? WHERE id=?",
                            (stname, stid, sid))
                done_ids.append(nid)
            continue
        names = split_names(remainder)
        if not names:
            kept.append((nid, sid, text, "no names parsed"))
            continue
        print(f"  note {nid} scene {sid}: link performers {names}")
        if args.apply:
            log = []
            ok, detail = link_performers(cur, sid, names, log)
            for line in log:
                print(f"    {line}")
            print(f"    {detail}")
            if ok:
                done_ids.append(nid)
            else:
                kept.append((nid, sid, text, detail))
        continue

    print(f"notes: {len(notes)}, executable: {len(done_ids) if args.apply else 'see above'}, "
          f"kept: {len(kept)}")
    for nid, sid, text, why in kept:
        print(f"  KEEP note {nid} scene {sid} ({why}): {text[:70]!r}")
    if not args.apply:
        print("Dry run clean. Re-run with --apply to execute + delete done notes.")
        return 0
    if done_ids:
        cur.execute(f"DELETE FROM comments WHERE id IN ({','.join('?' * len(done_ids))})",
                    done_ids)
        print(f"deleted {len(done_ids)} executed notes: {sorted(done_ids)}")
    db.commit()
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
