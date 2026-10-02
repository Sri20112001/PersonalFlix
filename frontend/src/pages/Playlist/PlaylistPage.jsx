import React from "react";
import VideoCard from "../../components/VideoCard";
import Spinner from "../../components/Spinner";
import { SyncIcon, DragHandleIcon, CloseIcon } from "../../utilities/icons";
import { usePlaylist } from "../../hooks/usePlaylist";

export default function PlaylistPage() {
  const {
    playlist,
    loading,
    q,
    setQ,
    searchRes,
    scenes,
    dragIdx,
    setDragIdx,
    dropIdx,
    setDropIdx,
    dragFrom,
    syncing,
    syncMsg,
    isSmart,
    cleanDescription,
    remove,
    add,
    del,
    onDropOn,
    handleSyncSmart,
    playAll,
    shuffle,
  } = usePlaylist();

  if (loading || !playlist) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background pt-6 pb-12 px-10">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display uppercase tracking-widest text-3xl">{playlist.name}</h1>
            {isSmart && (
              <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <span>Smart Auto-Collection</span>
              </span>
            )}
          </div>
          {cleanDescription && <p className="text-sm text-textSecondary mt-1">{cleanDescription}</p>}
          <p className="text-[11px] text-textMuted uppercase tracking-widest mt-1">
            {scenes.length} scene{scenes.length === 1 ? "" : "s"} · drag cards to reorder
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {isSmart && (
            <button
              onClick={handleSyncSmart}
              disabled={syncing}
              className="flex items-center gap-1.5 bg-purple-900/60 hover:bg-purple-800 border border-purple-500/40 text-purple-200 px-4 py-2.5 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
              title="Re-run dynamic rule against library to discover new scenes"
            >
              <SyncIcon
                size={13}
                className={syncing ? "animate-spin" : ""}
              />
              <span>{syncing ? "Syncing..." : "Auto-Sync Rules"}</span>
            </button>
          )}
          {scenes.length > 0 && (
            <>
              <button
                onClick={playAll}
                className="bg-[#E50914] hover:bg-[#ff0a16] text-white px-5 py-2.5 rounded text-xs font-bold uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
              >
                ▶ Play all
              </button>
              <button
                onClick={shuffle}
                className="bg-surface hover:bg-surfaceHover text-white px-5 py-2.5 rounded text-xs font-bold uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
              >
                Shuffle
              </button>
            </>
          )}
          <button
            onClick={del}
            className="text-xs text-textMuted hover:text-rose-400 uppercase tracking-widest px-2 cursor-pointer transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="mb-4 px-4 py-2 rounded-xl bg-purple-950/60 border border-purple-500/30 text-purple-200 text-xs font-mono flex items-center gap-2 animate-fade-in flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
          <span>{syncMsg}</span>
        </div>
      )}

      <div className="relative mb-5 flex-shrink-0">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search to add a scene..."
          className="w-full bg-surface border border-white/10 rounded px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-textMuted"
        />
        {searchRes.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surfaceHover border border-white/10 rounded-lg overflow-hidden shadow-2xl z-20">
            {searchRes.map((s) => (
              <button
                key={s._id}
                onClick={() => add(s._id)}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/10 text-left transition-colors cursor-pointer"
              >
                <span className="text-sm text-white truncate flex-1">{s.title || s.file_name}</span>
                <span className="text-xs text-textSecondary">add</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        {scenes.length === 0 ? (
          <div className="text-textMuted text-sm">Empty playlist. Add scenes above.</div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {scenes.map((s, i) => (
              <div
                key={s._id}
                className="relative group"
                draggable
                onDragStart={(e) => {
                  dragFrom.current = i;
                  setDragIdx(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dropIdx !== i) setDropIdx(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onDropOn(i);
                }}
                onDragEnd={() => {
                  dragFrom.current = null;
                  setDragIdx(null);
                  setDropIdx(null);
                }}
                style={{ opacity: dragIdx === i ? 0.4 : 1 }}
              >
                <div
                  className={`rounded transition-all ${dropIdx === i && dragIdx !== i ? "ring-2 ring-accent" : ""}`}
                >
                  <VideoCard scene={s} width="100%" height={150} />
                </div>
                <span className="absolute bottom-2 left-2 text-[10px] font-mono bg-black/70 text-white/80 px-1.5 py-0.5 rounded">
                  {i + 1}
                </span>
                <span
                  className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/70 text-white/80 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-all"
                  title="Drag to reorder"
                >
                  <DragHandleIcon size={12} />
                </span>
                <button
                  onClick={() => remove(s._id)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white/80 hover:text-white hover:bg-accent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="Remove from playlist"
                >
                  <CloseIcon size={12} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
