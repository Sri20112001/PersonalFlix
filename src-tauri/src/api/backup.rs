use crate::api::now_iso;
use crate::db::meta_set;
use crate::settings::Settings;
use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use rusqlite::params;
use serde_json::{json, Value};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/export", get(export))
        .route("/import", axum::routing::post(import))
        .route("/list", get(list))
        .route("/run", axum::routing::post(run_now))
}

/// Read every user-generated table into a portable JSON document.
/// Scenes/performers/etc. are seed-derived and intentionally excluded.
fn export_data(state: &AppState) -> Value {
    let conn = state.db.lock().unwrap();
    let all = |sql: &str| -> Vec<Value> {
        let mut stmt = match conn.prepare(sql) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rows = match stmt.query_map([], |r| {
            let mut o = serde_json::Map::new();
            for (i, c) in cols.iter().enumerate() {
                let v: rusqlite::types::Value = r.get(i)?;
                o.insert(
                    c.clone(),
                    match v {
                        rusqlite::types::Value::Null => Value::Null,
                        rusqlite::types::Value::Integer(n) => json!(n),
                        rusqlite::types::Value::Real(f) => json!(f),
                        rusqlite::types::Value::Text(s) => json!(s),
                        rusqlite::types::Value::Blob(b) => json!(b),
                    },
                );
            }
            Ok(Value::Object(o))
        }) {
            Ok(q) => q,
            Err(_) => return vec![],
        };
        rows.flatten().collect()
    };
    let tracking = all("SELECT scene_id, status, rating, notes, currentTime, duration, updated_at FROM tracking");
    let favorites = all("SELECT id, type, target_id, target_name, created_at FROM favorites");
    let playlists = all("SELECT id, name, description, scene_ids, created_at, updated_at FROM playlists");
    let timestamps = all("SELECT id, scene_id, seconds, label, note, end_seconds, category, created_at FROM timestamps");
    let comments = all("SELECT id, scene_id, text, created_at FROM comments");
    let collections = all("SELECT id, name, query, created_at FROM smart_collections");
    json!({
        "app": "personalflix",
        "format": 1,
        "exported_at": now_iso(),
        "data": {
            "tracking": tracking,
            "favorites": favorites,
            "playlists": playlists,
            "timestamps": timestamps,
            "comments": comments,
            "collections": collections,
        }
    })
}

async fn export(State(state): State<AppState>) -> Json<Value> {
    Json(export_data(&state))
}

/// Restore a document produced by /export. Replaces the five user tables
/// wholesale inside a single transaction (all-or-nothing).
async fn import(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let data = &body["data"];
    if body["app"] != json!("personalflix") || data.is_null() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let counts = (|| -> rusqlite::Result<Value> {
        tx.execute("DELETE FROM tracking", [])?;
        tx.execute("DELETE FROM favorites", [])?;
        tx.execute("DELETE FROM playlists", [])?;
        tx.execute("DELETE FROM timestamps", [])?;
        tx.execute("DELETE FROM comments", [])?;
        tx.execute("DELETE FROM smart_collections", [])?;

        let mut n_tracking = 0;
        if let Some(rows) = data["tracking"].as_array() {
            for r in rows {
                tx.execute(
                    "INSERT INTO tracking (scene_id, status, rating, notes, currentTime, duration, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                    params![
                        r["scene_id"].as_i64(),
                        r["status"].as_str().unwrap_or("want-to-watch"),
                        r["rating"].as_i64(),
                        r["notes"].as_str(),
                        r["currentTime"].as_f64().unwrap_or(0.0),
                        r["duration"].as_f64(),
                        r["updated_at"].as_str().unwrap_or(""),
                    ],
                )?;
                n_tracking += 1;
            }
        }
        let mut n_fav = 0;
        if let Some(rows) = data["favorites"].as_array() {
            for r in rows {
                let ty = r["type"].as_str().unwrap_or("");
                if ty != "scene" && ty != "performer" && ty != "studio" {
                    continue;
                }
                let tid = r["target_id"]
                    .as_str()
                    .map(String::from)
                    .or_else(|| r["target_id"].as_i64().map(|n| n.to_string()));
                let Some(tid) = tid else { continue };
                tx.execute(
                    "INSERT INTO favorites (id, type, target_id, target_name, created_at) VALUES (?1,?2,?3,?4,?5)",
                    params![
                        r["id"].as_i64(),
                        ty,
                        tid,
                        r["target_name"].as_str(),
                        r["created_at"].as_str().unwrap_or(""),
                    ],
                )?;
                n_fav += 1;
            }
        }
        let mut n_pl = 0;
        if let Some(rows) = data["playlists"].as_array() {
            for r in rows {
                let Some(name) = r["name"].as_str() else { continue };
                tx.execute(
                    "INSERT INTO playlists (id, name, description, scene_ids, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
                    params![
                        r["id"].as_i64(),
                        name,
                        r["description"].as_str(),
                        r["scene_ids"].as_array().and_then(|a| serde_json::to_string(a).ok()).as_deref().unwrap_or("[]"),
                        r["created_at"].as_str().unwrap_or(""),
                        r["updated_at"].as_str().unwrap_or(""),
                    ],
                )?;
                n_pl += 1;
            }
        }
        let mut n_ts = 0;
        if let Some(rows) = data["timestamps"].as_array() {
            for r in rows {
                tx.execute(
                    "INSERT INTO timestamps (id, scene_id, seconds, label, note, end_seconds, category, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                    params![
                        r["id"].as_i64(),
                        r["scene_id"].as_i64(),
                        r["seconds"].as_f64().unwrap_or(0.0),
                        r["label"].as_str().unwrap_or(""),
                        r["note"].as_str(),
                        r["end_seconds"].as_f64(),
                        r["category"].as_str(),
                        r["created_at"].as_str().unwrap_or(""),
                    ],
                )?;
                n_ts += 1;
            }
        }
        let mut n_c = 0;
        if let Some(rows) = data["comments"].as_array() {
            for r in rows {
                tx.execute(
                    "INSERT INTO comments (id, scene_id, text, created_at) VALUES (?1,?2,?3,?4)",
                    params![
                        r["id"].as_i64(),
                        r["scene_id"].as_i64(),
                        r["text"].as_str().unwrap_or(""),
                        r["created_at"].as_str().unwrap_or(""),
                    ],
                )?;
                n_c += 1;
            }
        }
        let mut n_col = 0;
        if let Some(rows) = data["collections"].as_array() {
            for r in rows {
                let Some(name) = r["name"].as_str().filter(|s| !s.trim().is_empty()) else { continue };
                tx.execute(
                    "INSERT INTO smart_collections (id, name, query, created_at) VALUES (?1,?2,?3,?4)",
                    params![
                        r["id"].as_i64(),
                        name,
                        r["query"].as_str().unwrap_or(""),
                        r["created_at"].as_str().unwrap_or(""),
                    ],
                )?;
                n_col += 1;
            }
        }
        Ok(json!({ "tracking": n_tracking, "favorites": n_fav, "playlists": n_pl, "timestamps": n_ts, "comments": n_c, "collections": n_col }))
    })();
    match counts {
        Ok(c) => {
            tx.commit().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            Ok(Json(json!({ "ok": true, "restored": c })))
        }
        Err(_) => Err(StatusCode::BAD_REQUEST),
    }
}

/// Write the export document to %LOCALAPPDATA%/PersonalFlix/backups/,
/// prune to the 10 newest, and record meta backup_last. Shared by the
/// /run endpoint and the startup auto-backup check.
pub fn write_backup_file(state: &AppState) -> Result<(String, u64), String> {
    let doc = export_data(state);
    let dir = Settings::backups_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = chrono::Utc::now().format("%Y-%m-%d_%H%M%S").to_string();
    let name = format!("personalflix-backup-{stamp}.json");
    let path = dir.join(&name);
    let bytes = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    // Prune oldest, keep 10.
    if let Ok(mut entries) = std::fs::read_dir(&dir)
        .map(|rd| rd.flatten().collect::<Vec<_>>())
    {
        entries.sort_by_key(|e| e.file_name());
        while entries.len() > 10 {
            if let Some(old) = entries.first() {
                let _ = std::fs::remove_file(old.path());
            }
            entries.remove(0);
        }
    }
    let now = now_iso();
    meta_set(&state.db, "backup_last", &now);
    Ok((name, bytes.len() as u64))
}

async fn run_now(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    match write_backup_file(&state) {
        Ok((name, bytes)) => Ok(Json(json!({ "ok": true, "file": name, "bytes": bytes }))),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn list(State(state): State<AppState>) -> Json<Value> {
    let dir = Settings::backups_dir();
    let mut files: Vec<Value> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if !name.ends_with(".json") {
                continue;
            }
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            files.push(json!({ "name": name, "bytes": size }));
        }
    }
    files.sort_by(|a, b| b["name"].as_str().cmp(&a["name"].as_str()));
    let last: Option<String> = {
        let conn = state.db.lock().unwrap();
        conn.query_row("SELECT value FROM meta WHERE key='backup_last'", [], |r| r.get(0)).ok()
    };
    Json(json!({ "backups": files, "lastBackup": last, "dir": dir.to_string_lossy() }))
}

/// On startup: if backup_mode is daily/weekly and the last backup is older
/// than the interval (or never ran), write one. Best-effort, never fatal.
pub fn maybe_auto_backup(state: &AppState) {
    let mode = Settings::load().backup_mode();
    if mode == "off" {
        return;
    }
    let hours: i64 = if mode == "daily" { 24 } else { 24 * 7 };
    let last: Option<String> = {
        let conn = state.db.lock().unwrap();
        conn.query_row("SELECT value FROM meta WHERE key='backup_last'", [], |r| r.get(0)).ok()
    };
    let due = match last {
        None => true,
        Some(s) => match chrono::DateTime::parse_from_rfc3339(&s) {
            Ok(dt) => (chrono::Utc::now() - dt.with_timezone(&chrono::Utc)).num_hours() >= hours,
            Err(_) => true,
        },
    };
    if due {
        if let Err(e) = write_backup_file(state) {
            tracing::warn!("auto backup failed: {e}");
        } else {
            tracing::info!("auto backup written (mode={mode})");
        }
    }
}
