import React from "react";
import { Link } from "react-router-dom";
import { thumbUrl } from "../../utilities/media";
import { formatTime, formatDate } from "../../utilities/formatters";
import { ROUTES } from "../../constants/routes";

export default function SceneHeader({
  scene,
  id,
  studio,
  categories = [],
  tracking,
  status,
  statusMenuOpen,
  setStatusMenuOpen,
  onStatusSelect,
  statusOpts = [],
  currentStatusObj = {},
  durationSec = 0,
  currentSec = 0,
  hasProgress = false,
  progressPercent = 0,
  favorite,
  onToggleFavorite,
  playlists = [],
  playlistMenuOpen,
  setPlaylistMenuOpen,
  inPlaylist,
  onTogglePlaylist,
  newPlaylistName,
  setNewPlaylistName,
  onCreatePlaylist,
  plBusy = false,
  onOpenEdit,
  copiedPath = false,
  onCopyPath,
  revealSuccess = false,
  onRevealInExplorer,
  onBack,
  onPlay,
}) {
  return (
    <>
      {/* Top Floating Action Bar */}
      <div className="sticky top-0 z-30 px-6 sm:px-12 py-3 bg-[#070708]/85 backdrop-blur-2xl border-b border-white/[0.08] flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest hidden sm:inline">
            Scene #{scene._id}
          </span>
          <button
            onClick={onPlay}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-accent text-zinc-950 font-black text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md shadow-accent/20 cursor-pointer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>Play Video</span>
          </button>
        </div>
      </div>

      {/* Cinematic Hero Backdrop Showcase */}
      <div className="relative w-full min-h-[460px] flex items-end px-6 sm:px-12 pb-10 pt-16 overflow-hidden">
        {/* Ambient Blurred Backdrop */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img
            src={thumbUrl(scene._id)}
            alt=""
            className="w-full h-full object-cover scale-110 blur-3xl opacity-25 brightness-50"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070708] via-[#070708]/85 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070708] via-[#070708]/40 to-transparent" />
        </div>

        {/* Hero Content Island */}
        <div className="relative z-10 w-full flex flex-col md:flex-row items-start md:items-end gap-8 max-w-7xl mx-auto">
          {/* Main Poster Aspect Frame */}
          <div className="relative w-72 sm:w-84 aspect-[16/10] flex-shrink-0 rounded-2xl overflow-hidden border border-white/20 shadow-2xl shadow-black/90 bg-zinc-950 group">
            <img
              src={thumbUrl(scene._id)}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            />
            {scene.resolution && (
              <span className="absolute top-3 left-3 bg-zinc-950/85 backdrop-blur-md text-[10px] font-mono font-black uppercase text-accent border border-accent/40 px-2.5 py-1 rounded-lg shadow-lg">
                {scene.resolution}
              </span>
            )}
            {durationSec > 0 && (
              <span className="absolute bottom-3 right-3 bg-zinc-950/85 backdrop-blur-md text-xs font-mono font-semibold text-white border border-white/10 px-2.5 py-1 rounded-lg shadow-lg">
                {formatTime(durationSec)}
              </span>
            )}
            {/* Progress line */}
            {hasProgress && (
              <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/70 overflow-hidden">
                <div
                  className="h-full bg-accent shadow-[0_0_10px_var(--color-accent)] transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>

          {/* Details & Actions Panel */}
          <div className="flex-1 min-w-0 flex flex-col gap-3.5">
            {/* Studio Pill & Date */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {studio && (
                <Link
                  to={ROUTES.studio(studio._id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/80 border border-white/10 text-xs font-bold text-zinc-200 hover:text-accent hover:border-accent/40 transition-colors shadow-sm"
                >
                  <span className="text-zinc-500 font-normal">Studio:</span>
                  <span>{studio.name}</span>
                </Link>
              )}

              {scene.date && (
                <span className="text-xs font-mono text-zinc-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                  {formatDate(scene.date)}
                </span>
              )}

              {/* Status Segment Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/80 border border-white/10 text-xs font-bold text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  <span>{currentStatusObj.icon}</span>
                  <span>{currentStatusObj.label}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {statusMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setStatusMenuOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-48 rounded-2xl bg-zinc-950/95 border border-white/15 shadow-2xl p-1.5 z-50 backdrop-blur-xl">
                      {statusOpts.map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => onStatusSelect(opt.key)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors cursor-pointer ${
                            status === opt.key
                              ? "bg-accent text-zinc-950 font-bold shadow-sm"
                              : "text-zinc-300 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <span>{opt.icon}</span>
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Main Title */}
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              {scene.title || scene.file_name}
            </h1>

            {/* Original filename subtitle */}
            {scene.original_name && scene.original_name !== scene.title && (
              <p className="text-xs sm:text-sm font-mono text-zinc-400 truncate max-w-2xl" title={scene.original_name}>
                {scene.original_name}
              </p>
            )}

            {/* Categories / Tags Chips */}
            {categories.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {categories.map((c) => (
                  <span
                    key={c._id}
                    className="px-2.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-medium text-zinc-300 font-mono"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            )}

            {/* Raw site tags */}
            {(scene.tags || []).length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {(scene.tags || []).map((t) => (
                  <span
                    key={t}
                    title="source site tag"
                    className="px-2.5 py-0.5 rounded-lg bg-accent/10 border border-accent/25 text-[11px] font-medium text-accent font-mono"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Primary Action Button Bar */}
            <div className="flex items-center gap-2.5 flex-wrap pt-2">
              <button
                onClick={onPlay}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent text-zinc-950 font-black text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-accent/20 cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>{hasProgress ? `Resume (${formatTime(currentSec)})` : "Play Now"}</span>
              </button>

              {/* Favorite Button */}
              <button
                onClick={onToggleFavorite}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-sm ${
                  favorite
                    ? "bg-accent/15 border-accent/40 text-accent font-black"
                    : "bg-zinc-900/80 border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill={favorite ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <span>{favorite ? "Favorited" : "Favorite"}</span>
              </button>

              {/* Playlist Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setPlaylistMenuOpen(!playlistMenuOpen)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Playlist</span>
                </button>
                {playlistMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPlaylistMenuOpen(false)} />
                    <div className="absolute bottom-full mb-2 left-0 w-64 rounded-2xl bg-zinc-950/95 border border-white/15 shadow-2xl p-3 z-50 flex flex-col gap-2.5 backdrop-blur-xl">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold">
                        Add to Playlist
                      </span>
                      <div className="max-h-48 overflow-y-auto flex flex-col gap-1 pr-1 custom-scrollbar">
                        {playlists.map((pl) => {
                          const active = inPlaylist(pl);
                          return (
                            <button
                              key={pl._id}
                              onClick={() => onTogglePlaylist(pl)}
                              className={`flex items-center justify-between p-2 rounded-xl text-xs font-medium text-left transition-colors cursor-pointer ${
                                active
                                  ? "bg-accent/15 text-accent font-bold"
                                  : "text-zinc-300 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              <span className="truncate">{pl.name}</span>
                              <span className="font-bold">{active ? "✓" : "+"}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1.5 pt-2 border-t border-white/10">
                        <input
                          type="text"
                          placeholder="New playlist..."
                          value={newPlaylistName}
                          onChange={(e) => setNewPlaylistName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && onCreatePlaylist()}
                          className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-accent/80 font-mono"
                        />
                        <button
                          onClick={onCreatePlaylist}
                          disabled={!newPlaylistName.trim() || plBusy}
                          className="bg-accent text-zinc-950 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-30 cursor-pointer active:scale-95"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Edit Metadata */}
              <button
                onClick={onOpenEdit}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span>Edit</span>
              </button>

              {/* Reveal & Copy Path */}
              {scene.file_path && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={onRevealInExplorer}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                    title="Reveal in File Explorer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>{revealSuccess ? "Opened!" : "Folder"}</span>
                  </button>
                  <button
                    onClick={onCopyPath}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                    title="Copy Full File Path"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>{copiedPath ? "Copied!" : "Path"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
