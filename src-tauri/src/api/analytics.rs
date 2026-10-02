use crate::state::AppState;
use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

pub fn routes() -> Router<AppState> {
    Router::new().route("/overview", get(overview))
}

async fn overview(State(state): State<AppState>) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let count = |sql: &str| -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0)
    };
    let scenes_total = count("SELECT COUNT(*) FROM scenes");
    let watched = count("SELECT COUNT(*) FROM tracking WHERE status = 'watched'");
    let watching = count("SELECT COUNT(*) FROM tracking WHERE status = 'watching'");
    let want = count("SELECT COUNT(*) FROM tracking WHERE status IN ('want','want-to-watch')");
    let skipped = count("SELECT COUNT(*) FROM tracking WHERE status = 'skip'");
    let seconds: f64 = conn
        .query_row("SELECT COALESCE(SUM(currentTime),0) FROM tracking", [], |r| r.get(0))
        .unwrap_or(0.0);
    let avg_rating: Option<f64> = conn
        .query_row("SELECT AVG(rating) FROM tracking WHERE rating IS NOT NULL", [], |r| r.get(0))
        .ok()
        .flatten();
    let rated: i64 = count("SELECT COUNT(*) FROM tracking WHERE rating IS NOT NULL");

    // ---- Watch-time details (all derived from tracking.currentTime / duration) ----
    let val_f64 = |sql: &str| -> f64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0.0)
    };
    let seconds_today = val_f64(
        "SELECT COALESCE(SUM(currentTime),0) FROM tracking WHERE date(updated_at) = date('now')",
    );
    let seconds_7d = val_f64(
        "SELECT COALESCE(SUM(currentTime),0) FROM tracking WHERE date(updated_at) >= date('now','-6 days')",
    );
    let seconds_30d = val_f64(
        "SELECT COALESCE(SUM(currentTime),0) FROM tracking WHERE date(updated_at) >= date('now','-29 days')",
    );
    let sessions_today = count("SELECT COUNT(*) FROM tracking WHERE date(updated_at) = date('now')");
    let sessions_7d =
        count("SELECT COUNT(*) FROM tracking WHERE date(updated_at) >= date('now','-6 days')");
    let sessions_30d =
        count("SELECT COUNT(*) FROM tracking WHERE date(updated_at) >= date('now','-29 days')");
    let total_duration: f64 = val_f64(
        "SELECT COALESCE(SUM(duration),0) FROM tracking WHERE duration IS NOT NULL AND duration > 0",
    );
    let remaining_seconds: f64 = val_f64(
        "SELECT COALESCE(SUM(CASE WHEN duration > currentTime THEN duration - currentTime ELSE 0 END),0) FROM tracking WHERE duration IS NOT NULL AND duration > 0",
    );
    let avg_per_day_30 = if seconds_30d > 0.0 { seconds_30d / 30.0 } else { 0.0 };
    let avg_per_scene = if watched > 0 { seconds / watched as f64 } else { 0.0 };

    // Daily trend, last 30 days (zero-filled so the chart is continuous).
    let mut daily_map: std::collections::HashMap<String, (i64, f64)> =
        std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT substr(updated_at,1,10), COUNT(*), COALESCE(SUM(currentTime),0)
         FROM tracking WHERE date(updated_at) >= date('now','-29 days')
         GROUP BY substr(updated_at,1,10)",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                r.get::<_, i64>(1)?,
                r.get::<_, f64>(2)?,
            ))
        }) {
            for r in rows.flatten() {
                if r.0.len() >= 10 {
                    daily_map.insert(r.0, (r.1, r.2));
                }
            }
        }
    }
    let mut daily = Vec::new();
    let today = chrono::Utc::now().date_naive();
    for back in (0..30).rev() {
        let d = today - chrono::Duration::days(back);
        let key = d.format("%Y-%m-%d").to_string();
        let (c, s) = daily_map.get(&key).cloned().unwrap_or((0, 0.0));
        daily.push(json!({ "day": key, "count": c, "seconds": s }));
    }

    // Rating distribution 1..5.
    let mut rating_buckets = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT rating, COUNT(*) FROM tracking WHERE rating BETWEEN 1 AND 5 GROUP BY rating ORDER BY rating",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
        }) {
            for r in rows.flatten() {
                rating_buckets.push(json!({ "rating": r.0, "count": r.1 }));
            }
        }
    }

    // Top scenes by watch time (with title for display).
    let mut top_scenes = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT t.scene_id, COALESCE(s.title, s.file_name, ''), COALESCE(t.currentTime,0), t.duration
         FROM tracking t LEFT JOIN scenes s ON s.id = t.scene_id
         ORDER BY t.currentTime DESC LIMIT 8",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, f64>(2)?,
                r.get::<_, Option<f64>>(3)?,
            ))
        }) {
            for r in rows.flatten() {
                top_scenes.push(json!({
                    "scene_id": r.0, "title": r.1, "seconds": r.2, "duration": r.3,
                }));
            }
        }
    }

    // Top studios by watched scenes (with seconds watched).
    let mut top_studios = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT COALESCE(s.studio,'') , COUNT(*), COALESCE(SUM(t.currentTime),0)
         FROM tracking t JOIN scenes s ON s.id = t.scene_id
         WHERE t.status = 'watched' AND COALESCE(s.studio,'') != ''
         GROUP BY s.studio ORDER BY COUNT(*) DESC LIMIT 8",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, f64>(2)?))
        }) {
            for r in rows.flatten() {
                top_studios.push(json!({ "name": r.0, "count": r.1, "seconds": r.2 }));
            }
        }
    }

    // Top categories across watched scenes (with seconds watched).
    let mut top_categories = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT COALESCE(c.name, j.value), COUNT(*), COALESCE(SUM(t.currentTime),0)
         FROM tracking t JOIN scenes s ON s.id = t.scene_id,
              json_each(s.category_ids) j LEFT JOIN categories c ON c.id = j.value
         WHERE t.status = 'watched'
         GROUP BY j.value ORDER BY COUNT(*) DESC LIMIT 8",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, f64>(2)?,
            ))
        }) {
            for r in rows.flatten() {
                top_categories.push(json!({ "name": r.0, "count": r.1, "seconds": r.2 }));
            }
        }
    }

    // Top performers (display names) across watched scenes (with seconds watched).
    let mut top_performers = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT j.value, COUNT(*), COALESCE(SUM(t.currentTime),0)
         FROM tracking t JOIN scenes s ON s.id = t.scene_id,
              json_each(s.performers) j
         WHERE t.status = 'watched'
         GROUP BY j.value ORDER BY COUNT(*) DESC LIMIT 8",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, f64>(2)?,
            ))
        }) {
            for r in rows.flatten() {
                top_performers.push(json!({ "name": r.0, "count": r.1, "seconds": r.2 }));
            }
        }
    }

    // Weekly activity, last 8 weeks (year-week buckets).
    let mut weekly = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT strftime('%Y-W%W', updated_at), COUNT(*), COALESCE(SUM(currentTime),0)
         FROM tracking WHERE updated_at IS NOT NULL AND updated_at != ''
         GROUP BY strftime('%Y-W%W', updated_at) ORDER BY 1 DESC LIMIT 8",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                r.get::<_, i64>(1)?,
                r.get::<_, f64>(2)?,
            ))
        }) {
            let mut w: Vec<_> = rows.flatten().collect();
            w.reverse();
            for r in w {
                weekly.push(json!({ "week": r.0, "count": r.1, "seconds": r.2 }));
            }
        }
    }

    // Exact wall-clock watch time from the session log (0 when empty / legacy DB).
    let (exact_total, exact_today, exact_7d, exact_30d, exact_sessions, exact_events) =
        crate::api::watch_events::exact_totals(&conn);

    Json(json!({
        "scenesTotal": scenes_total,
        "watched": watched,
        "watching": watching,
        "want": want,
        "skipped": skipped,
        "watchTimeExact": {
            "total": exact_total,
            "today": exact_today,
            "last7d": exact_7d,
            "last30d": exact_30d,
            "sessions": exact_sessions,
            "events": exact_events,
        },
        "completionPct": if scenes_total > 0 { (watched as f64 / scenes_total as f64 * 100.0).round() as i64 } else { 0 },
        "secondsWatched": seconds,
        "avgRating": avg_rating,
        "rated": rated,
        "topStudios": top_studios,
        "topCategories": top_categories,
        "topPerformers": top_performers,
        "weekly": weekly,
        "watchTime": {
            "total": seconds,
            "today": seconds_today,
            "last7d": seconds_7d,
            "last30d": seconds_30d,
            "avgPerDay30": avg_per_day_30,
            "avgPerScene": avg_per_scene,
            "totalDuration": total_duration,
            "remaining": remaining_seconds,
            "sessionsToday": sessions_today,
            "sessions7d": sessions_7d,
            "sessions30d": sessions_30d,
        },
        "daily": daily,
        "topScenes": top_scenes,
        "ratingBuckets": rating_buckets,
    }))
}
