import { req } from "./client";

export const api = {
  health: () => req("/api/health"),
  pendingOpen: () => req("/api/pending-open"),

  // settings
  settings: () => req("/api/settings"),
  updateSettings: (body) =>
    req("/api/settings", { method: "PUT", body: JSON.stringify(body) }),

  // library
  libraryStats: () => req("/api/library/stats"),
  libraryAudit: () => req("/api/library/mapping-audit"),
  libraryReconcile: (dryRun = true) =>
    req("/api/library/reconcile", { method: "POST", body: JSON.stringify({ dry_run: dryRun }) }),
  reviewQueue: (bucket = "needs_performers", page = 1, limit = 50) =>
    req(`/api/library/review-queue?bucket=${bucket}&page=${page}&limit=${limit}`),
  libraryScan: () => req("/api/library/scan", { method: "POST" }),
  libraryReveal: (body = {}) =>
    req("/api/library/reveal", { method: "POST", body: JSON.stringify(body) }),
  libraryPrune: (ids) =>
    req("/api/library/prune", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) }),
  libraryFetch: (url, res = "480m") =>
    req("/api/library/fetch", { method: "POST", body: JSON.stringify({ url, res }) }),
  libraryFetchStatus: (job) => req(`/api/library/fetch/${job}`),
  libraryBackfillPreview: (existing = false, filenames = false) =>
    req("/api/library/fetch-backfill", { method: "POST", body: JSON.stringify({ dry_run: true, existing, filenames }) }),
  libraryBackfillApply: (existing = false, filenames = false) =>
    req("/api/library/fetch-backfill", { method: "POST", body: JSON.stringify({ dry_run: false, existing, filenames }) }),

  // scenes
  scenes: (params = {}) =>
    req(`/api/scenes?${new URLSearchParams(params).toString()}`),
  scene: (id) => req(`/api/scenes/${id}`),
  similarScenes: (id, limit = 6) =>
    req(`/api/scenes/${id}/similar?limit=${limit}`),
  randomScene: () => req("/api/scenes/random"),
  missing: (type = "performers") =>
    req(`/api/scenes/missing?type=${type}`),
  createScene: (body) =>
    req("/api/scenes", { method: "POST", body: JSON.stringify(body) }),
  updateScene: (id, body) =>
    req(`/api/scenes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteScene: (id) => req(`/api/scenes/${id}`, { method: "DELETE" }),

  // performers
  performers: (params = {}) =>
    req(`/api/performers?${new URLSearchParams(params).toString()}`),
  performer: (id) => req(`/api/performers/${id}`),
  updatePerformer: (id, body) =>
    req(`/api/performers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // studios / categories / graph
  studios: () => req("/api/studios"),
  studio: (id) => req(`/api/studios/${encodeURIComponent(id)}`),
  studioDetail: (id) => req(`/api/studios/${encodeURIComponent(id)}/detail`),
  updateStudio: (id, body) =>
    req(`/api/studios/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  categories: () => req("/api/categories"),
  graph: () => req("/api/graph"),

  // comments
  comments: (sceneId) => req(`/api/comments/${sceneId}`),
  addComment: (scene_id, text, performer_ids = []) =>
    req("/api/comments", { method: "POST", body: JSON.stringify({ scene_id, text, performer_ids }) }),
  updateComment: (id, body) =>
    req(`/api/comments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteComment: (id) => req(`/api/comments/${id}`, { method: "DELETE" }),

  // timestamps (chapters)
  timestamps: (sceneId) => req(`/api/timestamps/${sceneId}`),
  addTimestamp: (body) =>
    req("/api/timestamps", { method: "POST", body: JSON.stringify(body) }),
  updateTimestamp: (id, body) =>
    req(`/api/timestamps/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTimestamp: (id) => req(`/api/timestamps/${id}`, { method: "DELETE" }),

  // tracking
  tracking: (params = {}) =>
    req(`/api/tracking?${new URLSearchParams(params).toString()}`),
  continueWatching: () => req("/api/tracking/continue-watching"),
  watchHistory: () => req("/api/tracking/history"),
  setTracking: (sceneId, body) =>
    req(`/api/tracking/${sceneId}`, { method: "PUT", body: JSON.stringify(body) }),
  saveProgress: (sceneId, currentTime, duration) =>
    req(`/api/tracking/${sceneId}/progress`, {
      method: "PUT",
      body: JSON.stringify({ currentTime, duration }),
    }),

  // favorites
  favorites: (type) => req(`/api/favorites${type ? `?type=${type}` : ""}`),
  addFavorite: (type, target_id, target_name) =>
    req("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ type, target_id, target_name }),
    }),
  removeFavorite: (type, target_id) =>
    req(`/api/favorites?type=${type}&target_id=${target_id}`, { method: "DELETE" }),

  // playlists
  playlists: () => req("/api/playlists"),
  playlist: (id) => req(`/api/playlists/${id}`),
  createPlaylist: (name, description = "") =>
    req("/api/playlists", { method: "POST", body: JSON.stringify({ name, description }) }),
  addToPlaylist: (id, sceneId) =>
    req(`/api/playlists/${id}/scenes`, { method: "POST", body: JSON.stringify({ scene_id: sceneId }) }),
  reorderPlaylist: (id, scene_ids) =>
    req(`/api/playlists/${id}/reorder`, {
      method: "PUT",
      body: JSON.stringify({ scene_ids }),
    }),
  removeFromPlaylist: (id, sceneId) =>
    req(`/api/playlists/${id}/scenes/${sceneId}`, { method: "DELETE" }),
  deletePlaylist: (id) => req(`/api/playlists/${id}`, { method: "DELETE" }),

  // backup / export / import
  backupExport: () => req("/api/backup/export"),
  backupImport: (doc) =>
    req("/api/backup/import", { method: "POST", body: JSON.stringify(doc) }),
  backupList: () => req("/api/backup/list"),
  backupRun: () => req("/api/backup/run", { method: "POST" }),

  // smart collections (saved queries)
  collections: () => req("/api/collections"),
  createCollection: (name, query) =>
    req("/api/collections", { method: "POST", body: JSON.stringify({ name, query }) }),
  deleteCollection: (id) => req(`/api/collections/${id}`, { method: "DELETE" }),

  // analytics
  analytics: () => req("/api/analytics/overview"),

  // face-aware smart thumbnails (uniface sidecar)
  facesStatus: () => req("/api/faces/status"),
  smartThumb: (sceneId, force = false) =>
    req("/api/faces/thumb-smart", {
      method: "POST",
      body: JSON.stringify({ scene_id: sceneId, force }),
    }),

  // watch session log (exact watch time)
  logWatchEvent: (scene_id, event, currentTime, duration) =>
    req("/api/watch-events", {
      method: "POST",
      body: JSON.stringify({ scene_id, event, currentTime, duration }),
    }),
  watchStats: () => req("/api/watch-events/stats"),
  watchEvents: (sceneId) => req(`/api/watch-events?scene_id=${sceneId}`),

  // search
  search: (q, page = 1, limit = 30, favOnly = false) =>
    req(`/api/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}${favOnly ? "&fav=1" : ""}`),

  // whisper transcription (local whisper.cpp → sidecar .en.vtt)
  transcribeEngine: () => req("/api/transcribe/status"),
  relocateEngine: (path) =>
    req("/api/transcribe/relocate", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  transcribeJob: (sceneId) => req(`/api/transcribe/${sceneId}`),
  transcribeScene: (sceneId, force = false) =>
    req(`/api/transcribe/${sceneId}`, {
      method: "POST",
      body: JSON.stringify({ force }),
    }),
  transcribeBatch: (ids, force = false) =>
    req(`/api/transcribe/batch`, {
      method: "POST",
      body: JSON.stringify({ ids, force }),
    }),
  transcribeBatchStatus: () => req(`/api/transcribe/batch`),
  cancelTranscribeBatch: () => req(`/api/transcribe/batch`, { method: "DELETE" }),

  // editable transcript (click-to-seek + cue text edits saved to disk)
  subtitleCues: (sceneId) => req(`/api/subtitles/${sceneId}/cues`),
  updateSubtitleCue: (sceneId, index, text) =>
    req(`/api/subtitles/${sceneId}/cues/${index}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }),
};

export { req };
export default api;
