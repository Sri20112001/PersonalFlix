use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

pub type Db = Arc<Mutex<Connection>>;

/// Current schema version. `migrate()` advances legacy databases step by
/// step (v0 → v1 → v2 …); fresh databases are created at this version.
/// History:
///   v1 — baseline: all columns added organically before versioning,
///        `performers.scene_ids` dropped, `watch_events` table.
///   v2 — media reliability columns on `scenes` (`media_status`, `duration`,
///        `video_codec`, `audio_codec`, `width`, `height`).
pub const SCHEMA_VERSION: i64 = 2;

/// Tables only (no indexes). `open()` runs this, then `migrate()`, then
/// INDEXES one by one so a stale index can never block startup.
const TABLES: &str = r#"
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY,
  file_name TEXT,
  original_name TEXT,
  resolution TEXT,
  studio TEXT,
  studio_id TEXT,
  title TEXT,
  performers TEXT NOT NULL DEFAULT '[]',
  performer_ids TEXT NOT NULL DEFAULT '[]',
  date TEXT,
  network TEXT,
  source_url TEXT,
  file_path TEXT,
  category_ids TEXT NOT NULL DEFAULT '[]',
  related_ids TEXT NOT NULL DEFAULT '[]',
   file_exists INTEGER NOT NULL DEFAULT 1,
   size_bytes INTEGER NOT NULL DEFAULT 0,
   mtime REAL NOT NULL DEFAULT 0,
   tags TEXT NOT NULL DEFAULT '[]',
   description TEXT NOT NULL DEFAULT '',
   -- v2 media reliability (probed with ffprobe/ffmpeg, see api/media.rs).
   media_status TEXT NOT NULL DEFAULT 'ok',
   duration REAL,
   video_codec TEXT,
   audio_codec TEXT,
   width INTEGER,
   height INTEGER
 );

-- NOTE (Phase 2B): performers.scene_ids was removed. Performer→scene
-- links resolve exclusively by reverse-querying scenes.performer_ids
-- (see MAPPING_INVARIANTS.md). Do NOT re-add a reverse cache here.
CREATE TABLE IF NOT EXISTS performers (
  id TEXT PRIMARY KEY,
  name TEXT,
  slug TEXT,
  source_url TEXT,
  model_id INTEGER,
  image_url TEXT,
  views TEXT,
  country TEXT,
  gender TEXT NOT NULL DEFAULT 'female',
  attributes TEXT NOT NULL DEFAULT '{}',
  category_ids TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT
);

CREATE TABLE IF NOT EXISTS studios (
  id TEXT PRIMARY KEY,
  name TEXT,
  style TEXT NOT NULL DEFAULT '',
  signature_categories TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  performer_ids TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS timestamps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL,
  seconds REAL NOT NULL,
  label TEXT NOT NULL,
  note TEXT,
  end_seconds REAL,
  category TEXT,
  created_at TEXT NOT NULL,
  performer_ids TEXT NOT NULL DEFAULT '[]'
);

-- Full session log for exact watch-time (play/pause/seek/ended + heartbeats).
CREATE TABLE IF NOT EXISTS watch_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  current_time REAL NOT NULL DEFAULT 0,
  duration REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tracking (
  scene_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'want-to-watch',
  rating INTEGER,
  notes TEXT,
  currentTime REAL NOT NULL DEFAULT 0,
  duration REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_name TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(type, target_id)
);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  scene_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS smart_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  query TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
"#;

/// Indexes, applied one statement at a time (best-effort) after migrations.
const INDEXES: &[&str] = &[
    "CREATE INDEX IF NOT EXISTS idx_scenes_studio ON scenes(studio_id);",
    "CREATE INDEX IF NOT EXISTS idx_scenes_title ON scenes(title);",
    "CREATE INDEX IF NOT EXISTS idx_comments_scene ON comments(scene_id);",
    "CREATE INDEX IF NOT EXISTS idx_timestamps_scene ON timestamps(scene_id);",
    "CREATE INDEX IF NOT EXISTS idx_watch_events_scene ON watch_events(scene_id);",
    "CREATE INDEX IF NOT EXISTS idx_watch_events_created ON watch_events(created_at);",
    "CREATE INDEX IF NOT EXISTS idx_tracking_scene ON tracking(scene_id);",
    "CREATE INDEX IF NOT EXISTS idx_favorites_type ON favorites(type);",
    "CREATE INDEX IF NOT EXISTS idx_playlists_updated ON playlists(updated_at);",
];

pub fn open(db_path: &Path) -> rusqlite::Result<Db> {
    if let Some(dir) = db_path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let conn = Connection::open(db_path)?;
    // Tables first (legacy DBs may predate some of them), then versioned
    // migrations add missing columns, then indexes (each best-effort so one
    // stale index can never block opening the database).
    conn.execute_batch(TABLES)?;
    migrate(&conn)?;
    for idx in INDEXES {
        let _ = conn.execute_batch(idx);
    }
    Ok(Arc::new(Mutex::new(conn)))
}

/// Versioned in-place upgrades. Each step is idempotent (column guards)
/// so a database at ANY older version — including pre-versioning ones that
/// grew organically — converges to SCHEMA_VERSION. Steps never drop user
/// data, only the deprecated reverse-cache column (Phase 2B).
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let has_col = |table: &str, name: &str| -> bool {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .unwrap();
        let cols: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(1))
            .unwrap()
            .filter_map(Result::ok)
            .collect();
        cols.iter().any(|c| c == name)
    };
    let add_col = |table: &str, col: &str, decl: &str| {
        if !has_col(table, col) {
            let _ = conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {col} {decl};"));
        }
    };

    let mut v: i64 = conn
        .query_row("SELECT value FROM meta WHERE key='schema_version'", [], |r| {
            r.get::<_, String>(0)
        })
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    // v1: baseline — everything the app required before versioning existed.
    if v < 1 {
        for (table, col, decl) in [
            ("scenes", "file_exists", "INTEGER NOT NULL DEFAULT 1"),
            ("scenes", "size_bytes", "INTEGER NOT NULL DEFAULT 0"),
            ("scenes", "mtime", "REAL NOT NULL DEFAULT 0"),
            ("scenes", "tags", "TEXT NOT NULL DEFAULT '[]'"),
            ("scenes", "description", "TEXT NOT NULL DEFAULT ''"),
            ("tracking", "duration", "REAL"),
            ("comments", "performer_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("timestamps", "performer_ids", "TEXT NOT NULL DEFAULT '[]'"),
            ("studios", "style", "TEXT NOT NULL DEFAULT ''"),
            ("studios", "signature_categories", "TEXT NOT NULL DEFAULT '[]'"),
        ] {
            add_col(table, col, decl);
        }
        // Phase 2B: drop the deprecated reverse cache. Forward truth
        // (scenes.performer_ids) is the only relationship source; zero app
        // readers remained (verified Phase 1 + grep). Bundled SQLite supports
        // DROP COLUMN. Runs once — guarded by the column check.
        if has_col("performers", "scene_ids") {
            conn.execute_batch("ALTER TABLE performers DROP COLUMN scene_ids;")?;
        }
        // Watch-events session log (idempotent; also covered by SCHEMA for fresh DBs).
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS watch_events (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               scene_id INTEGER NOT NULL,
               event TEXT NOT NULL,
               current_time REAL NOT NULL DEFAULT 0,
               duration REAL,
               created_at TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_watch_events_scene ON watch_events(scene_id);
             CREATE INDEX IF NOT EXISTS idx_watch_events_created ON watch_events(created_at);",
        )?;
        v = 1;
        set_schema_version(conn, v);
    }

    // v2: media reliability columns (probed lazily; NULL = not probed yet).
    if v < 2 {
        for (table, col, decl) in [
            ("scenes", "media_status", "TEXT NOT NULL DEFAULT 'ok'"),
            ("scenes", "duration", "REAL"),
            ("scenes", "video_codec", "TEXT"),
            ("scenes", "audio_codec", "TEXT"),
            ("scenes", "width", "INTEGER"),
            ("scenes", "height", "INTEGER"),
        ] {
            add_col(table, col, decl);
        }
        v = 2;
        set_schema_version(conn, v);
    }

    Ok(())
}

fn set_schema_version(conn: &Connection, v: i64) {
    let _ = conn.execute(
        "INSERT INTO meta(key, value) VALUES('schema_version', ?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [v.to_string()],
    );
}

/// Current schema version of an opened database (0 = pre-versioning).
pub fn schema_version(db: &Db) -> i64 {
    let conn = db.lock().unwrap();
    conn.query_row("SELECT value FROM meta WHERE key='schema_version'", [], |r| {
        r.get::<_, String>(0)
    })
    .ok()
    .and_then(|s| s.parse().ok())
    .unwrap_or(0)
}

pub fn scene_count(db: &Db) -> i64 {
    let conn = db.lock().unwrap();
    conn.query_row("SELECT COUNT(*) FROM scenes", [], |r| r.get(0))
        .unwrap_or(0)
}

pub fn meta_set(db: &Db, key: &str, value: &str) {
    let conn = db.lock().unwrap();
    let _ = conn.execute(
        "INSERT INTO meta(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [key, value],
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn has_col(conn: &Connection, table: &str, col: &str) -> bool {
        conn.prepare(&format!("PRAGMA table_info({table})"))
            .map(|mut s| {
                s.query_map([], |r| r.get::<_, String>(1))
                    .map(|rows| rows.flatten().any(|c| c == col))
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    /// A pre-versioning database (old columns only, deprecated scene_ids
    /// cache present, no version row) converges to SCHEMA_VERSION on open.
    #[test]
    fn legacy_v0_upgrades_to_current() {
        let dir = std::env::temp_dir().join(format!(
            "pfx-mig-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("app.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE scenes(id INTEGER PRIMARY KEY, title TEXT);
                 CREATE TABLE performers(id TEXT PRIMARY KEY, name TEXT, scene_ids TEXT);
                 CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);",
            )
            .unwrap();
            conn.execute(
                "INSERT INTO performers(id,name,scene_ids) VALUES('a','A','[1]')",
                [],
            )
            .unwrap();
        }
        let db = open(&path).unwrap();
        assert_eq!(schema_version(&db), SCHEMA_VERSION);
        // Re-open is idempotent.
        drop(db);
        let db = open(&path).unwrap();
        assert_eq!(schema_version(&db), SCHEMA_VERSION);
        let conn = db.lock().unwrap();
        for col in ["file_exists", "size_bytes", "mtime", "tags", "description",
                    "media_status", "duration", "video_codec", "audio_codec", "width", "height"] {
            assert!(has_col(&conn, "scenes", col), "missing scenes.{col}");
        }
        assert!(!has_col(&conn, "performers", "scene_ids"));
        assert!(has_col(&conn, "watch_events", "event"));
        // User data survived the upgrade.
        let name: String = conn
            .query_row("SELECT name FROM performers WHERE id='a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "A");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn fresh_db_is_current() {
        let dir = std::env::temp_dir().join(format!(
            "pfx-mig-fresh-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir.join("app.db")).unwrap();
        assert_eq!(schema_version(&db), SCHEMA_VERSION);
        std::fs::remove_dir_all(&dir).ok();
    }
}