use crate::api::now_iso;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use rusqlite::params;
use serde_json::{json, Value};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/{id}", get(one).put(update).delete(remove))
}

fn row_to_json(row: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "_id": row.get::<_, i64>(0)?,
        "name": row.get::<_, String>(1)?,
        "query": row.get::<_, String>(2)?,
        "created_at": row.get::<_, String>(3)?,
    }))
}

async fn list(State(state): State<AppState>) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, query, created_at FROM smart_collections ORDER BY created_at DESC")
        .unwrap();
    let list: Vec<Value> = stmt
        .query_map([], row_to_json)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(Value::Array(list))
}

async fn one(State(state): State<AppState>, Path(id): Path<i64>) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let row = conn
        .query_row(
            "SELECT id, name, query, created_at FROM smart_collections WHERE id = ?1",
            params![id],
            row_to_json,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    Ok(Json(row))
}

async fn create(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let name = body["name"].as_str().map(str::trim).filter(|s| !s.is_empty());
    let Some(name) = name else {
        return Err(StatusCode::BAD_REQUEST);
    };
    let query = body["query"].as_str().unwrap_or("").to_string();
    let conn = state.db.lock().unwrap();
    let now = now_iso();
    conn.execute(
        "INSERT INTO smart_collections (name, query, created_at) VALUES (?1,?2,?3)",
        params![name, query, now],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let id = conn.last_insert_rowid();
    let row = conn
        .query_row(
            "SELECT id, name, query, created_at FROM smart_collections WHERE id = ?1",
            params![id],
            row_to_json,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(row))
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut sets: Vec<String> = Vec::new();
    let mut vals: Vec<String> = Vec::new();
    for k in ["name", "query"] {
        if let Some(v) = body.get(k).and_then(|v| v.as_str()) {
            if k == "name" && v.trim().is_empty() {
                return Err(StatusCode::BAD_REQUEST);
            }
            sets.push(format!("{k} = ?"));
            vals.push(v.to_string());
        }
    }
    if sets.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let sql = format!("UPDATE smart_collections SET {} WHERE id = ?", sets.join(", "));
    let mut args: Vec<&dyn rusqlite::ToSql> = vals.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    args.push(&id);
    let n = conn
        .execute(&sql, args.as_slice())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if n == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    let row = conn
        .query_row(
            "SELECT id, name, query, created_at FROM smart_collections WHERE id = ?1",
            params![id],
            row_to_json,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    Ok(Json(row))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM smart_collections WHERE id = ?1", params![id])
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "ok": true })))
}
