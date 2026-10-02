# PersonalFlix — ChatGPT Context (paste this into ChatGPT)

> How to use: paste Section 1 into ChatGPT as your first message. Then for each task, paste the relevant file(s) + your question. List of which files to attach is in Section 8.

---

## 1. COPY-PASTE SYSTEM PROMPT (start your ChatGPT chat with this)

```
You are helping me develop PersonalFlix, a local-first Tauri v2 desktop app (Rust + React) that is a cinematic library for my local video collection.

Key facts:
- Backend: Rust, Tauri 2.11.5, axum 0.8.9, tokio full, rusqlite 0.32.1 (bundled SQLite, WAL mode), serde/serde_json, dirs 6, chrono, tracing.
- Frontend: React 18, react-router-dom 6 HashRouter, Vite 5, Tailwind 3.4, @tauri-apps/api v2.
- Embedded axum server on http://127.0.0.1:31731 serves BOTH REST API (/api/*) and compiled SPA (frontend/dist). No Node/Mongo at runtime, fully offline.
- DB: %LOCALAPPDATA%\PersonalFlix\app.db (SQLite). Settings: %LOCALAPPDATA%\PersonalFlix\settings.json with { library_path, server_port (default 31731) }.
- Library root (default library_path) contains scenes_db.json, performers_db.json, categories_db.json, studios_db.json, performers/*.jpg, <Studio>/*.mp4, and netflix-app/backend (LEGACY Node+Express+Mongo reference — NEVER modify, only read for API parity).
- Frontend uses HashRouter ON PURPOSE (because /performers is both a client route and a static file mount). Deep links look like #/scene/123.
- GET /api/scenes/{id} returns WRAPPED { scene, studio, performers, categories, timestamps, comments, tracking } — not a bare scene.
- axum 0.8 routes use /{param} NOT /:param. All captures at same path level must share the SAME name (e.g. /{id}). Never .merge() two routers that both define / — use .nest("/scenes", scenes::routes()).
- Never hold rusqlite MutexGuard across another DB-locking helper call (deadlock). Tracking playhead ONLY persists via PUT /api/tracking/{id}/progress, not via PUT /api/tracking/{id} with {currentTime}.
- Code style: Rust edition 2021, React in .jsx, dark-mode only, Anton (headings uppercase) + Inter (body), colors bg #0A0A0B surface #141415 accent amber #F5B301 danger #E50914, radius 0.25rem, no vertical page scroll (viewport-fitted, inner regions scroll).

When you answer:
1. Give full file paths like src-tauri/src/api/scenes.rs or frontend/src/pages/Scene.jsx
2. Show complete code edits, not just snippets, and keep axum 0.8 syntax correct.
3. If unsure, ask which file to paste rather than guessing the schema.
4. Never suggest modifying netflix-app/ or switching to BrowserRouter.
```

---

## 2. What PersonalFlix is

Self-hosted Netflix-style library for local `.mp4/.webm/.mkv` files. Replaces legacy `netflix-app/` (Node+Express+MongoDB) with Tauri + axum + SQLite. Single-instance desktop window (1440x900, `visible:false` until server ready), file associations for video files, NSIS installer `PersonalFlix_1.0.0_x64-setup.exe`.

## 3. Project layout

```
PersonalFlix/
├── package.json              # wrapper: npm run tauri build / npm run tauri dev
├── frontend/
│   ├── vite.config.ts        # dev proxy /api,/thumbnails,/performers -> 127.0.0.1:31731
│   ├── tailwind.config.js    # design tokens
│   └── src/
│       ├── main.tsx, App.jsx # HashRouter + global keys + open-file listener + /health
│       ├── lib/api.ts        # API client + formatTime, chapterColor, thumbUrl
│       ├── components/       # TopBar, VideoCard, Rail, CommandPalette, ScenePlayer, InfoOverlay, Spinner
│       └── pages/            # Home, Library, Scene, Performers, Performer, Studios, Studio, Categories, Category, Favorites, Playlists, Playlist, Settings, Health
└── src-tauri/
    ├── Cargo.toml            # crate personalflix, lib personalflix_lib
    ├── tauri.conf.json       # window, fileAssociations (.mp4/.webm/.mkv), frontendDist=../frontend/dist
    └── src/
        ├── main.rs           # calls personalflix_lib::run()
        ├── lib.rs            # Tauri builder, single-instance PendingOpen, show-after-server-ready
        ├── server.rs         # axum router + static dirs + SPA fallback via asset resolver
        ├── settings.rs       # settings.json load/save, library_path detection (walk up to scenes_db.json)
        ├── db.rs             # schema + migrate() (idempotent ALTER + meta kv table)
        ├── seed.rs           # seeds 4 JSONs into SQLite only when scenes table empty
        ├── scanner.rs        # walks library (skips netflix-app/, dot-dirs), link_by_prefix, mark_missing
        ├── state.rs          # AppState { db, library_path, thumbnails_path, performers_path, app_handle }
        └── api/              # mod.rs nests each module under prefix
            ├── scenes.rs, performers.rs, categories.rs, studios.rs
            ├── comments.rs, timestamps.rs, tracking.rs, favorites.rs
            ├── playlists.rs, search.rs, video.rs (range 206 streaming), library.rs (stats/scan)
```

Do NOT modify: `../Porn/netflix-app/`, `../Porn/*.mp4`, seed JSONs (read-only reference).

## 4. Data model (SQLite tables + JSON shapes)

Tables: `scenes, performers, categories, studios, comments, timestamps (adds end_seconds + category vs legacy), tracking, favorites, playlists, meta (key,value e.g. last_scan)`. Scenes adds `file_exists, size_bytes, mtime` from scanner.

- scene: `_id, file_name, original_name, resolution (480/480m/720/720m — no p suffix), studio, title, performers[], date, network, source_url, file_path (like Porn/Studio/File.mp4 — resolve by stripping Porn/ prefix), performer_ids[], studio_id, category_ids[]` (~730 after scan)
- performer: `_id, name, slug, source_url, model_id, image_url (performers/xxx.jpg), views, country, gender, scene_ids[], category_ids[]` (119)
- category: `_id, name` (166) / studio: `_id, name` (27)
- timestamp/chapter: `{ id, scene_id, seconds, end_seconds?, label, category: intro|main|orgasm|solo|anal|oral|ending|extra }`
- tracking: `{ scene_id, status: want|watching|watched|skip, currentTime, rating, notes }`

## 5. API reference (base http://127.0.0.1:31731)

| Method & path | Notes |
|---|---|
| GET /api/health | `{ok:true}` |
| GET/POST /api/scenes | filters: `studio, performer, category, search, file (matches file_name OR original_name), status, page, limit` |
| GET /api/scenes/random | random scene |
| GET /api/scenes/missing?type=performers\|thumbnail | gaps |
| GET /api/scenes/{id} | WRAPPED detail (see §1) |
| PATCH/DELETE /api/scenes/{id} | update/delete |
| GET/POST /api/performers | `?search=&gender=` |
| GET/PATCH/DELETE /api/performers/{id} | |
| GET /api/categories, GET /api/studios | lists |
| POST /api/comments, GET /api/comments/{sceneId}, DELETE /api/comments/{sceneId} | body `{sceneId,text}` |
| POST /api/timestamps, GET/PATCH/DELETE /api/timestamps/{id} | PATCH partial via COALESCE |
| GET /api/tracking, GET /api/tracking/continue-watching | list embeds `scene` |
| PUT /api/tracking/{sceneId} | `{status,notes,rating}` — NOT playhead |
| PUT /api/tracking/{sceneId}/progress | `{currentTime}` — ONLY way to save playhead |
| DELETE /api/tracking/{sceneId} | clear |
| GET/POST /api/favorites, GET /api/favorites/{type}, DELETE /api/favorites/{type}/{targetId} | type=performer\|studio (scene-level NOT first-class yet) |
| GET/POST /api/playlists, GET/PUT/DELETE /api/playlists/{id}, POST /api/playlists/{id}/scenes, DELETE /api/playlists/{id}/scenes/{sceneId} | GET {id} embeds `scenes` |
| GET /api/search?q=&page=&limit= | supports `studio: performer: category: tag: resolution: status:` tokens AND-combined |
| GET /api/video/{id} | Range streaming (206) |
| GET /api/pending-open | drains single-instance file payload `{file:path\|null}` |
| GET /api/library/stats | `{filesOnDisk,filesMissing,scenes,bytes,lastScan}` |
| POST /api/library/scan | `{files,new,updated,missing,bytes,duration_ms}` |
| POST /api/library/fetch | `{url,res?}` → `{job_id}`: scrape page, download into studio folder, register scene (single-flight) |
| GET /api/library/fetch/{job} | `{job_id,state,bytes,total,scene_id,title,message}` |
| POST /api/library/fetch-backfill | `{dry_run}`: dry-run plans model-page verification, apply links verified names |

Static: `/thumbnails/<sceneId>.jpg` -> `<library>/netflix-app/backend/public/thumbnails`, `/performers/<basename>` -> `<library>/performers`, else SPA fallback `index.html`.

Media URLs frontend uses: video `/api/video/{id}`, thumb `/thumbnails/{id}.jpg`, performer `/performers/<basename of image_url>`.

## 6. Frontend behavior ChatGPT must preserve

- Routes: `/ #/`, `/library`, `/scene/:id`, `/performers`, `/performer/:id`, `/studios`, `/studio/:id`, `/categories`, `/category/:id`, `/favorites`, `/playlists`, `/playlist/:id`, `/settings`, `/health`.
- Global keys (non-scene): `Ctrl+K` palette, `H/L/F/P` nav, `Esc` close. Scene page player owns keys: `Space, ←/→ ±10s, F fullscreen, M mute, I info overlay, N/P next/prev`. Resume overlay: `R` resume / `S` restart.
- ScenePlayer: chapter timeline (colored segments from timestamps, click-to-seek), scrubber, transport (back30/play/fwd30/volume/fullscreen), progress PUT every ~4s to `/progress` endpoint. Resume: if `tracking.currentTime` in (5s, duration-5s) show Resume/Start-Over overlay.
- InfoOverlay (`I`): chapters list with seek-on-click, hover edit/delete, `+ Add chapter` (label, start [placeholder=current time], end?, category). Uses add/update/deleteTimestamp.
- CommandPalette (`Ctrl+K`): Commands section + search results; scene-context commands need `sceneId/isScene` props.
- Open-file: Tauri `open-file` event + boot poll `GET /api/pending-open`, then `GET /api/scenes?file=<basename>` -> `#/scene/{id}`.
- Chapter colors: intro #0EA5E9, main #E50914, orgasm #8B5CF6, solo #14B8A6, anal #F59E0B, oral #22C55E, ending #6366F1, extra #F43F5E.

## 7. Gotchas (tell ChatGPT when it makes these mistakes)

1. axum 0.8: `/{id}` not `/:id`. Same-position params must share name. Combine GET+PATCH+DELETE on one `.route("/{id}", get().patch().delete())`.
2. Don't `.merge()` routers both defining `/` — use `.nest()`.
3. `cargo build` fails after folder move/rename → `cargo clean` + rebuild.
4. Must launch via Tauri for single-instance/window; bare Rust binary only for HTTP smoke tests.
5. DB migrate in `db.rs::migrate()` only; scanner columns via pragma-guarded ALTER.
6. Scanner: skips `netflix-app/`, matches `<id>_<res>.mp4` by id-prefix (min 5 digits, only if scene file missing) + exact basename.
7. `state.try_state::<PendingOpen>()` for pre-manage handlers.
8. Build: `npm run tauri build` (needs frontend/dist). Dev: `npm run tauri dev` (Vite :5173 proxies to :31731). Quick Rust check: `cd src-tauri; cargo check`.

## 8. What to attach to ChatGPT per task type

- New API endpoint / Rust bug: attach `src-tauri/src/api/mod.rs`, the relevant `api/<resource>.rs`, `server.rs`, `state.rs`, `db.rs` (+ error log).
- Player / chapter / UI bug: attach `frontend/src/pages/Scene.jsx`, `frontend/src/components/ScenePlayer.jsx`, `InfoOverlay.jsx`, `frontend/src/lib/api.ts`.
- Search / tracking / playlist logic: attach relevant `api/search.rs|tracking.rs|playlists.rs` + calling page + `lib/api.ts`.
- Scanner / missing files: attach `src-tauri/src/scanner.rs`, `api/library.rs`, `frontend/src/pages/Health.jsx`.
- Always include: exact error text or screenshot + what you clicked/typed + `Invoke-RestMethod http://127.0.0.1:31731/api/health` result.

Example follow-up prompts:
- "Here is src-tauri/src/api/timestamps.rs + InfoOverlay.jsx: add `category` dropdown to edit form, keep PATCH partial."
- "Here is scanner.rs + Health.jsx: add per-studio breakdown table + 'open file location' button using tauri opener."
- "Here is playlists.rs + Scene.jsx: add 'Add to playlist' dropdown on scene page calling POST /api/playlists/{id}/scenes."

## 9. Current state & next features

Done: embedded server+SQLite seed, full API parity, React UI, chapter timeline, file deep-link, hidden-window-until-ready, NSIS installer, amber identity, resume playback, PendingOpen fix, scanner+Health page, search tokens, Command Center, editable chapters.

Gaps (good ChatGPT tasks): scene-level favorite toggle, "add to playlist" on scene page, Health upgrades (size-drift, open location, scan progress, per-studio), watched-history calendar, analytics, playlist drag-reorder, import/export playlists+chapters.
