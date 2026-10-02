# PersonalFlix — Mapping Invariants (Phase 1)

Single source of truth for performer ↔ scene ↔ studio relationships.
Established 2026-09-12 from Phase-0 audit findings (768 scenes, 44 reverse
mismatches, 34 studio display drifts, 0 invalid refs, 0 type mix).

## 1. Canonical vs derived

```text
Scene
─────
id             = canonical scene identity (integer)
file_path      = canonical filesystem reference
performer_ids  = canonical performer relationships  ← THE truth
studio_id      = canonical studio relationship

performers[]   = derived display cache (names only, never identity)
studio         = derived display cache (name only, never identity)

Performer
─────────
id             = canonical performer identity (text key)
scene_ids      = DEPRECATED derived cache — do not read in app code,
                 do not write except legacy seed. Removal in Phase 2.

Studio
──────
id             = canonical studio identity (text key)
name           = canonical display name
```

## 2. Relationship rules

1. **Forward direction is truth.** "Which scenes belong to performer X?"
   is answered ONLY by reverse-querying `scenes.performer_ids`:
   ```sql
   SELECT id FROM scenes WHERE EXISTS
     (SELECT 1 FROM json_each(scenes.performer_ids)
       WHERE CAST(json_each.value AS TEXT) = ?1)
   ```
   Never the other way around. Never via display names.
2. **Display fields never establish identity.** `scenes.performers[]`,
   `scenes.studio`, and performer `name` matching are presentation only.
   The legacy performer name-fallback in `GET /api/performers/{id}` is removed.
3. **`performer_ids` element type is TEXT.** Phase 0 confirmed zero type
   mix; all comparisons go through `CAST(... AS TEXT)` so a future int
   element still matches.
4. **Counts, not caches.** List endpoints expose server-computed
   `scene_count` derived from rule 1. No N+1 detail fetches, no stale arrays.

## 3. Scanner reconciliation rules (binding for Phase 2/3)

A numeric filename prefix (≥5 leading digits) MUST either identify an
existing scene or become the new scene's id — never an AUTOINCREMENT orphan:

```text
prefix matches existing scene  → link/adopt existing scene
prefix matches nothing          → create scene USING THE PREFIX AS ID
prefix maps to multiple files   → review_required (e.g. 720p + 480m variants)
prefix belongs to another scene → review_required, never steal
```

Studio inference from the parent folder (`<library>/<Studio>/file`) is
allowed ONLY on exact (case-insensitive) match to one studio id/name —
no fuzzy matching without an explicit `studio_aliases` table.
**Performers are never inferred.** Unknown links stay NULL and the scene
reports `partial`/`orphan` in the mapping audit.

## 4. Audit as regression detector

`GET /api/library/mapping-audit` (read-only, exact-match only) reports
`complete / partial / orphan / review_required` plus invalid refs, reverse
mismatches, studio drift, prefix collisions, unresolved files. It must keep
passing after every migration: `reviewRequired`, `invalidPerformerRefs`,
and `performerReverseMismatches` trend toward the intended values, and any
unexpected increase blocks the change.

## 5. Phase-2 status

### Phase 2A — DONE 2026-09-12 (data repair + scanner identity fix)

- [x] Scanner adopts prefix-as-id (`scanner.rs::scan_library`):
      by-name → by-path → adopt-missing → adopt/create/conflict by prefix.
      New `ScanResult` counters: `adopted / created / conflicts / unresolved`
      + `conflict_files` sample. Conflicts never steal a live scene.
- [x] Reconciliation endpoint `POST /api/library/reconcile`
      (`api/reconcile.rs`): dry-run report by default (`{"dry_run": true}`),
      apply (`{"dry_run": false}`) runs the identical plan in ONE
      transaction (rollback on failure). Idempotent — re-run reports zeros.
      Covers relink (PK rename + tracking/comments/timestamps/playlists/
      favorites cascade), adopt-merge, TEXT normalization, display-cache
      rebuild, and creation for unreferenced files. Never touches
      `performers.scene_ids` or writes media files.
- [x] Health page: "Data repair — dry-run first" block (preview → confirm →
      apply → stats/audit refresh).
- [x] Regression tests (all passing): `scanner_adopts_existing_scene_by_prefix`
      (the 1266572 acceptance case), `scanner_prefix_creates_single_scene`
      (720p+480m → one row), `reconcile_dry_run_apply_idempotent`
      (dry-run writes nothing, apply repairs + cascades, re-apply is clean).

### Phase 2B — DONE 2026-09-12 (drop the deprecated cache)

- [x] Re-verified zero app readers by grep (only `playlists.scene_ids`,
       a different table's canonical membership, remains)
- [x] `db.rs`: removed from fresh schema + `migrate()` runs
       `ALTER TABLE performers DROP COLUMN scene_ids` once on next launch
       (pre-2A backup at `%LOCALAPPDATA%\PersonalFlix\app.pre-2a.db`)
- [x] Removed from `performer_from_row` payload, seed insert, PATCH
       (was already frozen), audit reverse-mismatch section, and tests
- [x] Shared forward-truth helpers (`scenes_for_performer`,
       `scene_count_for_performer`) used by detail, list-count, and both
       search.rs resolutions — one implementation, unit-tested
- [x] Regression test: schema assertion (column absent) + exact-match /
       no-name-fallback / CAST-rule / count-agrees chain
- [x] `cargo test` 10/10, frontend build clean (payload loss is
       backward-compatible: no frontend code read the field)
