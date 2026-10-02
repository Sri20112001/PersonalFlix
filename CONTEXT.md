# PersonalFlix — Project Context

Use this document to understand the PersonalFlix desktop app so you can continue
development, fix bugs, or add features without re-discovering the architecture.

---

## 1. What this is

**PersonalFlix** is a self-hosted, cinematic video library desktop app for the user's
local porn collection. It is the modern replacement for the legacy
`netflix-app/` (Node.js + Express + MongoDB) which remains untouched in the media
library root and serves as the **API parity reference**.

The new app replaces that stack with:

- **Tauri v2** (Rust) desktop shell — single instance, file associations, NSIS installer
- **Embedded axum (HTTP) server** on `127.0.0.1:31731` that serves BOTH the REST API
  and the compiled React frontend (SPA)
- **SQLite** database (replaces MongoDB) seeded from the existing JSON files
- **React + Vite + Tailwind** frontend, designed with the Stitch design system

Everything runs **locally, offline**. No Node/MongoDB needed at runtime.

---

## 2. Project layout

Project root (the app lives here, renamed from `desktop/`):

```
S:\Project\Python\venv\Lib\site-packages\New folder\PersonalFlix\
├── package.json            # root wrapper: scripts run `tauri` CLI
├── frontend/               # React + Vite + Tailwind UI
│   ├── index.html          # loads Anton + Inter from Google Fonts
│   ├── vite.config.ts      # dev proxy /api,/thumbnails,/performers → 127.0.0.1:31731
│   ├── tailwind.config.js  # design tokens (colors, fonts)
│   └── src/
│       ├── main.tsx
│       ├── App.jsx         # HashRouter + global keys + tauri open-file + /health route
│       ├── styles.css
│       ├── lib/api.ts      # API client + helpers (formatTime, chapterColor, thumbUrl...)
│       ├── components/     # TopBar, VideoCard, Rail, CommandPalette,
│       │                   # ScenePlayer, InfoOverlay, Spinner
│       └── pages/          # Home, Library, Scene, Performers, Performer, Studios,
│                           # Studio, Categories, Category, Favorites, Playlists,
│                           # Playlist, Settings, Health
└── src-tauri/              # Rust app shell + embedded server
    ├── Cargo.toml          # crate `personalflix`, lib target `personalflix_lib`
    ├── tauri.conf.json     # window, fileAssociations, frontendDist, beforeBuild
    ├── capabilities/default.json
    ├── icons/
    └── src/
        ├── main.rs         # calls personalflix_lib::run()
        ├── lib.rs          # Builder: plugins, setup, hidden-window-until-server-ready,
        │                   #   PendingOpen state, single-instance file callback
        ├── server.rs       # axum router, static dirs, SPA fallback (asset resolver)
        ├── settings.rs     # settings.json load/save, library path detection
        ├── db.rs           # SQLite schema (WAL), indexes, migrate()
        ├── seed.rs         # seeds the 4 JSON files into SQLite on first run
        ├── scanner.rs      # library scanner/indexer (stats, scan_library, link_by_prefix)
        ├── state.rs        # AppState { db, library_path, thumbnails_path, performers_path, app_handle }
        └── api/            # one module per resource
            ├── mod.rs      # router() nests every module under its own prefix
            ├── scenes.rs / performers.rs / categories.rs / studios.rs
            ├── comments.rs / timestamps.rs / tracking.rs / favorites.rs
            ├── playlists.rs / search.rs / video.rs / library.rs
```

Related (do **NOT** modify — reference only):

```
S:\Project\Python\venv\Lib\site-packages\New folder\Porn\   ← media library root (default library_path)
├── scenes_db.json / performers_db.json / categories_db.json / studios_db.json   ← seed data
├── performers\                      ← performer headshot images (performers/xxx.jpg)
├── <Studio>\*.mp4                   ← the actual video files
└── netflix-app\backend\             ← legacy Node/Mongo backend (API parity reference)
    └── public\thumbnails\           ← served at /thumbnails/<sceneId>.jpg
```

---

## 3. Tech stack & environment

- Rust / Cargo **1.96.0**, Node **v22**, npm **11**, WebView2 (Windows)
- Tauri **2.11.5**, tauri-plugin-single-instance, tauri-plugin-opener
- axum **0.8.9**, tokio (full), tower-http (fs/cors/trace), tokio-util (io)
- rusqlite **0.32.1** (bundled SQLite), serde/serde_json, dirs 6, chrono, tracing,
  percent-encoding 2
- Frontend: React 18, react-router-dom 6, Vite 5, Tailwind 3.4, `@tauri-apps/api` v2
- Builds with `npm run tauri build` → NSIS installer:
  `src-tauri\target\release\bundle\nsis\PersonalFlix_1.0.0_x64-setup.exe`

---

## 4. Design system (from Stitch)

```
background   #0A0A0B   surface  #141415   surfaceHover  #1F1F21
accent       #F5B301   (amber — brand accent; hover #FFC52F)
danger/play  #E50914   (red — playback buttons, destructive)
textPrimary  #FFFFFF   textSecondary #A1A1AA   textMuted #52525B
```

- Display font: **Anton** (uppercase headings). Body: **Inter**.
- Border radius: **0.25rem**. Dark mode only.
- No sidebar, **no vertical page scroll** (viewport-fitted layout; inner regions scroll).
- Keyboard shortcuts are surfaced as `kbd` hints bottom-right.
- Stitch project `16518349574805291230`, design-system asset
  `8220371590392664002` (global duplicate `15932873113898679689` — ignore).
- Chapter segment colors by category:
  intro `#0EA5E9`, main `#E50914`, orgasm `#8B5CF6`, solo `#14B8A6`,
  anal `#F59E0B`, oral `#22C55E`, ending `#6366F1`, extra `#F43F5E`.

---

## 5. Runtime & data model

- Server binds `127.0.0.1:31731` (override: `server_port` in settings.json).
- DB: `%LOCALAPPDATA%\PersonalFlix\app.db` (WAL). Settings:
  `%LOCALAPPDATA%\PersonalFlix\settings.json` (e.g.
  `C:\Users\<you>\AppData\Local\PersonalFlix\`).
- `library_path` auto-detected by walking up from the exe looking for
  `scenes_db.json` (works in dev; default = the `Porn` folder). Saved on first run.
- Seeding runs only when the `scenes` table is empty.
- Tables: `scenes`, `performers`, `categories`, `studios`, `comments`,
  `timestamps` (adds `end_seconds` + `category` columns beyond the legacy model),
  `tracking`, `favorites`, `playlists`. Scanner adds `file_exists`, `size_bytes`,
  `mtime` to `scenes` and a `meta` (`key`, `value`) table for `last_scan`.
- Scene `file_path` looks like `Porn/Studio/File.mp4`; it is resolved by stripping
  the `Porn/` prefix and joining to `library_path`. Scanner indexes files by
  basename and by id-prefix (see §9.9).

### JSON shapes (seed, field names preserved in API responses)

- **scene**: `_id`, `file_name`, `original_name`, `resolution`, `studio`, `title`,
  `performers[]`, `date`, `network`, `source_url`, `file_path`, `performer_ids[]`,
  `studio_id`, `category_ids[]` (186 scenes)
- **category / studio**: `_id`, `name` (166 / 27)
- **performer**: `_id`, `name`, `slug`, `source_url`, `model_id`,
  `image_url` (`performers/xxx.jpg`), `views`, `country`, `gender`,
  `scene_ids[]`, `category_ids[]` (119 performers)

---

## 6. API surface (all under `http://127.0.0.1:31731`)

> **axum 0.8 gotchas** (see §9): capture groups use `{param}`, NOT `:param`;
> at the same path position all captures must use the **same** name.

| Method & path | Purpose |
|---|---|
| GET `/api/health` | `{"ok":true}` |
| GET/POST `/api/scenes` | list (filters: `studio`, `performer`, `category`, `search`, `file` [matches file_name OR original_name], `status`, `page`, `limit`) / create |
| GET `/api/scenes/random` | random scene |
| GET `/api/scenes/missing` | scenes missing performers/thumbnail (`?type=performers\|thumbnail`) |
| GET `/api/scenes/{id}` | **wrapped detail**: `{scene, studio, performers, categories, timestamps, comments, tracking}` |
| PATCH/DELETE `/api/scenes/{id}` | update / delete |
| GET/POST `/api/performers` | list (`search`, `gender`) / create |
| GET/PATCH/DELETE `/api/performers/{id}` | read / update / delete |
| GET `/api/categories` · GET `/api/studios` | lists (studios carry `style`, `signature_categories`, `scene_count`) |
| GET/PATCH `/api/studios/{id}` | studio detail / update (`name`, `style`, `signature_categories` — validated; signature edits re-propagate to that studio's scenes, additive union) |
| GET `/api/studios/{id}/detail` | Studio page payload: details, performer roster w/ scene counts, favorited scenes, top categories, totals |
| POST `/api/comments` · GET `/api/comments/{sceneId}` · DELETE `/api/comments/{sceneId}` | comments |
| POST `/api/timestamps` · GET/PATCH/DELETE `/api/timestamps/{id}` | chapters/timestamps (`seconds`, `label`, optional `end_seconds`, `category`); PATCH is partial (COALESCE) |
| GET `/api/timestamps/{chapterId}/thumbnail` | chapter thumbnail JPEG (frame from chapter midpoint, or start+2s; ffmpeg-rendered, cached in `chapter_thumbs/`, swept on edit/delete) |
| GET `/api/tracking` · GET `/api/tracking/continue-watching` | tracking list (embeds `scene`) / continue watching |
| PUT `/api/tracking/{sceneId}` · DELETE `/api/tracking/{sceneId}` | set status/notes/rating · clear |
| PUT `/api/tracking/{sceneId}/progress` | save `currentTime` (played position) |
| GET/POST `/api/favorites` · GET `/api/favorites/{type}` · DELETE `/api/favorites/{type}/{targetId}` | favorites (type: `performer`\|`studio`) |
| GET/POST `/api/playlists` · GET/PUT/DELETE `/api/playlists/{id}` · POST `/api/playlists/{id}/scenes` · DELETE `/api/playlists/{id}/scenes/{sceneId}` | playlists (GET {id} embeds `scenes`) |
| GET `/api/search?q&page&limit` | global search; free text **and** `studio:` `performer:` `category:` `tag:` `resolution:` `status:` field tokens (AND-combined via intersection) |
| GET `/api/video/{id}` | video streaming with HTTP range (206 Partial Content) |
| GET `/api/pending-open` | drains single-instance `open-file` payload → `{"file": path \| null}` (boot-time race fix) |
| GET `/api/library/stats` | `{filesOnDisk, filesMissing, scenes, bytes, lastScan}` |
| POST `/api/library/scan` | scan library root: indexes by name/path, `link_by_prefix` re-links by id-prefix, marks missing → `{files, new, updated, missing, bytes, duration_ms}` |
| POST `/api/library/fetch` | fetch-from-URL `{url, res?}`: scrape video page, download into studio folder, register scene → `{job_id}` (single-flight) |
| GET `/api/library/fetch/{job}` | fetch job status `{job_id, state, bytes, total, scene_id, title, message}` |
| POST `/api/library/fetch-backfill` | performer backfill `{dry_run}`: verify display names against model pages; dry-run reports plan, apply links verified names only |

Static mounts:

- `/thumbnails/<sceneId>.jpg` → `<library>/netflix-app/backend/public/thumbnails`
- `/performers/<basename>` → `<library>/performers`
- everything else → SPA fallback (embedded `frontend/dist` via Tauri asset resolver,
  serving `index.html` for client-side routes)

---

## 7. Frontend behavior

- **HashRouter** is used on purpose: `/performers` is both a client route and a static
  mount, so hash routing avoids the collision. Deep links look like `#/scene/123`.
- Routes: `/` (Home), `/library`, `/scene/:id`, `/performers`, `/performer/:id`,
  `/studios`, `/studio/:id`, `/categories`, `/category/:id`, `/favorites`,
  `/playlists`, `/playlist/:id`, `/settings`, `/health` (Library Health & Scan).
- Global keys (non-scene pages): `Ctrl+K` palette, `H` home, `L` library, `F`
  favorites, `P` playlists, `Esc` close. On `/scene/:id` the player owns the keys:
  `Space` play/pause, `←/→` seek ±10s, `F` fullscreen, `M` mute, `I` info overlay,
  `N`/`P` next/prev scene. On the scene page the resume overlay adds `R` resume,
  `S` start over.
- **ScenePlayer**: renders the video, an auto-hiding top bar, a **chapter timeline**
  (colored segments built from timestamps; click a segment to seek, active segment
  shows its label), a scrubber, and a transport row (back-30s / play / fwd-30s /
  volume / fullscreen). Reports progress every ~4s via
  `PUT /api/tracking/{id}/progress`.
- **Resume playback**: Scene.jsx reads `tracking.currentTime`; if it's between 5s
  and `duration - 5s`, ScenePlayer shows a Resume/Start-Over overlay (`R`/`S`) and,
  on resume, passes `initialTime` so the video seeks to the saved position.
- **Editable chapters (InfoOverlay, `I` on scene)**: list chapters with seek-on-click;
  each row has hover **edit/delete**; `+ Add chapter` creates a chapter (label, start,
  optional end, category; start input placeholder shows current playback time).
  Wired to `addTimestamp` / `updateTimestamp` (PATCH) / `deleteTimestamp`.
- **Command Center (`Ctrl+K`)**: `CommandPalette` shows a filtered **Commands**
  section above search results — navigation (Home/Library/Performers/Studios/
  Categories/Favorites/Playlists/Settings/Health), "Play a random scene", and
  scene-context commands (mark Watching/Watched/Want/Skip, toggle favorite) when
  `sceneId`/`isScene` props are provided.
- **Open a video file** (file association): `tauri-plugin-single-instance` stores
  `argv[1]` in `PendingOpen` state on the first instance and emits `open-file`; the
  frontend listens for the event **and** polls `GET /api/pending-open` at boot, so
  a file opened before the SPA mounts still resolves. Both paths call
  `GET /api/scenes?file=<basename>` then navigate to `#/scene/{id}`.
- Media URLs: video `/api/video/{id}`, thumbnail `/thumbnails/{id}.jpg`,
  performer image `/performers/<basename of image_url>`.

---

## 8. Window lifecycle & the "splash" fix

- Window config: 1440×900, `visible: false`, URL `http://127.0.0.1:31731`.
- `lib.rs` setup: spawns the axum server, then a second task polls
  `tokio::net::TcpStream::connect("127.0.0.1:{port}")` until it succeeds (max 10s),
  then calls `w.show()` + `w.navigate(url)` so the UI loads only after the server is
  up — no blank/error flash at launch.
- File association registers `.mp4/.webm/.mkv` → PersonalFlix.

---

## 9. Things to know / gotchas (learned the hard way)

1. **axum 0.8 route syntax** is `/{param}`. Panic: `Path segments must not start with ':'`.
2. **Same-position captures must share one name** (e.g. `/{sceneId}`). Registering
   `/{sceneId}` and `/{id}` at the same level panics at startup. When one resource
   needs GET+PATCH+DELETE on the same param, combine:
   `.route("/{id}", get(list_by_scene).patch(update).delete(remove))`.
3. **Don't `.merge()` routers that both define `/`** — merge the same-path GETs
   panics (`Overlapping method route`). Nest each module under a prefix:
   `.nest("/scenes", scenes::routes())`.
4. If the folder is **moved/renamed**, `cargo build` may fail with stale absolute
   paths baked into `target/`. Fix with `cargo clean` then rebuild.
5. The app must be launched through the tauri builder (single-instance + window
   lifecycle); the Rust binary alone works for HTTP smoke tests.
6. `netflix-app/` is the API parity reference and must stay untouched.
7. `GET /api/scenes/{id}` returns a **wrapped** object — the frontend reads
   `res.scene`, `res.studio`, `res.performers`, `res.timestamps`, `res.comments`,
   `res.tracking`.
8. **DB migration lives in `db.rs::migrate()`** (idempotent `ALTER TABLE ... ADD
   COLUMN` guarded by pragma checks + a `meta` key/value table). Scenes got
   `file_exists`, `size_bytes`, `mtime` from the scanner; `meta` stores e.g.
   `last_scan`.
9. **Scanner** (`scanner.rs`) walks the library root (skips `netflix-app/`, dot-dirs).
   Seed `file_path` values point at old file names, so it matches actual files
   (`<id>_<res>.mp4`) by id-prefix via `link_by_prefix` (min 5 digits, only into a
   scene whose file is missing on disk) and by exact basename; `mark_missing` flags
   `file_exists = 0`. A clean reseed + scan gave: 730 scenes, 694 files, 36 missing,
   183.4 GB.
10. **`try_state` for optional state**: handlers that may run before `manage()` use
    `state.try_state::<...>()` and return a graceful empty response rather than
    panicking (`PendingOpen`).
11. **Rusqlite deadlocks**: never call another DB-locking helper while already
    holding the `MutexGuard` on `state.db`. `api/library.rs::stats` queries the
    `meta` table directly (instead of re-entering the lock).
12. **Tracking progress**: `PUT /api/tracking/{id}` with only `{"currentTime": ...}`
    does NOT persist playhead — use `PUT /api/tracking/{id}/progress`. The command
    center's status commands use `api.setTracking(sceneId, {status})`.
13. **Search field tokens**: `resolution:` matches stored values like `480/480m/720/
    720m` (no `p` suffix); `status:` matches want/watching/watched/skip.

---

## 10. Build & verify

```powershell
# one-shot build (frontend + release Rust + NSIS installer)
npm run tauri build

# faster: incremental Rust check/build
cd src-tauri
cargo check          # typecheck (fast)
cargo build --release

# dev mode (vite on :5173 proxies to :31731; run the server via `npm run tauri dev`)
npm run tauri dev
```

Smoke test (server must answer from a running app instance):

```powershell
Invoke-RestMethod http://127.0.0.1:31731/api/health
Invoke-RestMethod http://127.0.0.1:31731/api/scenes?limit=2
curl.exe -s -o NUL -w "%{http_code}" -H "Range: bytes=0-1023" http://127.0.0.1:31731/api/video/1405580
```

---

## 11. Current status & likely next steps

Done and verified: embedded server + SQLite seed, full API parity, React UI per
design system, chapter timeline in the player, file-association deep link, hidden
window until server ready, NSIS installer, **amber accent identity**, **resume
playback**, **robust file-open** (PendingOpen + `/api/pending-open`), **library
scanner/indexer + Library Health page**, **search field filters**, **Command
Center**, **editable chapters** (add/edit/delete in InfoOverlay).

Known gaps / good next features:

- **Scene-level favorite** is still not a first-class toggle (favorites currently
  target performers/studios only); the Command Center's "Toggle favorite" uses
  those endpoints and may no-op on scenes.
- **Playlist "add to playlist"** from the scene page is not wired to a UI (the
  Playlist page has its own search+add).
- **Library Health page** could add: file-size drift detection, "open file
  location", re-scan progress feedback, and a per-studio breakdown.
- **Batch 3 ideas**: watched-history calendar, scene analytics, hardware-accelerated
  thumbnails for placeholder scenes, playlist drag-reorder, import/export of
  playlists & chapter data.
