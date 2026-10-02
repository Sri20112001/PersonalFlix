use crate::api::{jcol, now_iso, resolve_video_path};
use crate::settings::Settings;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Json, Router};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create))
        .route("/{id}", get(list_by_scene).patch(update).delete(remove))
        .route("/{id}/thumbnail", get(thumbnail))
}

/// Clean a client-supplied id list: strings only, trimmed, non-empty, deduped.
fn clean_ids(v: &Value) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    if let Some(arr) = v.as_array() {
        for item in arr {
            if let Some(s) = item.as_str() {
                let s = s.trim();
                if !s.is_empty() && seen.insert(s.to_string()) {
                    out.push(s.to_string());
                }
            }
        }
    }
    out
}

fn performer_cards(conn: &Connection, ids: &[String]) -> Vec<Value> {
    if ids.is_empty() {
        return vec![];
    }
    let ph = vec!["?"; ids.len()].join(",");
    let sql = format!(
        "SELECT id, name, image_url FROM performers WHERE id IN ({})",
        ph
    );
    let mut map: HashMap<String, Value> = HashMap::new();
    if let Ok(mut stmt) = conn.prepare(&sql) {
        if let Ok(rows) = stmt.query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        }) {
            for r in rows.flatten() {
                map.insert(
                    r.0.clone(),
                    json!({ "_id": r.0, "name": r.1, "image_url": r.2 }),
                );
            }
        }
    }
    ids.iter()
        .filter_map(|id| map.get(id).cloned())
        .collect()
}

fn stamp_from_row(row: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "_id": row.get::<_, i64>(0)?,
        "scene_id": row.get::<_, i64>(1)?,
        "seconds": row.get::<_, f64>(2)?,
        "label": row.get::<_, String>(3)?,
        "note": row.get::<_, Option<String>>(4)?,
        "end_seconds": row.get::<_, Option<f64>>(5)?,
        "category": row.get::<_, Option<String>>(6)?,
        "created_at": row.get::<_, String>(7)?,
        "performer_ids": jcol(row.get::<_, Option<String>>(8)?),
    }))
}

fn enrich(conn: &Connection, mut t: Value) -> Value {
    let ids: Vec<String> = t["performer_ids"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    t["performers"] = Value::Array(performer_cards(conn, &ids));
    t
}

const STAMP_COLS: &str =
    "id, scene_id, seconds, label, note, end_seconds, category, created_at, performer_ids";

async fn list_by_scene(State(state): State<AppState>, Path(id): Path<i64>) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(&format!("SELECT {} FROM timestamps WHERE scene_id = ?1 ORDER BY seconds ASC", STAMP_COLS))
        .unwrap();
    let list: Vec<Value> = stmt
        .query_map(params![id], stamp_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .map(|t| enrich(&conn, t))
        .collect();
    Json(Value::Array(list))
}

async fn create(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    let scene_id = body["scene_id"].as_i64();
    let seconds = body["seconds"].as_f64();
    let label = body["label"].as_str().map(String::from);
    let (Some(scene_id), Some(seconds), Some(label)) = (scene_id, seconds, label) else {
        return Err(StatusCode::BAD_REQUEST);
    };
    let ids = clean_ids(&body["performer_ids"]);
    let conn = state.db.lock().unwrap();
    let created_at = now_iso();
    let ok = conn
        .execute(
            "INSERT INTO timestamps (scene_id, seconds, label, note, end_seconds, category, created_at, performer_ids) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                scene_id,
                seconds,
                label,
                body["note"].as_str(),
                body["end_seconds"].as_f64(),
                body["category"].as_str(),
                created_at,
                Value::Array(ids.into_iter().map(Value::String).collect()).to_string()
            ],
        )
        .is_ok();
    if !ok {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    let id = conn.last_insert_rowid();
    let stamp = conn
        .query_row(
            &format!("SELECT {} FROM timestamps WHERE id = ?1", STAMP_COLS),
            params![id],
            stamp_from_row,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok((StatusCode::CREATED, Json(enrich(&conn, stamp))))
}

/// Partial update of a timestamp (chapter): label, seconds, end_seconds,
/// category, note, performer_ids. Omitted fields keep their current value.
async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE timestamps SET
           seconds = COALESCE(?1, seconds),
           label = COALESCE(?2, label),
           note = COALESCE(?3, note),
           end_seconds = COALESCE(?4, end_seconds),
           category = COALESCE(?5, category)
         WHERE id = ?6",
        params![
            body["seconds"].as_f64(),
            body["label"].as_str(),
            body["note"].as_str(),
            body["end_seconds"].as_f64(),
            body["category"].as_str(),
            id
        ],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if body.get("performer_ids").is_some() {
        let ids = clean_ids(&body["performer_ids"]);
        conn.execute(
            "UPDATE timestamps SET performer_ids = ?1 WHERE id = ?2",
            params![Value::Array(ids.into_iter().map(Value::String).collect()).to_string(), id],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    let stamp = conn
        .query_row(
            &format!("SELECT {} FROM timestamps WHERE id = ?1", STAMP_COLS),
            params![id],
            stamp_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    drop(conn);
    // Retimed chapters re-render on next request (time is in the filename).
    clear_chapter_thumbs(id, None);
    Ok(Json(enrich(
        &state.db.lock().unwrap(),
        stamp,
    )))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM timestamps WHERE id = ?1", params![id])
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    drop(conn);
    clear_chapter_thumbs(id, None);
    Ok(Json(json!({ "ok": true })))
}

/// Representative frame time for a chapter: midpoint of its span when it has
/// one, else a couple seconds in (skips the cut/fade frame at the boundary).
fn chapter_thumb_time(start: f64, end: Option<f64>) -> f64 {
    match end {
        Some(e) if e > start => (start + e) / 2.0,
        _ => start + 2.0,
    }
    .max(0.0)
}

fn chapter_thumb_dir() -> std::path::PathBuf {
    let d = Settings::data_dir().join("chapter_thumbs");
    let _ = std::fs::create_dir_all(&d);
    d
}

/// Remove cached thumbnails for a chapter, except `keep` when given.
/// The frame time is baked into the filename (`{id}_{ms}.jpg`), so a
/// retimed chapter naturally re-renders while stale files are swept here.
fn clear_chapter_thumbs(id: i64, keep: Option<&std::path::Path>) {
    let dir = Settings::data_dir().join("chapter_thumbs");
    let prefix = format!("{id}_");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().into_owned();
        if !name.starts_with(&prefix)
            || p.extension().and_then(|x| x.to_str()) != Some("jpg")
        {
            continue;
        }
        if keep.map(|k| p == k).unwrap_or(false) {
            continue;
        }
        let _ = std::fs::remove_file(&p);
    }
}

/// Chapter thumbnail: a frame from inside the chapter's own span, rendered
/// on demand with ffmpeg and cached on disk. 404 when the scene, video, or
/// frame is unavailable.
async fn thumbnail(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Response<Body>, StatusCode> {
    let (scene_id, start, end): (i64, f64, Option<f64>) = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT scene_id, seconds, end_seconds FROM timestamps WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| StatusCode::NOT_FOUND)?
    };
    let file_path: Option<String> = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT file_path FROM scenes WHERE id = ?1",
            params![scene_id],
            |r| r.get(0),
        )
        .ok()
    };
    let video = file_path
        .as_deref()
        .and_then(|fp| resolve_video_path(&state.library_path, fp))
        .filter(|p| p.exists())
        .ok_or(StatusCode::NOT_FOUND)?;

    let t = chapter_thumb_time(start, end);
    let cached = chapter_thumb_dir().join(format!("{id}_{}.jpg", (t * 1000.0).round() as u64));
    clear_chapter_thumbs(id, Some(&cached));
    if !cached.exists() {
        let out = cached.to_string_lossy().to_string();
        let vid = video.to_string_lossy().to_string();
        let t_str = t.to_string();
        let status = tokio::process::Command::new("ffmpeg")
            .args([
                "-y", "-v", "error", "-ss", &t_str, "-i", &vid, "-frames:v", "1",
                "-q:v", "4", "-vf", "scale=320:-1", &out,
            ])
            .status()
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        if !status.success() || !cached.exists() {
            let _ = std::fs::remove_file(&cached);
            return Err(StatusCode::NOT_FOUND);
        }
    }
    let bytes = std::fs::read(&cached).map_err(|_| StatusCode::NOT_FOUND)?;
    Response::builder()
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", "public, max-age=86400")
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
