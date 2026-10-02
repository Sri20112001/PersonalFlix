use crate::db::Db;
use serde_json::Value;
use std::path::Path;

pub fn seed_if_empty(db: &Db, library_path: &Path) {
    if crate::db::scene_count(db) > 0 {
        // Scenes exist: no full seed, but studios/categories may still gain
        // rows from an updated library (merge is idempotent, INSERT OR IGNORE).
        merge_studios(db, library_path);
        return;
    }
    let mut conn = db.lock().unwrap();
    let tx = conn.transaction().unwrap();

    seed_json_file(&tx, &library_path.join("categories_db.json"), "categories");
    seed_json_file(&tx, &library_path.join("studios_db.json"), "studios");
    seed_json_file(&tx, &library_path.join("performers_db.json"), "performers");
    seed_json_file(&tx, &library_path.join("scenes_db.json"), "scenes");

    tx.commit().unwrap();
}

/// Permanent studio merge: new studios added to studios_db.json reach the
/// live DB without a wipe. INSERT OR IGNORE = idempotent and name-preserving
/// (existing rows are never overwritten). Returns rows present afterwards.
pub fn merge_studios(db: &Db, library_path: &Path) -> usize {
    let raw = match std::fs::read_to_string(library_path.join("studios_db.json")) {
        Ok(s) => s,
        Err(_) => return 0,
    };
    let arr: Vec<Value> = match serde_json::from_str(&raw) {
        Ok(a) => a,
        Err(_) => return 0,
    };
    let conn = db.lock().unwrap();
    let mut added = 0usize;
    for item in &arr {
        let id = item["_id"].as_str().or_else(|| item["id"].as_str()).unwrap_or("");
        let name = item["name"].as_str().unwrap_or("");
        if id.is_empty() || name.is_empty() {
            continue;
        }
        if let Ok(n) = conn.execute(
            "INSERT OR IGNORE INTO studios (id, name) VALUES (?1, ?2)",
            rusqlite::params![id, name],
        ) {
            added += n as usize;
        }
    }
    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM studios", [], |r| r.get(0))
        .unwrap_or(0);
    eprintln!("[seed] studios merge: +{} (total {})", added, total);
    total as usize
}

fn seed_json_file(tx: &rusqlite::Transaction, path: &Path, kind: &str) {
    let raw = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(_) => return,
    };
    let arr: Vec<Value> = match serde_json::from_str(&raw) {
        Ok(a) => a,
        Err(_) => return,
    };
    let mut inserted = 0usize;
    for item in arr {
        let ok = match kind {
            "categories" => insert_category(tx, &item),
            "studios" => insert_studio(tx, &item),
            "performers" => insert_performer(tx, &item),
            "scenes" => insert_scene(tx, &item),
            _ => false,
        };
        if ok {
            inserted += 1;
        }
    }
    eprintln!("[seed] {}: {} rows", kind, inserted);
}

fn s(v: &Value) -> Option<String> {
    v.as_str().map(|s| s.to_string())
}

fn i(v: &Value) -> Option<i64> {
    v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

fn arr_json(v: &Value) -> String {
    match v {
        Value::Array(_) => v.to_string(),
        _ => "[]".to_string(),
    }
}

fn insert_category(tx: &rusqlite::Transaction, v: &Value) -> bool {
    let Some(id) = s(&v["_id"]).or_else(|| s(&v["id"])) else {
        return false;
    };
    let name = s(&v["name"]).unwrap_or_else(|| id.clone());
    tx.execute(
        "INSERT OR IGNORE INTO categories (id, name) VALUES (?1, ?2)",
        rusqlite::params![id, name],
    )
    .is_ok()
}

fn insert_studio(tx: &rusqlite::Transaction, v: &Value) -> bool {
    let Some(id) = s(&v["_id"]).or_else(|| s(&v["id"])) else {
        return false;
    };
    let name = s(&v["name"]).unwrap_or_else(|| id.clone());
    tx.execute(
        "INSERT OR IGNORE INTO studios (id, name) VALUES (?1, ?2)",
        rusqlite::params![id, name],
    )
    .is_ok()
}

fn insert_performer(tx: &rusqlite::Transaction, v: &Value) -> bool {
    let Some(id) = s(&v["_id"]).or_else(|| s(&v["slug"])).or_else(|| s(&v["name"])) else {
        return false;
    };
    let name = s(&v["name"]).unwrap_or_else(|| id.clone());
    let slug = s(&v["slug"]).unwrap_or_else(|| id.clone());
    let model_id = i(&v["model_id"]);
    let attributes = match &v["attributes"] {
        Value::Object(_) => v["attributes"].to_string(),
        _ => "{}".to_string(),
    };
    // Phase 2B: scene_ids no longer seeded — forward truth only.
    let res = tx.execute(
        "INSERT OR IGNORE INTO performers
         (id, name, slug, source_url, model_id, image_url, views, country, gender, attributes, category_ids)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        rusqlite::params![
            id,
            name,
            slug,
            s(&v["source_url"]),
            model_id,
            s(&v["image_url"]),
            s(&v["views"]),
            s(&v["country"]),
            s(&v["gender"]).unwrap_or_else(|| "female".into()),
            attributes,
            arr_json(&v["category_ids"])
        ],
    );
    res.is_ok()
}

fn insert_scene(tx: &rusqlite::Transaction, v: &Value) -> bool {
    let Some(id) = i(&v["_id"]).or_else(|| i(&v["id"])) else {
        return false;
    };
    let res = tx.execute(
        "INSERT OR IGNORE INTO scenes
         (id, file_name, original_name, resolution, studio, studio_id, title, performers, performer_ids, date, network, source_url, file_path, category_ids, related_ids)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        rusqlite::params![
            id,
            s(&v["file_name"]),
            s(&v["original_name"]),
            s(&v["resolution"]),
            s(&v["studio"]),
            s(&v["studio_id"]),
            s(&v["title"]),
            arr_json(&v["performers"]),
            arr_json(&v["performer_ids"]),
            s(&v["date"]),
            s(&v["network"]),
            s(&v["source_url"]),
            s(&v["file_path"]),
            arr_json(&v["category_ids"]),
            arr_json(&v["related_ids"])
        ],
    );
    res.is_ok()
}

/// Test/helper database: a temp-file DB opened through the real `db::open`
/// path (tables + versioned migrations + indexes), so tests exercise the
/// same schema production uses.
#[allow(dead_code)]
pub fn open_memory() -> Db {
    let dir = std::env::temp_dir().join(format!(
        "pfx-mem-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    crate::db::open(&dir.join("app.db")).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_studios_is_idempotent_and_preserves_names() {
        let db = open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute("INSERT INTO studios(id,name) VALUES('s1','Old Name')", []).unwrap();
        }
        let dir = std::env::temp_dir().join(format!(
            "pfx-seed-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("studios_db.json"),
            r#"[{"_id":"s1","name":"New Name"},{"_id":"s2","name":"Second"}]"#,
        )
        .unwrap();
        assert_eq!(merge_studios(&db, &dir), 2);
        // Re-run: nothing new, existing name untouched.
        assert_eq!(merge_studios(&db, &dir), 2);
        let conn = db.lock().unwrap();
        let name: String = conn
            .query_row("SELECT name FROM studios WHERE id='s1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "Old Name");
        std::fs::remove_dir_all(&dir).ok();
    }
}