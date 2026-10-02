//! Phase-2A one-shot data repair: dry-run report + transactional apply.
//!
//! What it does (see MAPPING_INVARIANTS.md §3):
//! - re-id AUTOINCREMENT placeholders to their filename-prefix id (relink)
//! - merge placeholders into existing seeded rows for the same prefix (adopt)
//! - normalize `performer_ids` elements to TEXT
//! - rebuild display caches (`scenes.studio`, `scenes.performers`)
//! - insert rows for on-disk files nothing references (create)
//!
//! What it NEVER does:
//! - reference `performers.scene_ids` (dropped in Phase 2B)
//! - write/delete/rename media files (existence reads only)
//! - fuzzy-match names (exact matches only; ambiguity → conflict sample)
//!
//! Idempotent: planning compares before writing, so a second apply reports
//! all zeros. Apply runs in ONE transaction — failure rolls everything back.

use crate::db::Db;
use crate::scanner;
use rusqlite::{params, Transaction};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Serialize, Default)]
pub struct ReconcileReport {
    pub dry_run: bool,
    pub applied: bool,
    pub would_relink: usize,
    pub would_adopt: usize,
    pub would_normalize: usize,
    pub would_update_studio: usize,
    pub would_update_performers: usize,
    pub would_create: usize,
    pub review_required: usize,
    pub unresolved: usize,
    pub conflicts: Vec<serde_json::Value>,
}

struct Relink {
    old: i64,
    new: i64,
}
struct Adopt {
    placeholder: i64,
    target: i64,
    stored: String,
    size: u64,
    mtime: f64,
}
struct Create {
    id: Option<i64>,
    name: String,
    stem: String,
    stored: String,
    resolution: String,
    size: u64,
    mtime: f64,
}

struct Plan {
    relink: Vec<Relink>,
    adopt: Vec<Adopt>,
    normalize: Vec<i64>,
    studio_cache: Vec<i64>,
    performer_cache: Vec<(i64, String)>,
    create: Vec<Create>,
    conflicts: Vec<serde_json::Value>,
}

fn push_conflict(plan: &mut Plan, v: serde_json::Value) {
    plan.conflicts.push(v);
    if plan.conflicts.len() > 50 {
        plan.conflicts.pop();
    }
}

fn basename_of(file_name: &Option<String>, file_path: &Option<String>) -> String {
    if let Some(n) = file_name {
        if !n.is_empty() {
            return n.clone();
        }
    }
    file_path
        .as_deref()
        .unwrap_or("")
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_string()
}

fn leading_digits(name: &str) -> Option<String> {
    let d: String = name.chars().take_while(|c| c.is_ascii_digit()).collect();
    if d.len() >= 5 {
        Some(d)
    } else {
        None
    }
}

fn live_meta(library_path: &Path, file_path: &str) -> Option<(String, u64, f64)> {
    let abs = crate::api::resolve_video_path(library_path, file_path)?;
    if !abs.exists() {
        return None;
    }
    let meta = std::fs::metadata(&abs).ok()?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);
    Some((file_path.to_string(), meta.len(), mtime))
}

/// Read-only planning. Shared by dry-run and apply.
fn build_plan(conn: &rusqlite::Connection, library_path: &Path) -> Plan {
    let mut plan = Plan {
        relink: Vec::new(),
        adopt: Vec::new(),
        normalize: Vec::new(),
        studio_cache: Vec::new(),
        performer_cache: Vec::new(),
        create: Vec::new(),
        conflicts: Vec::new(),
    };

    let studios: HashMap<String, String> = conn
        .prepare("SELECT id, COALESCE(name,'') FROM studios")
        .map(|mut s| {
            s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let performer_names: HashMap<String, String> = conn
        .prepare("SELECT id, COALESCE(name,'') FROM performers")
        .map(|mut s| {
            s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let scene_ids: HashSet<i64> = conn
        .prepare("SELECT id FROM scenes")
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, i64>(0))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();

    // --- placeholder identity repair --------------------------------------
    // Linkless rows whose filename carries a prefix that is NOT their id.
    // (Rows that already have relationships are left for human review.)
    let placeholders: Vec<(i64, Option<String>, Option<String>)> = conn
        .prepare(
            "SELECT id, file_name, file_path FROM scenes
             WHERE (studio_id IS NULL OR studio_id='')
               AND (performer_ids IS NULL OR performer_ids='' OR performer_ids='[]')
             ORDER BY id",
        )
        .map(|mut s| {
            s.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let mut claimed: HashSet<i64> = HashSet::new();
    for (old, file_name, file_path) in &placeholders {
        let base = basename_of(file_name, file_path);
        let Some(prefix) = leading_digits(&base) else { continue };
        let Ok(pid) = prefix.parse::<i64>() else { continue };
        if pid == *old {
            continue;
        }
        if !claimed.insert(pid) {
            push_conflict(&mut plan, serde_json::json!({
                "kind": "multi-claim", "prefix": prefix,
                "placeholderId": old, "file": base,
            }));
            continue;
        }
        let target_fp: Option<Option<String>> = conn
            .query_row(
                "SELECT file_path FROM scenes WHERE id=?1",
                params![pid],
                |r| r.get(0),
            )
            .ok();
        match target_fp {
            None => {
                // No scene with this id: re-id the placeholder (pure
                // PK rename + cascade; files untouched).
                plan.relink.push(Relink { old: *old, new: pid });
            }
            Some(tfp) => {
                let target_live = tfp
                    .as_deref()
                    .and_then(|p| crate::api::resolve_video_path(library_path, p))
                    .map(|p| p.exists())
                    .unwrap_or(false);
                let ph_fp = file_path.clone().unwrap_or_default();
                if !target_live && tfp.as_deref() != Some(ph_fp.as_str()) {
                    // Target row's file is gone; adopt the present file.
                    if let Some((stored, size, mtime)) = live_meta(library_path, &ph_fp) {
                        plan.adopt.push(Adopt {
                            placeholder: *old,
                            target: pid,
                            stored,
                            size,
                            mtime,
                        });
                    }
                    // else: both files gone — nothing to gain; leave it.
                } else {
                    // Target is live (or identical path): never steal/merge.
                    push_conflict(&mut plan, serde_json::json!({
                        "kind": "live-scene", "prefix": prefix,
                        "sceneId": pid, "placeholderId": old, "file": base,
                    }));
                }
            }
        }
    }

    // --- normalize performer_ids element types to TEXT ----------------------
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, performer_ids FROM scenes
         WHERE performer_ids IS NOT NULL AND performer_ids != ''
           AND json_valid(performer_ids)",
    ) {
        let rows: Vec<(i64, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default();
        for (id, raw) in rows {
            let v: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
            if let serde_json::Value::Array(a) = &v {
                let norm: Vec<String> = a
                    .iter()
                    .filter_map(|e| match e {
                        serde_json::Value::String(s) => Some(s.clone()),
                        serde_json::Value::Number(n) => Some(n.to_string()),
                        _ => None,
                    })
                    .collect();
                let cur: Vec<serde_json::Value> = a.clone();
                let norm_v: Vec<serde_json::Value> =
                    norm.iter().map(|s| serde_json::Value::String(s.clone())).collect();
                if cur != norm_v {
                    plan.normalize.push(id);
                }
            }
        }
    }

    // --- rebuild display caches from canonical tables -----------------------
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, COALESCE(studio,''), COALESCE(studio_id,'') FROM scenes",
    ) {
        let rows: Vec<(i64, String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default();
        for (id, display, sid) in rows {
            if !sid.is_empty() {
                if let Some(canon) = studios.get(&sid) {
                    if &display != canon {
                        plan.studio_cache.push(id);
                    }
                }
            }
        }
    }
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, performer_ids FROM scenes
         WHERE performer_ids IS NOT NULL AND performer_ids != ''
           AND json_valid(performer_ids)",
    ) {
        let rows: Vec<(i64, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default();
        for (id, raw) in rows {
            let refs: Vec<String> = serde_json::from_str::<Vec<serde_json::Value>>(&raw)
                .map(|a| {
                    a.iter()
                        .filter_map(|e| match e {
                            serde_json::Value::String(s) => Some(s.clone()),
                            serde_json::Value::Number(n) => Some(n.to_string()),
                            _ => None,
                        })
                        .collect()
                })
                .unwrap_or_default();
            // Only rewrite when EVERY ref resolves — otherwise leave the
            // display alone (review queue already flags the row).
            if let Some(names) = refs
                .iter()
                .map(|r| performer_names.get(r).cloned())
                .collect::<Option<Vec<String>>>()
            {
                let cur: Vec<String> = conn
                    .query_row(
                        "SELECT COALESCE(performers,'[]') FROM scenes WHERE id=?1",
                        params![id],
                        |r| r.get(0),
                    )
                    .ok()
                    .and_then(|s: String| {
                        serde_json::from_str::<Vec<serde_json::Value>>(&s).ok()
                    })
                    .map(|a| {
                        a.iter().filter_map(|e| e.as_str().map(|x| x.to_string())).collect()
                    })
                    .unwrap_or_default();
                if cur != names {
                    plan.performer_cache.push((id, serde_json::to_string(&names).unwrap()));
                }
            }
        }
    }

    // --- files nothing references (wouldCreate) ------------------------------
    let mut known_basenames: HashSet<String> = HashSet::new();
    if let Ok(mut stmt) = conn.prepare("SELECT file_name, file_path FROM scenes") {
        let rows: Vec<(Option<String>, Option<String>)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default();
        for (fname, fpath) in rows {
            if let Some(n) = fname {
                if !n.is_empty() {
                    known_basenames.insert(n.to_lowercase());
                }
            }
            let base = basename_of(&None, &fpath);
            if !base.is_empty() {
                known_basenames.insert(base.to_lowercase());
            }
        }
    }
    for f in scanner::collect_videos(library_path) {
        if known_basenames.contains(&f.name.to_lowercase()) {
            continue;
        }
        if let Some(p) = leading_digits(&f.name) {
            if p.parse::<i64>().map(|n| scene_ids.contains(&n)).unwrap_or(false) {
                continue;
            }
            plan.create.push(Create {
                id: p.parse().ok(),
                name: f.name.clone(),
                stem: f.stem.clone(),
                stored: f.stored.clone(),
                resolution: scanner::detect_resolution(&f.name),
                size: f.size,
                mtime: f.mtime,
            });
        } else {
            plan.create.push(Create {
                id: None,
                name: f.name.clone(),
                stem: f.stem.clone(),
                stored: f.stored.clone(),
                resolution: scanner::detect_resolution(&f.name),
                size: f.size,
                mtime: f.mtime,
            });
        }
    }

    plan
}

/// Point every id-keyed row (tracking/comments/timestamps) plus JSON
/// playlist memberships and scene favorites from `old` to `new`.
fn repoint(tx: &Transaction, old: i64, new: i64) -> rusqlite::Result<()> {
    tx.execute("UPDATE tracking SET scene_id=?1 WHERE scene_id=?2", params![new, old])?;
    tx.execute("UPDATE comments SET scene_id=?1 WHERE scene_id=?2", params![new, old])?;
    tx.execute("UPDATE timestamps SET scene_id=?1 WHERE scene_id=?2", params![new, old])?;
    {
        let mut stmt = tx.prepare("SELECT id, scene_ids FROM playlists")?;
        let pls: Vec<(i64, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .flatten()
            .collect();
        drop(stmt);
        for (pid, raw) in pls {
            let arr: Vec<serde_json::Value> =
                serde_json::from_str(&raw).unwrap_or_default();
            let mut changed = false;
            let mut seen: HashSet<String> = HashSet::new();
            let mut out: Vec<serde_json::Value> = Vec::new();
            for v in arr {
                let key = match &v {
                    serde_json::Value::Number(n) => n.to_string(),
                    serde_json::Value::String(s) => s.clone(),
                    _ => continue,
                };
                let mapped = if key == old.to_string() {
                    changed = true;
                    new.to_string()
                } else {
                    key
                };
                if seen.insert(mapped.clone()) {
                    out.push(
                        mapped
                            .parse::<i64>()
                            .map(serde_json::Value::from)
                            .unwrap_or_else(|_| serde_json::Value::String(mapped)),
                    );
                } else {
                    changed = true;
                }
            }
            if changed {
                tx.execute(
                    "UPDATE playlists SET scene_ids=?1 WHERE id=?2",
                    params![serde_json::to_string(&out).unwrap_or_else(|_| "[]".into()), pid],
                )?;
            }
        }
    }
    tx.execute(
        "UPDATE favorites SET target_id=?1 WHERE type='scene' AND target_id=?2",
        params![new.to_string(), old.to_string()],
    )?;
    Ok(())
}

fn to_report(plan: &Plan, dry_run: bool, applied: bool) -> ReconcileReport {
    ReconcileReport {
        dry_run,
        applied,
        would_relink: plan.relink.len(),
        would_adopt: plan.adopt.len(),
        would_normalize: plan.normalize.len(),
        would_update_studio: plan.studio_cache.len(),
        would_update_performers: plan.performer_cache.len(),
        would_create: plan.create.len(),
        review_required: plan.conflicts.len(),
        unresolved: plan.create.iter().filter(|c| c.id.is_none()).count(),
        conflicts: plan.conflicts.clone(),
    }
}

/// Dry-run: report what WOULD change without changing anything.
pub fn dry_run(db: &Db, library_path: &Path) -> ReconcileReport {
    let conn = db.lock().unwrap();
    let plan = build_plan(&conn, library_path);
    to_report(&plan, true, false)
}

/// Apply: the SAME plan, executed in ONE transaction. Idempotent — a second
/// run reports all zeros.
pub fn apply(db: &Db, library_path: &Path) -> Result<ReconcileReport, String> {
    let mut conn = db.lock().map_err(|e| e.to_string())?;
    let plan = build_plan(&conn, library_path);
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let run = || -> rusqlite::Result<()> {
        for id in &plan.normalize {
            let raw: String = tx.query_row(
                "SELECT performer_ids FROM scenes WHERE id=?1",
                params![id],
                |r| r.get(0),
            )?;
            let arr: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap_or_default();
            let norm: Vec<serde_json::Value> = arr
                .iter()
                .filter_map(|e| match e {
                    serde_json::Value::String(s) => {
                        Some(serde_json::Value::String(s.clone()))
                    }
                    serde_json::Value::Number(n) => {
                        Some(serde_json::Value::String(n.to_string()))
                    }
                    _ => None,
                })
                .collect();
            tx.execute(
                "UPDATE scenes SET performer_ids=?1 WHERE id=?2",
                params![serde_json::to_string(&norm).unwrap_or_else(|_| "[]".into()), id],
            )?;
        }
        for r in &plan.relink {
            repoint(&tx, r.old, r.new)?;
            tx.execute("UPDATE scenes SET id=?1 WHERE id=?2", params![r.new, r.old])?;
        }
        for a in &plan.adopt {
            repoint(&tx, a.placeholder, a.target)?;
            tx.execute(
                "UPDATE scenes SET file_exists=1, size_bytes=?1, mtime=?2, file_path=?3 WHERE id=?4",
                params![a.size, a.mtime, a.stored, a.target],
            )?;
            tx.execute("DELETE FROM scenes WHERE id=?1", params![a.placeholder])?;
        }
        for id in &plan.studio_cache {
            tx.execute(
                "UPDATE scenes SET studio=(SELECT name FROM studios WHERE id=scenes.studio_id)
                 WHERE id=?1",
                params![id],
            )?;
        }
        for (id, names) in &plan.performer_cache {
            tx.execute(
                "UPDATE scenes SET performers=?1 WHERE id=?2",
                params![names, id],
            )?;
        }
        for c in &plan.create {
            match c.id {
                Some(pid) => {
                    tx.execute(
                        "INSERT INTO scenes(id, file_name, original_name, title, file_path,
                                            resolution, file_exists, size_bytes, mtime)
                         VALUES(?1,?2,?3,?4,?5,?6,1,?7,?8)",
                        params![pid, c.name, c.stem, c.stem, c.stored, c.resolution, c.size, c.mtime],
                    )?;
                }
                None => {
                    tx.execute(
                        "INSERT INTO scenes(file_name, original_name, title, file_path,
                                            resolution, file_exists, size_bytes, mtime)
                         VALUES(?1,?2,?3,?4,?5,1,?6,?7)",
                        params![c.name, c.stem, c.stem, c.stored, c.resolution, c.size, c.mtime],
                    )?;
                }
            }
        }
        Ok(())
    };
    match run() {
        Ok(()) => {
            tx.commit().map_err(|e| e.to_string())?;
            Ok(to_report(&plan, false, true))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seed::open_memory;

    fn test_library(files: &[&str]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "pfx-reconcile-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        for f in files {
            std::fs::File::create(dir.join(f)).unwrap();
        }
        dir
    }

    fn scene_ids(db: &Db) -> Vec<i64> {
        let conn = db.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id FROM scenes ORDER BY id").unwrap();
        let ids: Vec<i64> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .flatten()
            .collect();
        drop(stmt);
        drop(conn);
        ids
    }

    /// Dry-run reports without writing; apply repairs (relink + adopt with
    /// tracking cascade); a second apply is a no-op (idempotent).
    #[test]
    fn reconcile_dry_run_apply_idempotent() {
        let db = open_memory();
        {
            let conn = db.lock().unwrap();
            // Seeded scene whose file is gone.
            conn.execute(
                "INSERT INTO scenes(id,title,file_name,file_path,studio_id)
                 VALUES(1387728,'Seeded','1387728_720p.mp4','Porn/Old/1387728_720p.mp4','s1')",
                [],
            )
            .unwrap();
            // Placeholder for an unknown prefix -> relink to 1266572.
            conn.execute(
                "INSERT INTO scenes(id,title,file_name,file_path)
                 VALUES(1931369,'1266572_480m','1266572_480m.mp4','Porn/1266572_480m.mp4')",
                [],
            )
            .unwrap();
            // Placeholder for the seeded prefix -> adopt into 1387728.
            conn.execute(
                "INSERT INTO scenes(id,title,file_name,file_path)
                 VALUES(1931370,'1387728_480','1387728_480.mp4','Porn/1387728_480.mp4')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO tracking(scene_id,status,currentTime,updated_at)
                 VALUES(1931370,'watched',10.0,'t')",
                [],
            )
            .unwrap();
        }
        let lib = test_library(&["1266572_480m.mp4", "1387728_480.mp4"]);

        let dry = dry_run(&db, &lib);
        assert!(dry.dry_run && !dry.applied);
        assert_eq!(dry.would_relink, 1);
        assert_eq!(dry.would_adopt, 1);
        assert_eq!(dry.review_required, 0);
        // DB untouched by dry-run.
        assert_eq!(scene_ids(&db), vec![1387728, 1931369, 1931370]);

        let done = apply(&db, &lib).expect("apply");
        assert!(done.applied && !done.dry_run);
        assert_eq!(done.would_relink, 1);
        assert_eq!(done.would_adopt, 1);
        assert_eq!(scene_ids(&db), vec![1266572, 1387728]);
        {
            let conn = db.lock().unwrap();
            let path: String = conn
                .query_row("SELECT file_path FROM scenes WHERE id=1387728", [], |r| r.get(0))
                .unwrap();
            assert!(path.ends_with("1387728_480.mp4"));
            let tid: i64 = conn
                .query_row("SELECT scene_id FROM tracking", [], |r| r.get(0))
                .unwrap();
            assert_eq!(tid, 1387728);
        }

        // Second apply: nothing left to do.
        let again = apply(&db, &lib).expect("re-apply");
        assert_eq!(again.would_relink, 0);
        assert_eq!(again.would_adopt, 0);
        assert_eq!(again.would_normalize, 0);
        assert_eq!(again.would_update_studio, 0);
        assert_eq!(again.would_update_performers, 0);
        assert_eq!(again.would_create, 0);
        std::fs::remove_dir_all(&lib).ok();
    }
}
