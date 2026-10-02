import React from "react";
import { Link } from "react-router-dom";
import { thumbUrl } from "../../utilities/media";
import { fmtBytes } from "./healthUtils";
import { ROUTES } from "../../constants/routes";

export default function DuplicatesTab({
  dupClusters = [],
  dupLoading = false,
  dupScanned = false,
  dupMsg = null,
  onRunScan,
  onDeleteDuplicate,
  onReveal,
  revealing = null,
}) {
  return (
    <div className="space-y-6">
      {/* Duplicate Scanner Header Bar */}
      <div className="flex items-center justify-between p-5 rounded-2xl bg-zinc-950/70 border border-white/10 backdrop-blur-xl gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <span>Storage Optimization & Clones Scanner</span>
            {dupLoading && <span className="w-2 h-2 rounded-full bg-accent animate-ping" />}
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Scans library using duration fingerprints, byte size hashes & title tokens to detect redundant copies and reclaim storage space.
          </p>
        </div>

        <button
          type="button"
          onClick={onRunScan}
          disabled={dupLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:brightness-110 text-zinc-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-accent/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex-shrink-0"
        >
          {dupLoading ? (
            <>
              <span className="w-3 h-3 rounded-full border-2 border-zinc-950 border-t-transparent animate-spin" />
              <span>Scanning Library...</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>{dupScanned ? "Re-Scan Library" : "Scan For Duplicates"}</span>
            </>
          )}
        </button>
      </div>

      {dupMsg && (
        <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/30 text-accent text-xs font-mono flex items-center gap-2 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span>{dupMsg}</span>
        </div>
      )}

      {dupScanned && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-zinc-950/70 border border-white/10">
            <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 font-mono mb-1">
              Duplicate Clusters
            </div>
            <div className="text-2xl font-mono font-black text-white">
              {dupClusters.length}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-950/70 border border-white/10">
            <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 font-mono mb-1">
              Redundant Clones
            </div>
            <div className="text-2xl font-mono font-black text-amber-400">
              {dupClusters.reduce((sum, c) => sum + (c.items.length - 1), 0)}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-950/70 border border-white/10">
            <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 font-mono mb-1">
              Reclaimable Storage
            </div>
            <div className="text-2xl font-mono font-black text-emerald-400">
              {fmtBytes(dupClusters.reduce((sum, c) => sum + c.potentialSavingsBytes, 0))}
            </div>
          </div>
        </div>
      )}

      {dupScanned && dupClusters.length === 0 && !dupLoading && (
        <div className="p-12 text-center rounded-2xl bg-zinc-950/40 border border-white/5 backdrop-blur-xl">
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="text-base font-bold text-white mb-1">No Duplicate Videos Found!</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Every video scene in your library has unique duration, file size, and naming characteristics.
          </p>
        </div>
      )}

      {/* Duplicate Clusters List */}
      {dupClusters.map((cluster, cIdx) => (
        <div
          key={cluster.id}
          className="rounded-2xl bg-zinc-950/70 border border-white/10 p-5 backdrop-blur-xl shadow-xl space-y-4"
        >
          <div className="flex items-center justify-between gap-4 flex-wrap pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-mono text-xs font-bold flex items-center justify-center border border-amber-500/30 flex-shrink-0">
                {cIdx + 1}
              </span>
              <span className="text-sm font-bold text-white truncate max-w-lg">
                {cluster.title}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                {cluster.items.length} copies
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-zinc-500">Savings:</span>
              <span className="text-emerald-400 font-bold bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                ~{fmtBytes(cluster.potentialSavingsBytes)}
              </span>
            </div>
          </div>

          {/* Video Items in Cluster */}
          <div className="space-y-2.5">
            {cluster.items.map((item, itemIdx) => {
              const isBest = itemIdx === 0;
              return (
                <div
                  key={item._id}
                  className={`flex items-center justify-between gap-4 p-3 rounded-xl border transition-all ${
                    isBest
                      ? "bg-emerald-950/15 border-emerald-500/30"
                      : "bg-zinc-900/40 border-white/5 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="relative w-24 aspect-video rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10">
                      <img
                        src={thumbUrl(item._id)}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Link
                          to={ROUTES.scene(item._id)}
                          replace={true}
                          className="text-xs font-semibold text-zinc-200 hover:text-accent truncate max-w-md block"
                        >
                          {item.title || item.file_name}
                        </Link>
                        {isBest ? (
                          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            ★ Recommended to Keep
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            ⚠️ Redundant ({item.matchReason || "Duplicate"})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
                        {item.resolution && (
                          <span className="text-zinc-300 uppercase font-bold">{item.resolution}</span>
                        )}
                        <span>{fmtBytes(item.size_bytes)}</span>
                        {item.duration && <span>{Math.round(item.duration)}s</span>}
                        <span className="text-zinc-600 truncate max-w-xs">{item.file_name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      to={ROUTES.scene(item._id)}
                      replace={true}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors text-xs font-bold"
                      title="Play Video"
                    >
                      ▶
                    </Link>
                    <button
                      type="button"
                      onClick={() => onReveal({ scene_id: item._id }, `dup-${item._id}`)}
                      disabled={revealing === `dup-${item._id}`}
                      className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors text-xs font-semibold cursor-pointer"
                      title="Open in File Explorer"
                    >
                      Locate
                    </button>
                    {!isBest && (
                      <button
                        type="button"
                        onClick={() => onDeleteDuplicate(item._id, cluster.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors text-xs font-bold cursor-pointer"
                        title="Delete redundant duplicate from database"
                      >
                        Delete Copy
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
