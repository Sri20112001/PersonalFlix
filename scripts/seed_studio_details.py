#!/usr/bin/env python3
"""Seed studio style blurbs + signature categories, then backfill scenes.

Each studio gets:
  * style: 1-2 sentence "famous for" blurb (shown on the Studio page).
  * signature_categories: house-style category ids, unioned into every scene
    carrying that studio_id. Additive only — existing scene categories are
    never removed.

Going forward the app does this itself: the scanner stamps signatures on
new scenes, and PATCH /api/studios/{id} re-propagates on mapping edits.

Usage:
  python scripts/seed_studio_details.py           # dry run
  python scripts/seed_studio_details.py --apply   # write + backfill

Exit code: 0 = done, 2 = error (e.g. unknown category id).
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys

DEFAULT_DB = r"C:\Users\pugal\AppData\Local\PersonalFlix\app.db"

# studio_id -> (style blurb, [signature category ids])
DETAILS = {
    "vixen": ("Flagship glamour studio: beautiful performers, exotic locations, "
              "high-fashion 4K productions. Famous for blowjob/facial-centric glam scenes.",
              ["beautiful-sex", "deepthroat", "facial", "pussy-licking", "blowjob"]),
    "blacked": ("Interracial specialist famous for BBC pairings with polished, "
                "chemistry-driven scenes.", ["interracial", "bbc-big-black-cock"]),
    "tushy": ("Anal specialists: refined, sensual anal scenes with an emphasis "
              "on curves and finish.", ["anal", "ass-to-mouth", "gaping", "facial"]),
    "blacked-raw": ("Raw, unscripted counterpart to Blacked: gonzo interracial "
                    "with no studio trappings.", ["interracial", "raw", "bbc-big-black-cock"]),
    "tushy-raw": ("Raw, candid counterpart to TUSHY: spontaneous anal scenes.",
                  ["anal", "raw", "gaping"]),
    "deeper": ("Kayden Kross-directed erotic arthouse: psychological, story-driven "
               "scenes from softcore to BDSM.", ["bdsm", "bondage", "domination"]),
    "slayed": ("Luxury all-girl label: elegant lesbian scenes with high-end "
               "styling.", ["lesbian", "pussy-licking", "squirt"]),
    "milfy": ("Experienced women at their peak: poised, confident MILF scenes "
              "with cinematic craft.", ["milf", "housewife", "beautiful-sex"]),
    "brazzers": ("Mainstream giant famous for parody, roleplay setups and star-driven "
                 "big productions.", ["big-tits", "blowjob", "facial"]),
    "reality-kings": ("Reality and TV-spoof formats: POV, public and amateur-style "
                      "series.", ["pov", "amateur", "public"]),
    "rk-prime": ("Prestige interview/audition line: casting-style scenes with new "
                 "faces.", ["interview", "audition", "pov"]),
    "babescom": ("Glam softcore-leaning model showcase: beautiful solo and girl/girl "
                 "scenes.", ["softcore", "beautiful-sex", "solo"]),
    "girlsway": ("Story-driven lesbian studio; contract faces and romantic "
                 "girl/girl narratives.", ["lesbian", "pussy-licking", "threesome", "beautiful-sex"]),
    "lesbian-x": ("Lesbian promo label: girl/girl scenes with star performers.",
                  ["lesbian", "pussy-licking"]),
    "web-young": ("Young lesbian line: teen girl/girl scenes.",
                  ["lesbian", "teen", "pussy-licking"]),
    "mommys-girl": ("MILF/teen lesbian line built around India Summer-style "
                    "older women with younger partners.", ["lesbian", "milf", "old-and-young", "stepmom"]),
    "moms-family-secrets": ("Family-taboo lesbian drama: stepmom-centered secret "
                            "affair stories.", ["lesbian", "stepmom", "stepfamily", "taboo"]),
    "she-seduced-me": ("Older-woman seduction line: experienced women pursuing "
                       "younger partners.", ["lesbian", "milf", "old-and-young"]),
    "we-live-together": ("Roommate lesbian line: threesomes and group play among "
                         "women sharing a house.", ["lesbian", "threesome"]),
    "pure-taboo": ("Taboo-story specialists: transgression narratives around "
                   "stepfamily dynamics.", ["taboo", "stepfamily", "stepdaughter", "stepmom", "threesome"]),
    "modern-day-sins": ("Taboo drama imprint: cheating and family-secret "
                        "storylines.", ["taboo", "stepfamily", "cheating"]),
    "sinners": ("Darker taboo imprint: rough, transgressive story scenes.",
                ["taboo", "bdsm", "rough-sex"]),
    "sweet-heart": ("Stepfamily romance line: softer taboo love stories.",
                    ["taboo", "stepfamily", "couple"]),
    "sweet-heart-video": ("Stepfamily romance line: softer taboo love stories.",
                          ["taboo", "stepfamily", "couple"]),
    "sweet-sinner": ("Romantic taboo line: couple-focused transgression stories "
                     "with soft styling.", ["taboo", "couple", "beautiful-sex"]),
    "hardx": ("Relentless hardcore gonzo: anal, deepthroat and group scenes "
              "with top male talent.", ["anal", "deepthroat", "gangbang", "rough-sex", "gaping"]),
    "evil-angel": ("Dark extreme gonzo: rough anal and group content.",
                   ["anal", "rough-sex", "bdsm", "gangbang"]),
    "darkx": ("Dark interracial line: rough-edged BBC scenes.",
              ["interracial", "rough-sex", "bdsm"]),
    "zerotolerance": ("Hardcore gonzo label: rough group and anal scenes.",
                      ["rough-sex", "anal", "gangbang"]),
    "eroticax": ("Couples-friendly artsy erotica: soft, beautiful pair scenes.",
                 ["softcore", "beautiful-sex", "couple", "massage"]),
    "team-skeet": ("Teen-niche network engine: POV threesomes and ensemble casts.",
                  ["teen", "threesome", "pov"]),
    "all-girl-massage": ("Massage-table lesbian line: oil massages turning into "
                         "girl/girl scenes.", ["lesbian", "massage", "pussy-licking"]),
    "bratty-sis": ("Brash teen stepsister roleplay line.",
                   ["teen", "stepsister", "stepfamily", "taboo"]),
    "dadcrush": ("Stepdad-teen roleplay line.", ["teen", "stepdad", "stepdaughter", "taboo"]),
    "perv-mom": ("Stepmom roleplay line with veteran MILF stars.",
                 ["milf", "stepmom", "taboo"]),
    "stepmom-videos": ("Stepmom roleplay compilations.", ["milf", "stepmom", "taboo"]),
    "schooled": ("School roleplay line: teachers, detention and classroom "
                 "scenarios.", ["teacher", "school", "teen"]),
    "foster-tapes": ("Foster-family surveillance fantasies with a voyeur angle.",
                     ["voyeur", "teen", "taboo"]),
    "nubiles": ("Teen showcase factory: solo and duet scenes with new faces.",
                ["teen", "solo", "masturbation", "pov"]),
    "bang-bros": ("Miami reality franchises: public, POV and big-production "
                  "ensemble scenes.", ["big-tits", "pov", "public"]),
    "naughty-america": ("Reality roleplay pioneers (office, housewife fantasies) "
                        "and VR formats.", ["office", "housewife", "secretary"]),
    "naughty-rich-girls": ("Rich-swinger line: parties and group play.",
                           ["swinger", "party", "orgy"]),
    "adult-time": ("Streaming-network originals: series-driven ensemble scenes "
                   "across niches.", ["threesome", "group-sex", "compilation"]),
    "transifixed": ("Trans-star showcase line: ensemble scenes built around "
                    "trans performers.", ["threesome", "group-sex", "beautiful-sex"]),
    "dorcel-club": ("French luxury erotica: soft, elegant continental scenes.",
                    ["softcore", "beautiful-sex", "massage"]),
    "sexart": ("Softcore glamour: artistic solo and girl/girl scenes.",
               ["softcore", "beautiful-sex", "solo", "masturbation"]),
    "mylf": ("MILF network: housewife and cougar scenes.",
             ["milf", "housewife", "cougar"]),
    "milfty": ("MILF network line: glamorous older-women scenes.",
               ["milf", "threesome", "beautiful-sex"]),
    "cougariffic": ("Cougar line: older women with younger partners.",
                    ["cougar", "milf"]),
    "moms-teach-sex": ("Stepmom-instruction fantasies, often with threesomes.",
                       ["milf", "stepmom", "taboo", "threesome"]),
    "new-sensations": ("Veteran romance-feature studio: couple-led stories.",
                       ["couple", "beautiful-sex", "massage"]),
    "passion-hd": ("Teen POV line: amateur-feel young scenes.",
                   ["teen", "pov", "amateur"]),
    "girls-only-porn": ("Party lesbian line: group girl/girl scenes.",
                        ["lesbian", "threesome", "party"]),
}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Seed studio details + backfill scene categories.")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)

    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row
    cur = db.cursor()
    cols = [r[1] for r in cur.execute("PRAGMA table_info(studios)")]
    if "style" not in cols:
        cur.execute("ALTER TABLE studios ADD COLUMN style TEXT NOT NULL DEFAULT ''")
    if "signature_categories" not in cols:
        cur.execute("ALTER TABLE studios ADD COLUMN signature_categories TEXT NOT NULL DEFAULT '[]'")
    valid = {r[0] for r in cur.execute("SELECT id FROM categories")}
    bad = [(sid, c) for sid, (_b, sig) in DETAILS.items() for c in sig if c not in valid]
    if bad:
        print(f"ERROR: unknown category ids: {bad}")
        return 2

    studios = {r["id"]: r["name"] for r in cur.execute("SELECT id, name FROM studios")}
    print(f"studios in DB: {len(studios)}; profiles: {len(DETAILS)}")
    missing = [sid for sid in studios if sid not in DETAILS]
    extra = [sid for sid in DETAILS if sid not in studios]
    if missing:
        print(f"  no profile for: {missing} (left untouched)")
    if extra:
        print(f"  profile without studio row (skipped): {extra}")

    total_scenes = total_touched = 0
    for sid, (blurb, sig) in DETAILS.items():
        if sid not in studios:
            continue
        sig_json = json.dumps(sig)
        rows = cur.execute("SELECT id, category_ids FROM scenes WHERE studio_id=?", (sid,)).fetchall()
        touched = 0
        for r in rows:
            try:
                ids = [str(x) for x in json.loads(r["category_ids"] or "[]")]
            except json.JSONDecodeError:
                ids = []
            before = len(ids)
            for c in sig:
                if c not in ids:
                    ids.append(c)
            if len(ids) > before:
                touched += 1
                if args.apply:
                    cur.execute("UPDATE scenes SET category_ids=? WHERE id=?",
                                (json.dumps(ids), r["id"]))
        total_scenes += len(rows)
        total_touched += touched
        print(f"  {'SEED' if args.apply else 'PLAN'} {sid}: style={len(blurb)}ch "
              f"sig={sig} scenes={len(rows)} touch={touched}")
        if args.apply:
            cur.execute("UPDATE studios SET style=?, signature_categories=? WHERE id=?",
                        (blurb, sig_json, sid))
    if args.apply:
        db.commit()
        print(f"Done: details seeded, {total_touched}/{total_scenes} scenes gained categories.")
    else:
        print(f"Dry run: {total_touched}/{total_scenes} scenes would gain categories. "
              "Re-run with --apply.")
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
