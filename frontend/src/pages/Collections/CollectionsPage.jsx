import React from "react";
import VideoCard from "../../components/VideoCard";
import Spinner from "../../components/Spinner";
import { useCollections, PRESETS } from "../../hooks/useCollections";

export default function CollectionsPage() {
  const {
    collections,
    active,
    results,
    total,
    loading,
    running,
    run,
    remove,
    addPreset,
  } = useCollections();

  return (
    <div className="h-full flex bg-background pt-6 pb-6 px-10 overflow-hidden">
      {/* List */}
      <div className="w-72 flex-shrink-0 flex flex-col min-h-0 pr-6 border-r border-white/10">
        <h1 className="font-display uppercase tracking-widest text-2xl mb-1">Collections</h1>
        <p className="text-xs text-textMuted mb-4">Saved queries Â· always live</p>
        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
          {loading ? (
            <Spinner />
          ) : (
            collections.map((c) => (
              <div key={c._id} className="group relative">
                <button
                  onClick={() => run(c)}
                  className={`w-full text-left px-4 py-2.5 rounded transition-colors cursor-pointer ${
                    active?._id === c._id ? "bg-accent/20 text-accent" : "bg-surface hover:bg-surfaceHover text-white"
                  }`}
                >
                  <div className="text-sm font-semibold truncate">{c.name}</div>
                  <div className="text-[11px] font-mono text-textMuted truncate">{c.query || "(everything)"}</div>
                </button>
                <button
                  onClick={() => remove(c)}
                  className="absolute top-2 right-2 text-textMuted hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity text-xs cursor-pointer"
                  title="Delete collection"
                >
                  Ã—
                </button>
              </div>
            ))
          )}
          {!loading && collections.length === 0 && (
            <div className="text-xs text-textMuted">No collections yet â€” save one from Library search.</div>
          )}
          <div className="mt-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-textMuted mb-2">Starters</div>
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => addPreset(p)}
                className="w-full text-left px-4 py-2 rounded text-xs text-textSecondary hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                + {p.name} <span className="font-mono text-textMuted">({p.query})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 min-w-0 flex flex-col pl-6">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-sm text-textMuted">
            Pick a collection to run it.
          </div>
        ) : running ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="text-xs text-textMuted uppercase tracking-widest mb-3 flex-shrink-0">
              {total} result{total === 1 ? "" : "s"} Â· <span className="font-mono">{active.query}</span>
            </div>
            <div className="flex-1 overflow-y-auto pr-2">
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {results.map((s) => (
                  <VideoCard key={s._id} scene={s} width="100%" height={150} />
                ))}
              </div>
              {results.length === 0 && <div className="text-sm text-textMuted">Nothing matches right now.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
