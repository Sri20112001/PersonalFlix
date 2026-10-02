use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

pub type Db = Arc<Mutex<Connection>>;

pub const SCHEMA: &str = r#"
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
   description TEXT NOT NULL DEFAULT ''
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

CREATE INDEX IF NOT EXISTS idx_scenes_studio ON scenes(studio_id);
CREATE INDEX IF NOT EXISTS idx_scenes_title ON scenes(title);
CREATE INDEX IF NOT EXISTS idx_comments_scene ON comments(scene_id);
CREATE INDEX IF NOT EXISTS idx_timestamps_scene ON timestamps(scene_id);
CREATE INDEX IF NOT EXISTS idx_watch_events_scene ON watch_events(scene_id);
CREATE INDEX IF NOT EXISTS idx_watch_events_created ON watch_events(created_at);
CREATE INDEX IF NOT EXISTS idx_tracking_scene ON tracking(scene_id);
CREATE INDEX IF NOT EXISTS idx_favorites_type ON favorites(type);
CREATE INDEX IF NOT EXISTS idx_playlists_updated ON playlists(updated_at);
"#;

pub fn open(db_path: &Path) -> rusqlite::Result<Db> {
    if let Some(dir) = db_path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let conn = Connection::open(db_path)?;
    conn.execute_batch(SCHEMA)?;
    migrate(&conn)?;
    Ok(Arc::new(Mutex::new(conn)))
}

/// In-place upgrades for databases created before a schema change.
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
        if !has_col(table, col) {
            conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {col} {decl};"))?;
        }
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
    Ok(())
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