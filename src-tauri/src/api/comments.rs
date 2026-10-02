use crate::api::{jcol, now_iso};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create))
        // NOTE: axum 0.8 requires the same capture name at one path position,
        // so GET (by scene) / PATCH (by comment) / DELETE (by comment) share
        // `{sceneId}` here; the handler decides by HTTP method.
        .route("/{sceneId}", get(list_by_scene).patch(update).delete(remove))
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

fn comment_from_row(row: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "_id": row.get::<_, i64>(0)?,
        "scene_id": row.get::<_, i64>(1)?,
        "text": row.get::<_, String>(2)?,
        "created_at": row.get::<_, String>(3)?,
        "performer_ids": jcol(row.get::<_, Option<String>>(4)?),
    }))
}

fn enrich(conn: &Connection, mut c: Value) -> Value {
    let ids: Vec<String> = c["performer_ids"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    c["performers"] = Value::Array(performer_cards(conn, &ids));
    c
}

async fn list_by_scene(State(state): State<AppState>, Path(scene_id): Path<i64>) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, scene_id, text, created_at, performer_ids FROM comments WHERE scene_id = ?1 ORDER BY created_at DESC")
        .unwrap();
    let list: Vec<Value> = stmt
        .query_map(params![scene_id], comment_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .map(|c| enrich(&conn, c))
        .collect();
    Json(Value::Array(list))
}

async fn create(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    let scene_id = body["scene_id"].as_i64();
    let text = body["text"].as_str().map(String::from);
    let (Some(scene_id), Some(text)) = (scene_id, text) else {
        return Err(StatusCode::BAD_REQUEST);
    };
    if text.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let ids = clean_ids(&body["performer_ids"]);
    let conn = state.db.lock().unwrap();
    let created_at = now_iso();
    let ok = conn
        .execute(
            "INSERT INTO comments (scene_id, text, created_at, performer_ids) VALUES (?1,?2,?3,?4)",
            params![scene_id, text, created_at, Value::Array(ids.into_iter().map(Value::String).collect()).to_string()],
        )
        .is_ok();
    if !ok {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    let id = conn.last_insert_rowid();
    let comment = conn
        .query_row(
            "SELECT id, scene_id, text, created_at, performer_ids FROM comments WHERE id = ?1",
            params![id],
            comment_from_row,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok((StatusCode::CREATED, Json(enrich(&conn, comment))))
}

/// PATCH /api/comments/{id} — partial update of `text` and/or `performer_ids`.
async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    if let Some(text) = body["text"].as_str() {
        if text.trim().is_empty() {
            return Err(StatusCode::BAD_REQUEST);
        }
        conn.execute(
            "UPDATE comments SET text = ?1 WHERE id = ?2",
            params![text, id],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if body.get("performer_ids").is_some() {
        let ids = clean_ids(&body["performer_ids"]);
        conn.execute(
            "UPDATE comments SET performer_ids = ?1 WHERE id = ?2",
            params![Value::Array(ids.into_iter().map(Value::String).collect()).to_string(), id],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    let comment = conn
        .query_row(
            "SELECT id, scene_id, text, created_at, performer_ids FROM comments WHERE id = ?1",
            params![id],
            comment_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    Ok(Json(enrich(&conn, comment)))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM comments WHERE id = ?1", params![id])
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "ok": true })))
}
