//! Database integrity verification (read-only).
//!
//! `GET /api/library/integrity` runs the full check suite and returns
//! per-check pass/warn/fail rows with small samples. Anything the mapping
//! audit covers at the relationship level is NOT duplicated here; this is
//! about structural health: SQLite integrity, JSON validity, dangling
//! references, duplicates, and missing files.

use crate::db::{Db, SCHEMA_VERSION};
use serde_json::{json, Value};
use std::collections::HashSet;

struct Check {
    id: &'static str,
    label: &'static str,
    status: &'static str, // pass | warn | fail
    count: i64,
    sample: Vec<Value>,
}

impl Check {
    fn pass(id: &'static str, label: &'static str) -> Self {
        Self { id, label, status: "pass", count: 0, sample: vec![] }
    }
    fn issue(id: &'static str, label: &'static str, status: &'static str, sample: Vec<Value>) -> Self {
        let count = sample.len() as i64;
        Self { id, label, status, count, sample }
    }
    fn json(&self) -> Value {
        json!({
            "id": self.id,
            "label": self.label,
            "status": self.status,
            "count": self.count,
            "total": self.count,
            "sample": self.sample,
        })
    }
}

/// Full verification run. Takes the DB lock once; all read-only.
/// NOTE: never call helpers that re-lock `db` while `conn` is held.
pub fn verify(db: &Db) -> Value {
    // Read version via the shared helper BEFORE taking the lock below
    // (calling it while `conn` is held would deadlock on the Db mutex).
    let db_version: i64 = crate::db::schema_version(db);
    let conn = db.lock().unwrap();
    let mut checks: Vec<Check> = Vec::new();

    // 1. SQLite-level integrity.
    let pragma: Vec<String> = conn
        .prepare("PRAGMA integrity_check")
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    if pragma.len() == 1 && pragma[0].to_lowercase() == "ok" {
        checks.push(Check::pass("sqlite", "SQLite integrity_check"));
    } else {
        checks.push(Check::issue(
            "sqlite",
            "SQLite integrity_check",
            "fail",
            pragma.into_iter().take(5).map(Value::String).collect(),
        ));
    }

    // 2. Schema version.
    if db_version == SCHEMA_VERSION {
        checks.push(Check::pass("schema", "Schema version"));
    } else {
        checks.push(Check {
            id: "schema",
            label: "Schema version",
            status: "warn",
            count: 1,
            sample: vec![json!({ "expected": SCHEMA_VERSION, "found": db_version })],
        });
    }

    // 3. Malformed JSON cells (break json_each queries → fail).
    let mut bad_json: Vec<Value> = Vec::new();
    for (table, col) in [
        ("scenes", "performers"),
        ("scenes", "performer_ids"),
        ("scenes", "category_ids"),
        ("studios", "signature_categories"),
        ("performers", "category_ids"),
        ("playlists", "scene_ids"),
    ] {
        let sql = format!(
            "SELECT id FROM {table} WHERE {col} IS NOT NULL AND {col} != '' AND NOT json_valid({col}) LIMIT 5"
        );
        if let Ok(mut stmt) = conn.prepare(&sql) {
            if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
                for id in rows.flatten() {
                    if bad_json.len() >= 5 {
                        break;
                    }
                    bad_json.push(json!({ "table": table, "column": col, "id": id }));
                }
            }
        }
    }
    // comments/timestamps performer_ids use INTEGER ids — same validity rule.
    for table in ["comments", "timestamps"] {
        let sql = format!(
            "SELECT id FROM {table} WHERE performer_ids IS NOT NULL AND performer_ids != '' AND NOT json_valid(performer_ids) LIMIT 5"
        );
        if let Ok(mut stmt) = conn.prepare(&sql) {
            if let Ok(rows) = stmt.query_map([], |r| r.get::<_, i64>(0)) {
                for id in rows.flatten() {
                    if bad_json.len() >= 10 {
                        break;
                    }
                    bad_json.push(json!({ "table": table, "column": "performer_ids", "id": id }));
                }
            }
        }
    }
    if bad_json.is_empty() {
        checks.push(Check::pass("json", "JSON columns valid"));
    } else {
        checks.push(Check::issue("json", "JSON columns valid", "fail", bad_json));
    }

    // Reference sets for the checks below.
    let scene_ids: HashSet<i64> = conn
        .prepare("SELECT id FROM scenes")
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, i64>(0))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let performer_ids: HashSet<String> = conn
        .prepare("SELECT id FROM performers")
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let category_ids: HashSet<String> = conn
        .prepare("SELECT id FROM categories")
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();

    // 4. Invalid performer refs (forward truth points nowhere).
    let bad_perfs: Vec<Value> = conn
        .prepare(
            "SELECT DISTINCT CAST(value AS TEXT) FROM scenes,
             json_each(CASE WHEN json_valid(scenes.performer_ids) THEN scenes.performer_ids ELSE '[]' END)",
        )
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))
                .map(|rows| {
                    rows.flatten()
                        .filter(|v| !performer_ids.contains(v))
                        .take(5)
                        .map(|v| json!({ "performer_id": v }))
                        .collect()
                })
                .unwrap_or_default()
        })
        .unwrap_or_default();
    if bad_perfs.is_empty() {
        checks.push(Check::pass("performer_refs", "Performer references"));
    } else {
        checks.push(Check::issue("performer_refs", "Performer references", "warn", bad_perfs));
    }

    // 5. Invalid studio refs.
    let bad_studios: Vec<Value> = conn
        .prepare(
            "SELECT id, title, studio_id FROM scenes
             WHERE studio_id IS NOT NULL AND studio_id != ''
               AND studio_id NOT IN (SELECT id FROM studios) LIMIT 5",
        )
        .map(|mut s| {
            s.query_map([], |r| {
                Ok(json!({
                    "sceneId": r.get::<_, i64>(0)?,
                    "title": r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    "studioId": r.get::<_, String>(2)?,
                }))
            })
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
        })
        .unwrap_or_default();
    if bad_studios.is_empty() {
        checks.push(Check::pass("studio_refs", "Studio references"));
    } else {
        checks.push(Check::issue("studio_refs", "Studio references", "warn", bad_studios));
    }

    // 6. Invalid category refs (scenes, performers, studio signatures).
    let mut bad_cats: Vec<Value> = Vec::new();
    let cat_sources = [
        ("scenes", "category_ids", "SELECT id FROM scenes"),
        ("performers", "category_ids", "SELECT id FROM performers"),
        ("studios", "signature_categories", "SELECT id FROM studios"),
    ];
    for (table, col, _ids) in cat_sources {
        let sql = format!(
            "SELECT DISTINCT CAST(value AS TEXT) FROM {table},
             json_each(CASE WHEN json_valid({table}.{col}) THEN {table}.{col} ELSE '[]' END)"
        );
        if let Ok(mut stmt) = conn.prepare(&sql) {
            if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
                for v in rows.flatten() {
                    if !category_ids.contains(&v) && bad_cats.len() < 5 {
                        bad_cats.push(json!({ "table": table, "category_id": v }));
                    }
                }
            }
        }
    }
    if bad_cats.is_empty() {
        checks.push(Check::pass("category_refs", "Category references"));
    } else {
        checks.push(Check::issue("category_refs", "Category references", "warn", bad_cats));
    }

    // 7. Playlist entries pointing at missing scenes.
    let mut bad_pl: Vec<Value> = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, name, scene_ids FROM playlists") {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            ))
        }) {
            for (pid, name, raw) in rows.flatten() {
                let ids: Vec<i64> = serde_json::from_str::<Vec<Value>>(&raw)
                    .ok()
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| {
                                v.as_i64().or_else(|| {
                                    v.as_str().and_then(|s| s.parse().ok())
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                let missing: Vec<i64> = ids.into_iter().filter(|i| !scene_ids.contains(i)).collect();
                if !missing.is_empty() && bad_pl.len() < 5 {
                    bad_pl.push(json!({
                        "playlistId": pid,
                        "name": name.unwrap_or_default(),
                        "missingSceneIds": missing,
                    }));
                }
            }
        }
    }
    if bad_pl.is_empty() {
        checks.push(Check::pass("playlist_refs", "Playlist entries"));
    } else {
        checks.push(Check::issue("playlist_refs", "Playlist entries", "warn", bad_pl));
    }

    // 8. Favorites pointing at missing targets.
    let mut bad_fav: Vec<Value> = Vec::new();
    if let Ok(mut stmt) =
        conn.prepare("SELECT id, type, target_id FROM favorites LIMIT 5000")
    {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        }) {
            for (fid, ty, tid) in rows.flatten() {
                let ok = match ty.as_str() {
                    "scene" => tid.parse::<i64>().map(|n| scene_ids.contains(&n)).unwrap_or(false),
                    "performer" => performer_ids.contains(&tid),
                    "studio" => conn
                        .query_row(
                            "SELECT 1 FROM studios WHERE id=?1",
                            [&tid],
                            |_| Ok(()),
                        )
                        .is_ok(),
                    _ => false,
                };
                if !ok && bad_fav.len() < 5 {
                    bad_fav.push(json!({ "favoriteId": fid, "type": ty, "targetId": tid }));
                }
            }
        }
    }
    if bad_fav.is_empty() {
        checks.push(Check::pass("favorite_refs", "Favorite targets"));
    } else {
        checks.push(Check::issue("favorite_refs", "Favorite targets", "warn", bad_fav));
    }

    // 9. Dangling rows in scene-child tables.
    let mut dangling: Vec<Value> = Vec::new();
    for table in ["tracking", "comments", "timestamps", "watch_events"] {
        let col = if table == "tracking" { "scene_id" } else { "scene_id" };
        let sql = format!("SELECT COUNT(*) FROM {table} WHERE {col} NOT IN (SELECT id FROM scenes)");
        let n: i64 = conn.query_row(&sql, [], |r| r.get(0)).unwrap_or(0);
        if n > 0 {
            dangling.push(json!({ "table": table, "rows": n }));
        }
    }
    if dangling.is_empty() {
        checks.push(Check::pass("dangling_rows", "Child rows (tracking/comments/chapters)"));
    } else {
        checks.push(Check::issue("dangling_rows", "Child rows (tracking/comments/chapters)", "warn", dangling));
    }

    // 10. Duplicate scene identities.
    let mut dups: Vec<Value> = Vec::new();
    for (kind, sql) in [
        ("file_path", "SELECT file_path, COUNT(*) c FROM scenes WHERE file_path IS NOT NULL AND file_path != '' GROUP BY file_path HAVING c > 1 LIMIT 5"),
        ("file_name", "SELECT file_name, COUNT(*) c FROM scenes WHERE file_name IS NOT NULL AND file_name != '' GROUP BY file_name HAVING c > 1 LIMIT 5"),
    ] {
        if let Ok(mut stmt) = conn.prepare(sql) {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            }) {
                for (val, c) in rows.flatten() {
                    if dups.len() >= 5 {
                        break;
                    }
                    dups.push(json!({ "field": kind, "value": val, "scenes": c }));
                }
            }
        }
    }
    if dups.is_empty() {
        checks.push(Check::pass("duplicates", "Duplicate scene identities"));
    } else {
        checks.push(Check::issue("duplicates", "Duplicate scene identities", "warn", dups));
    }

    // 11. Missing files on disk.
    let missing: Vec<Value> = conn
        .prepare(
            "SELECT id, COALESCE(title,''), COALESCE(file_path,'') FROM scenes
             WHERE file_exists = 0 LIMIT 5",
        )
        .map(|mut s| {
            s.query_map([], |r| {
                Ok(json!({
                    "sceneId": r.get::<_, i64>(0)?,
                    "title": r.get::<_, String>(1)?,
                    "filePath": r.get::<_, String>(2)?,
                }))
            })
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
        })
        .unwrap_or_default();
    let missing_total: i64 = conn
        .query_row("SELECT COUNT(*) FROM scenes WHERE file_exists = 0", [], |r| r.get(0))
        .unwrap_or(0);
    if missing_total == 0 {
        checks.push(Check::pass("missing_files", "Files on disk"));
    } else {
        checks.push(Check {
            id: "missing_files",
            label: "Files on disk",
            status: "warn",
            count: missing_total,
            sample: missing,
        });
    }

    // 12. Media probe status (populated by the thumbnail/probe worker).
    let media: Vec<Value> = conn
        .prepare(
            "SELECT COALESCE(media_status,'ok'), COUNT(*) FROM scenes GROUP BY COALESCE(media_status,'ok')",
        )
        .map(|mut s| {
            s.query_map([], |r| {
                Ok(json!({ "status": r.get::<_, String>(0)?, "scenes": r.get::<_, i64>(1)? }))
            })
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
        })
        .unwrap_or_default();
    let bad_media: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM scenes WHERE media_status IS NOT NULL AND media_status != 'ok'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if bad_media == 0 {
        checks.push(Check {
            id: "media",
            label: "Media decodability",
            status: "pass",
            count: 0,
            sample: media,
        });
    } else {
        checks.push(Check {
            id: "media",
            label: "Media decodability",
            status: "warn",
            count: bad_media,
            sample: media,
        });
    }

    let fails = checks.iter().filter(|c| c.status == "fail").count();
    let warns = checks.iter().filter(|c| c.status == "warn").count();
    json!({
        "ok": fails == 0,
        "failures": fails,
        "warnings": warns,
        "schemaVersion": db_version,
        "expectedSchema": SCHEMA_VERSION,
        "checkedAt": crate::api::now_iso(),
        "checks": checks.iter().map(|c| c.json()).collect::<Vec<_>>(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_db_verifies() {
        let db = crate::seed::open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute("INSERT INTO studios(id,name) VALUES('s1','S1')", []).unwrap();
            conn.execute("INSERT INTO performers(id,name) VALUES('p1','P1')", []).unwrap();
            conn.execute(
                "INSERT INTO scenes(id,title,studio_id,performer_ids,category_ids,file_path,file_exists)
                 VALUES(1,'T','s1','[\"p1\"]','[]','Porn/x.mp4',1)",
                [],
            )
            .unwrap();
        }
        let v = verify(&db);
        assert_eq!(v["ok"], true);
        assert_eq!(v["failures"], 0);
        assert_eq!(v["warnings"], 0);
    }

    #[test]
    fn detects_planted_problems() {
        let db = crate::seed::open_memory();
        {
            let conn = db.lock().unwrap();
            // Bad performer + studio + category refs, malformed JSON,
            // dangling tracking, broken playlist + favorite, duplicate path.
            conn.execute(
                "INSERT INTO scenes(id,title,studio_id,performer_ids,category_ids,file_path)
                 VALUES(1,'A','ghost-studio','[\"ghost-perf\"]','[\"ghost-cat\"]','Porn/dup.mp4')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO scenes(id,title,performer_ids,file_path)
                 VALUES(2,'B','not-json','Porn/dup.mp4')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO tracking(scene_id,status,updated_at) VALUES(999,'want','x')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO playlists(name,scene_ids,created_at,updated_at)
                 VALUES('P','[1,999]','x','x')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO favorites(type,target_id,created_at) VALUES('scene','999','x')",
                [],
            )
            .unwrap();
        }
        let v = verify(&db);
        assert_eq!(v["ok"], false); // malformed JSON is a failure
        let by_id = |id: &str| {
            v["checks"].as_array().unwrap().iter().find(|c| c["id"] == id).cloned().unwrap()
        };
        assert_eq!(by_id("json")["status"], "fail");
        assert_eq!(by_id("performer_refs")["status"], "warn");
        assert_eq!(by_id("studio_refs")["status"], "warn");
        assert_eq!(by_id("category_refs")["status"], "warn");
        assert_eq!(by_id("playlist_refs")["status"], "warn");
        assert_eq!(by_id("favorite_refs")["status"], "warn");
        assert_eq!(by_id("dangling_rows")["status"], "warn");
        assert_eq!(by_id("duplicates")["status"], "warn");
    }
}
