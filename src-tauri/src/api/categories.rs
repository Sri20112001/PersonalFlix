use crate::state::AppState;
use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(list))
}

async fn list(State(state): State<AppState>) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name FROM categories ORDER BY name COLLATE NOCASE ASC")
        .unwrap();
    let cats: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({ "_id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)? }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(Value::Array(cats))
}