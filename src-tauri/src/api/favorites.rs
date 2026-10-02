use crate::api::now_iso;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{delete, get};
use axum::{Json, Router};
use rusqlite::params;
use serde_json::{json, Value};
use std::collections::HashMap;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/{type}", get(list_by_type))
        .route("/{type}/{targetId}", delete(remove))
}

/// Scene ids currently favorited (`favorites` stores scene ids as TEXT
/// target_ids). Shared by the `fav` filter in scenes/search so both stay
/// in sync.
pub fn favorite_scene_ids(conn: &rusqlite::Connection) -> Vec<i64> {
    conn.prepare("SELECT target_id FROM favorites WHERE type = 'scene'")
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))
                .map(|rows| {
                    rows
                        .flatten()
                        .filter_map(|t| t.parse::<i64>().ok())
                        .collect()
                })
                .unwrap_or_default()
        })
        .unwrap_or_default()
}

/// Truthy `fav`/`favorite` param values: `?fav=1`, `?fav=yes`, `fav:yes`.
pub fn fav_requested(query: &HashMap<String, String>) -> bool {
    query
        .get("fav")
        .or_else(|| query.get("favorite"))
        .map(|v| {
            matches!(
                v.to_lowercase().as_str(),
                "1" | "true" | "yes" | "only" | "fav" | "favorites"
            )
        })
        .unwrap_or(false)
}

fn fav_from_row(row: &rusqlite::Row) -> rusqlite::Result<Value> {    Ok(json!({
        "_id": row.get::<_, i64>(0)?,
        "type": row.get::<_, String>(1)?,
        "target_id": row.get::<_, String>(2)?,
        "target_name": row.get::<_, Option<String>>(3)?,
        "created_at": row.get::<_, String>(4)?,
    }))
}

async fn list(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let mut cond = String::new();
    let mut ty: Option<String> = None;
    if let Some(t) = query.get("type") {
        cond = " WHERE type = ?".to_string();
        ty = Some(t.clone());
    }
    let sql = format!(
        "SELECT id, type, target_id, target_name, created_at FROM favorites{} ORDER BY created_at DESC",
        cond
    );
    let mut stmt = conn.prepare(&sql).unwrap();
    let list: Vec<Value> = match ty {
        Some(t) => stmt
            .query_map(params![t], fav_from_row)
            .unwrap()
            .filter_map(|r| r.ok())
            .collect(),
        None => stmt
            .query_map([], fav_from_row)
            .unwrap()
            .filter_map(|r| r.ok())
            .collect(),
    };
    Json(Value::Array(list))
}

async fn list_by_type(State(state): State<AppState>, Path(ty): Path<String>) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, type, target_id, target_name, created_at FROM favorites WHERE type = ?1 ORDER BY created_at DESC")
        .unwrap();
    let list: Vec<Value> = stmt
        .query_map(params![ty], fav_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(Value::Array(list))
}

async fn create(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let ty = body["type"].as_str().map(String::from);
    let target_id = body["target_id"]
        .as_str()
        .map(String::from)
        .or_else(|| body["target_id"].as_i64().map(|n| n.to_string()));
    let (Some(ty), Some(target_id)) = (ty, target_id) else {
        return Err(StatusCode::BAD_REQUEST);
    };
    if ty != "scene" && ty != "performer" && ty != "studio" {
        return Err(StatusCode::BAD_REQUEST);
    }
    let conn = state.db.lock().unwrap();
    let existing = conn
        .query_row(
            "SELECT id, type, target_id, target_name, created_at FROM favorites WHERE type = ?1 AND target_id = ?2",
            params![ty, target_id],
            fav_from_row,
        )
        .ok();
    if let Some(f) = existing {
        return Ok(Json(f));
    }
    let created_at = now_iso();
    conn.execute(
        "INSERT INTO favorites (type, target_id, target_name, created_at) VALUES (?1,?2,?3,?4)",
        params![ty, target_id, body["target_name"].as_str(), created_at],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let id = conn.last_insert_rowid();
    let fav = conn
        .query_row(
            "SELECT id, type, target_id, target_name, created_at FROM favorites WHERE id = ?1",
            params![id],
            fav_from_row,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(fav))
}

async fn remove(
    State(state): State<AppState>,
    Path((ty, target_id)): Path<(String, String)>,
) -> Result<Json<Value>, StatusCode> {
    if ty != "scene" && ty != "performer" && ty != "studio" {
        return Err(StatusCode::BAD_REQUEST);
    }
    let conn = state.db.lock().unwrap();
    conn.execute(
        "DELETE FROM favorites WHERE type = ?1 AND target_id = ?2",
        params![ty, target_id],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "ok": true })))
}