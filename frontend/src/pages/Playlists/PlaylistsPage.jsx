import React from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "../../components/Spinner";
import { StarIcon, PlayIcon, TrashIcon } from "../../utilities/icons";
import { usePlaylists, SMART_PRESETS } from "../../hooks/usePlaylists";
import { ROUTES } from "../../constants/routes";

export default function PlaylistsPage() {
  const navigate = useNavigate();
  const {
    list,
    loading,
    name,
    setName,
    desc,
    setDesc,
    busyPreset,
    statusMsg,
    create,
    createSmartPlaylist,
    handleDeletePlaylist,
  } = usePlaylists();

  return (
    <div className="h-full flex flex-col bg-background pt-6 pb-12 px-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="font-display uppercase tracking-widest text-2xl flex items-center gap-3">
            <span>Playlists & Collections</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent/20 border border-accent/30 text-accent font-sans font-bold normal-case tracking-normal">
              Dynamic Smart Engine
            </span>
          </h1>
          <p className="text-xs text-textSecondary mt-1">
            Create custom curated playlists or generate dynamic smart collections that auto-track rules
          </p>
        </div>
        <span className="text-xs text-textMuted uppercase tracking-widest font-mono">
          {list.length} playlists
        </span>
      </div>

      {/* Smart Playlist Presets Bar */}
      <div className="mb-6 p-4 rounded-2xl bg-zinc-900/60 border border-white/10 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
            <StarIcon size={14} fill="currentColor" />
            Instant Smart Playlist Presets
          </span>
          {statusMsg && (
            <span className="text-xs text-accent font-semibold animate-pulse font-mono">
              {statusMsg}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5">
          {SMART_PRESETS.map((preset) => (
            <button
              key={preset.id}
              disabled={busyPreset !== null}
              onClick={() => createSmartPlaylist(preset)}
              className={`group flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                busyPreset === preset.id
                  ? "bg-accent/20 border-accent text-accent animate-pulse"
                  : "bg-surface/80 hover:bg-surface border-white/10 hover:border-accent/50 text-zinc-200 hover:text-white hover:scale-[1.02] shadow-sm"
              }`}
              title={preset.desc}
            >
              <span>{preset.title}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-zinc-400 group-hover:text-accent border border-white/5">
                {preset.badge}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Standard Playlist Creation */}
      <div className="flex gap-3 mb-6 flex-shrink-0">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New custom playlist name..."
          className="flex-1 bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-accent placeholder:text-textMuted"
        />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Description (optional)"
          className="flex-1 bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-accent placeholder:text-textMuted"
        />
        <button
          onClick={create}
          className="bg-accent hover:bg-[#FFC52F] text-zinc-950 px-6 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg cursor-pointer"
        >
          Create
        </button>
      </div>

      {/* Playlists Grid */}
      <div className="flex-1 overflow-y-auto pr-2">
        {loading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-sm gap-2">
            <span>No playlists yet.</span>
            <span className="text-xs text-zinc-600">Pick a smart preset above or create a custom playlist!</span>
          </div>
        ) : (
          <div
            className="grid gap-4 pb-8"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}
          >
            {list.map((pl) => {
              const isSmart = pl.description?.startsWith("[Smart:");
              const sceneCount = (pl.scene_ids || pl.scenes || []).length;
              const displayDesc = isSmart
                ? pl.description.replace(/^\[Smart:[^\]]+\]\s*/, "")
                : pl.description;

              return (
                <div
                  key={pl._id}
                  onClick={() => navigate(ROUTES.playlist(pl._id))}
                  className={`group relative p-5 rounded-2xl text-left transition-all duration-200 hover:scale-[1.02] cursor-pointer border backdrop-blur-sm ${
                    isSmart
                      ? "bg-gradient-to-br from-purple-950/20 via-zinc-900/60 to-zinc-900/80 border-purple-500/30 hover:border-purple-500/60 shadow-lg shadow-purple-950/20"
                      : "bg-surface hover:bg-surfaceHover border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-display uppercase tracking-wide text-white group-hover:text-accent transition-colors font-bold text-base truncate">
                      {pl.name}
                    </div>
                    {isSmart && (
                      <span className="flex-shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase">
                        ✨ Smart
                      </span>
                    )}
                  </div>

                  {displayDesc && (
                    <div className="text-xs text-textSecondary line-clamp-2 mb-4 leading-relaxed">
                      {displayDesc}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-textMuted font-mono">
                    <span className="flex items-center gap-1.5">
                      <PlayIcon size={12} fill="currentColor" />
                      {sceneCount} scene{sceneCount === 1 ? "" : "s"}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => handleDeletePlaylist(e, pl._id)}
                      className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-1 rounded transition-opacity cursor-pointer"
                      title="Delete playlist"
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
