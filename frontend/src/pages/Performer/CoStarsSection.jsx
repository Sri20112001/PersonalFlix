import React from "react";
import { performerImage } from "../../utilities/media";
import { formatTotalDuration } from "../../utilities/formatters";

export default function CoStarsSection({
  coStarsWithStats = [],
  selectedCoStar = null,
  onSelectCoStar,
}) {
  if (!coStarsWithStats || coStarsWithStats.length === 0) return null;

  return (
    <div className="lg:col-span-2 relative group rounded-2xl border border-white/10 bg-zinc-950/60 p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-md">
      <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative z-10 flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
          </span>
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Co-Star Collaboration Matrix
          </h2>
        </div>

        {selectedCoStar && (
          <button
            type="button"
            onClick={() => onSelectCoStar(null)}
            className="group/btn inline-flex items-center gap-1.5 text-[11px] font-mono text-accent hover:text-white transition-colors cursor-pointer bg-accent/10 hover:bg-accent/20 border border-accent/20 px-2.5 py-0.5 rounded-full"
          >
            <span>Filtering by {selectedCoStar.name}</span>
            <span className="inline-block transition-transform duration-200 group-hover/btn:rotate-90">✕</span>
          </button>
        )}
      </div>

      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {coStarsWithStats.slice(0, 8).map((cs) => {
          const isSelected = selectedCoStar?._id === cs._id;
          return (
            <div
              key={cs._id || cs.name}
              onClick={() => onSelectCoStar(isSelected ? null : cs)}
              className={`group/cs relative flex items-center gap-2.5 p-2 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
                isSelected
                  ? "bg-accent/15 border-accent shadow-[0_0_15px_rgba(245,179,1,0.2)]"
                  : "bg-white/[0.02] hover:bg-white/[0.06] border-white/5 hover:border-white/15"
              }`}
            >
              <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10">
                {cs.image_url ? (
                  <img
                    src={performerImage(cs.image_url)}
                    alt={cs.name}
                    className="w-full h-full object-cover object-top"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-display text-xs text-white/30">
                    {(cs.name || "?")[0]}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-zinc-200 group-hover/cs:text-accent truncate transition-colors">
                  {cs.name}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 mt-0.5">
                  <span>{cs.mutualScenesCount || 1} scenes</span>
                  {cs.mutualDuration > 0 && (
                    <>
                      <span>·</span>
                      <span>{formatTotalDuration(cs.mutualDuration)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
