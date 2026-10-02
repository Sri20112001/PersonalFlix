import React from "react";

export default function BulkActionBar({
  selectMode,
  selectedIds = new Set(),
  scenesCount = 0,
  bulkBusy = false,
  onSelectAll,
  onClearSelection,
  onBulkStatus,
  onBulkAddToPlaylist,
  onBulkCaptions,
  playlistsList = [],
  showPlaylistPicker = false,
  setShowPlaylistPicker,
  onCloseSelectMode,
  bulkToast = null,
}) {
  if (!selectMode && !bulkToast) return null;

  return (
    <>
      {/* Floating Batch Action Dock (Select Mode) */}
      {selectMode && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-zinc-900/95 border border-accent/40 shadow-2xl backdrop-blur-xl animate-fade-in text-xs font-semibold text-white">
          <div className="flex items-center gap-2 pr-3 border-r border-white/10">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-mono text-sm font-bold text-accent">
              {selectedIds.size}
            </span>
            <span className="text-zinc-400">selected</span>
          </div>

          <button
            onClick={onSelectAll}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 transition-colors text-zinc-300 hover:text-white cursor-pointer"
          >
            Select All ({scenesCount})
          </button>
          <button
            onClick={onClearSelection}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 transition-colors text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            Clear
          </button>

          <div className="h-4 w-px bg-white/10 mx-1" />

          {/* Batch Status Actions */}
          <div className="flex items-center gap-1.5">
            <button
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={() => onBulkStatus("watched")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              title="Mark all selected as Watched"
            >
              <span>✓ Watched</span>
            </button>
            <button
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={() => onBulkStatus("want-to-watch")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              title="Mark all selected as Want to Watch"
            >
              <span>🔖 Want to Watch</span>
            </button>
            <button
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={() => onBulkStatus("skip")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-600/40 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              title="Mark all selected as Skipped"
            >
              <span>⊘ Skip</span>
            </button>
            <button
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={() => onBulkStatus("unwatched")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              title="Reset status to Unwatched"
            >
              <span>↺ Reset</span>
            </button>
          </div>

          <div className="h-4 w-px bg-white/10 mx-1" />

          {/* Batch Whisper captions (sequential, one scene at a time) */}
          <button
            disabled={selectedIds.size === 0 || bulkBusy}
            onClick={(e) => onBulkCaptions(e.shiftKey)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            title="Generate captions for all selected (local Whisper, sequential). Shift+click = re-generate existing transcripts."
          >
            <span>🎙 Captions</span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-1" />

          {/* Add to Playlist Dropdown */}
          <div className="relative">
            <button
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={() => setShowPlaylistPicker((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Playlist</span>
            </button>

            {showPlaylistPicker && (
              <div className="absolute bottom-full mb-2 right-0 w-52 max-h-56 overflow-y-auto bg-zinc-900 border border-white/15 rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 z-50">
                <div className="text-[10px] uppercase font-bold text-zinc-500 px-2 py-1 tracking-wider">
                  Add {selectedIds.size} Scenes To
                </div>
                {playlistsList.length === 0 ? (
                  <div className="text-zinc-500 text-xs px-2 py-2">No playlists found</div>
                ) : (
                  playlistsList.map((pl) => (
                    <button
                      key={pl.id || pl._id}
                      onClick={() => onBulkAddToPlaylist(pl.id || pl._id)}
                      className="text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs text-zinc-200 hover:text-white truncate transition-colors cursor-pointer"
                    >
                      📁 {pl.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Close Multi-Select */}
          <button
            onClick={onCloseSelectMode}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors ml-1 cursor-pointer"
            title="Exit Multi-Select"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Bulk Feedback Toast */}
      {bulkToast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 text-xs font-semibold shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
          <span>✓</span>
          <span>{bulkToast}</span>
        </div>
      )}
    </>
  );
}
