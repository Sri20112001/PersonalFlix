import React from "react";
import VideoCard from "../../components/VideoCard";

export default function SimilarScenesRail({ recs = [] }) {
  if (!recs || recs.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 pt-4 border-t border-white/10">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono">
          More Like This
        </h2>
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
          Library Matched
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {recs.map((item) => {
          const sc = item.scene || item;
          const matchPct = item.match_percentage;
          const reasons = item.reasons || [];
          const primaryReason = reasons[0];
          return (
            <div key={sc._id} className="flex flex-col gap-1.5 group">
              <div className="relative">
                <VideoCard scene={sc} />
                {matchPct && (
                  <div className="absolute top-2 left-2 pointer-events-none z-10">
                    <span className="bg-black/80 backdrop-blur-md text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shadow">
                      {matchPct}% Match
                    </span>
                  </div>
                )}
              </div>
              {primaryReason && (
                <div className="flex items-center gap-1.5 px-1 text-[11px] font-mono text-zinc-400 truncate" title={primaryReason}>
                  <span className="text-accent/80 font-bold">•</span>
                  <span className="truncate">{primaryReason}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
