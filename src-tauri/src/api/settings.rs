use crate::settings::Settings;
use crate::state::AppState;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value as JValue};

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(get_settings).put(update_settings))
}

fn to_json(s: &Settings) -> JValue {
    json!({
        "library_path": s.library_path,
        "server_port": s.server_port,
        "keybindings": s.keybindings,
        "backup_mode": s.backup_mode(),
        "whisper_model": s.whisper_model_name(),
    })
}

async fn get_settings() -> Json<JValue> {
    Json(to_json(&Settings::load()))
}

async fn update_settings(Json(body): Json<JValue>) -> Result<Json<JValue>, StatusCode> {
    let mut settings = Settings::load();
    if let Some(v) = body.get("library_path").and_then(|v| v.as_str()) {
        settings.library_path = Some(v.to_string());
    }
    if let Some(v) = body.get("server_port").and_then(|v| v.as_u64()) {
        settings.server_port = Some(v as u16);
    }
    if let Some(v) = body.get("backup_mode").and_then(|v| v.as_str()) {
        settings.backup_mode = Some(match v {
            "daily" => "daily".to_string(),
            "weekly" => "weekly".to_string(),
            _ => "off".to_string(),
        });
    }
    if let Some(v) = body.get("whisper_model").and_then(|v| v.as_str()) {
        let v = v.trim();
        // Accept "auto", a size token, or an exact staged model filename.
        let known = crate::api::transcribe::model_names();
        let token = v.to_lowercase();
        let ok = token == "auto"
            || ["tiny", "base", "small", "medium", "large"].contains(&token.as_str())
            || known.iter().any(|n| n.eq_ignore_ascii_case(v));
        if ok {
            settings.whisper_model = Some(if token == "auto" { "auto".into() } else { v.into() });
        }
    }
    if let Some(kb) = body.get("keybindings").and_then(|v| v.as_object()) {
        let mut map = settings.keybindings.take().unwrap_or_default();
        for (k, v) in kb {
            if let Some(val) = v.as_str() {
                map.insert(k.clone(), val.to_string());
            }
        }
        settings.keybindings = Some(map);
    }
    settings.save();
    Ok(Json(to_json(&settings)))
}
