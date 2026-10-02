use crate::api::scenes::{scene_from_row, SCENE_COLS};
use crate::api::{jcol, json_val_to_sqlite};
use crate::api::now_iso;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{delete, get};
use axum::{Json, Router};
use rusqlite::{params, types::Value};
use serde_json::{json, Value as JValue};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/{id}", get(one).put(update).delete(remove))
        .route("/{id}/scenes", get(playlist_scenes).post(add_scene).put(reorder_scenes))
        .route("/{id}/scenes/{sceneId}", delete(remove_scene))
}

fn playlist_from_row(row: &rusqlite::Row) -> rusqlite::Result<JValue> {
    Ok(json!({
        "_id": row.get::<_, i64>(0)?,
        "name": row.get::<_, String>(1)?,
        "description": row.get::<_, Option<String>>(2)?,
        "scene_ids": jcol(row.get::<_, Option<String>>(3)?),
        "created_at": row.get::<_, String>(4)?,
        "updated_at": row.get::<_, String>(5)?,
    }))
}

async fn list(State(state): State<AppState>) -> Json<JValue> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, description, scene_ids, created_at, updated_at FROM playlists ORDER BY updated_at DESC")
        .unwrap();
    let list: Vec<JValue> = stmt
        .query_map([], playlist_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(JValue::Array(list))
}

async fn one(State(state): State<AppState>, Path(id): Path<i64>) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let playlist = conn
        .query_row(
            "SELECT id, name, description, scene_ids, created_at, updated_at FROM playlists WHERE id = ?1",
            params![id],
            playlist_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let scene_ids: Vec<i64> = playlist["scene_ids"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).collect())
        .unwrap_or_default();

    let scenes = if scene_ids.is_empty() {
        vec![]
    } else {
        let ph = vec!["?"; scene_ids.len()].join(",");
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {} FROM scenes WHERE id IN ({})",
                SCENE_COLS, ph
            ))
            .unwrap();
        let fetched: Vec<JValue> = stmt
            .query_map(rusqlite::params_from_iter(scene_ids.iter()), scene_from_row)
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        let mut map: std::collections::HashMap<i64, JValue> = std::collections::HashMap::new();
        for s in fetched {
            if let Some(id) = s["_id"].as_i64() {
                map.insert(id, s);
            }
        }
        scene_ids.iter().filter_map(|id| map.remove(id)).collect()
    };

    let mut out = playlist;
    out["scenes"] = JValue::Array(scenes);
    Ok(Json(out))
}

async fn create(State(state): State<AppState>, Json(body): Json<JValue>) -> Result<Json<JValue>, StatusCode> {
    let name = body["name"].as_str().map(String::from);
    let Some(name) = name else {
        return Err(StatusCode::BAD_REQUEST);
    };
    let conn = state.db.lock().unwrap();
    let now = now_iso();
    conn.execute(
        "INSERT INTO playlists (name, description, scene_ids, created_at, updated_at) VALUES (?1,?2,'[]',?3,?3)",
        params![name, body["description"].as_str(), now],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let id = conn.last_insert_rowid();
    let playlist = conn
        .query_row(
            "SELECT id, name, description, scene_ids, created_at, updated_at FROM playlists WHERE id = ?1",
            params![id],
            playlist_from_row,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(playlist))
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<JValue>,
) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();
    for k in ["name", "description"] {
        if let Some(v) = body.get(k) {
            sets.push(format!("{} = ?", k));
            params.push(json_val_to_sqlite(v));
        }
    }
    if sets.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    sets.push("updated_at = ?".into());
    params.push(now_iso().into());
    params.push(id.into());
    let sql = format!("UPDATE playlists SET {} WHERE id = ?", sets.join(", "));
    let n = conn
        .execute(&sql, rusqlite::params_from_iter(params.iter()))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if n == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    let playlist = conn
        .query_row(
            "SELECT id, name, description, scene_ids, created_at, updated_at FROM playlists WHERE id = ?1",
            params![id],
            playlist_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    Ok(Json(playlist))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "ok": true })))
}

fn read_scene_ids(conn: &rusqlite::Connection, id: i64) -> Vec<i64> {
    conn.query_row(
        "SELECT scene_ids FROM playlists WHERE id = ?1",
        params![id],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| serde_json::from_str::<Vec<JValue>>(&s).ok())
    .map(|v| {
        v.iter()
            .filter_map(|x| x.as_i64().or_else(|| x.as_str().and_then(|s| s.parse().ok())))
            .collect()
    })
    .unwrap_or_default()
}

fn write_scene_ids(conn: &rusqlite::Connection, id: i64, ids: &[i64]) -> rusqlite::Result<usize> {
    let s = serde_json::to_string(ids).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "UPDATE playlists SET scene_ids = ?1, updated_at = ?2 WHERE id = ?3",
        params![s, now_iso(), id],
    )
}

async fn add_scene(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<JValue>,
) -> Result<Json<JValue>, StatusCode> {
    let scene_id = body["scene_id"]
        .as_i64()
        .or_else(|| body["scene_id"].as_str().and_then(|s| s.parse().ok()));
    let Some(scene_id) = scene_id else {
        return Err(StatusCode::BAD_REQUEST);
    };
    let conn = state.db.lock().unwrap();
    let mut ids = read_scene_ids(&conn, id);
    if ids.is_empty() && !conn
        .query_row("SELECT 1 FROM playlists WHERE id = ?1", params![id], |r| r.get::<_, i64>(0))
        .is_ok()
    {
        return Err(StatusCode::NOT_FOUND);
    }
    if !ids.contains(&scene_id) {
        ids.push(scene_id);
    }
    write_scene_ids(&conn, id, &ids).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let playlist = conn
        .query_row(
            "SELECT id, name, description, scene_ids, created_at, updated_at FROM playlists WHERE id = ?1",
            params![id],
            playlist_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    Ok(Json(playlist))
}

async fn playlist_scenes(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let ids = read_scene_ids(&conn, id);
    if ids.is_empty() && !conn
        .query_row("SELECT 1 FROM playlists WHERE id = ?1", params![id], |r| r.get::<_, i64>(0))
        .is_ok()
    {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(Json(json!({ "scene_ids": ids })))
}

async fn reorder_scenes(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<JValue>,
) -> Result<Json<JValue>, StatusCode> {
    let scene_ids = body["scene_ids"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                .collect::<Vec<i64>>()
        })
        .unwrap_or_default();
    let conn = state.db.lock().unwrap();
    let exists = conn
        .query_row("SELECT 1 FROM playlists WHERE id = ?1", params![id], |r| r.get::<_, i64>(0))
        .is_ok();
    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }
    write_scene_ids(&conn, id, &scene_ids).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let playlist = conn
        .query_row(
            "SELECT id, name, description, scene_ids, created_at, updated_at FROM playlists WHERE id = ?1",
            params![id],
            playlist_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    Ok(Json(playlist))
}

async fn remove_scene(
    State(state): State<AppState>,
    Path((id, scene_id)): Path<(i64, i64)>,
) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut ids = read_scene_ids(&conn, id);
    if ids.is_empty() && !conn
        .query_row("SELECT 1 FROM playlists WHERE id = ?1", params![id], |r| r.get::<_, i64>(0))
        .is_ok()
    {
        return Err(StatusCode::NOT_FOUND);
    }
    ids.retain(|x| *x != scene_id);
    write_scene_ids(&conn, id, &ids).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let playlist = conn
        .query_row(
            "SELECT id, name, description, scene_ids, created_at, updated_at FROM playlists WHERE id = ?1",
            params![id],
            playlist_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    Ok(Json(playlist))
}