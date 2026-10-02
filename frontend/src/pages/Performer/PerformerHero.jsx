import React from "react";
import { performerImage } from "../../utilities/media";
import { formatTotalDuration } from "../../utilities/formatters";

export default function PerformerHero({
  performer,
  imgErr,
  setImgErr,
  scenesCount = 0,
  studiosCount = 0,
  stats,
  isFav = false,
  onToggleFavorite,
  onPlayRandom,
  onBack,
}) {
  if (!performer) return null;

  const watchedCount = stats?.watched_count || 0;
  const watchPct = scenesCount > 0 ? Math.round((watchedCount / scenesCount) * 100) : 0;

  return (
    <div className="relative pt-6 pb-10 px-8 md:px-12 flex-shrink-0 border-b border-white/10 overflow-hidden bg-zinc-950/70 backdrop-blur-xl">
      {/* Ambient blurred backdrop bloom */}
      {!imgErr && performer.image_url && (
        <div
          className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-25 scale-125 pointer-events-none transform -translate-y-10"
          style={{ backgroundImage: `url(${performerImage(performer.image_url)})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-zinc-950/80 to-zinc-950 pointer-events-none" />

      {/* Top Navigation Row */}
      <div className="relative z-10 flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-zinc-400 hover:text-zinc-100 text-xs font-mono font-semibold transition-all cursor-pointer active:scale-95"
          title="Back (Esc / Backspace)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform group-hover:-translate-x-0.5"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>Back</span>
        </button>
      </div>

      {/* Hero Card Details */}
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-8">
        {/* Avatar with Glow Border */}
        <div className="relative flex-shrink-0 group">
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-tr from-accent/50 to-white/20 opacity-40 blur-sm group-hover:opacity-75 transition-opacity" />
          {!imgErr && performer.image_url ? (
            <img
              src={performerImage(performer.image_url)}
              onError={() => setImgErr(true)}
              alt={performer.name}
              className="relative aspect-9/16 h-28 md:h-64 rounded-2xl object-cover object-top border border-white/20 shadow-2xl bg-zinc-900"
            />
          ) : (
            <div className="relative w-28 h-28 md:w-36 md:h-36 rounded-2xl bg-gradient-to-b from-zinc-900 to-accent/30 flex items-center justify-center font-display text-5xl text-white/40 border border-white/10 shadow-2xl">
              {(performer.name || "?")[0].toUpperCase()}
            </div>
          )}
        </div>

        {/* Profile Meta & Actions */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display uppercase tracking-wider text-3xl md:text-4xl text-white font-extrabold drop-shadow-sm">
              {performer.name}
            </h1>
            {performer.gender && (
              <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-zinc-300 shadow-sm">
                {performer.gender}
              </span>
            )}
          </div>

          {/* Sub-header meta */}
          <div className="flex items-center gap-3 text-xs text-zinc-400 mt-2.5 flex-wrap font-mono">
            {performer.country && (
              <span className="flex items-center gap-1.5 text-zinc-200">
                <span className="text-[11px]">📍</span>
                <span>{performer.country}</span>
              </span>
            )}
            {performer.views != null && (
              <>
                <span className="text-zinc-600">·</span>
                <span>{Number(performer.views).toLocaleString()} views</span>
              </>
            )}
            {performer.source_url && (
              <>
                <span className="text-zinc-600">·</span>
                <a
                  href={performer.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline flex items-center gap-1.5 transition-colors"
                >
                  <span>Profile Source</span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                  </svg>
                </a>
              </>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            {/* Favorite Button */}
            <button
              onClick={onToggleFavorite}
              className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer select-none active:scale-95 ${
                isFav
                  ? "bg-accent text-zinc-950 shadow-[0_0_25px_rgba(255,255,255,0.25)] ring-1 ring-white/30"
                  : "bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/10 hover:border-white/20"
              }`}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill={isFav ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
              </svg>
              <span>{isFav ? "Favorited" : "Favorite"}</span>
            </button>

            {/* Play Random Scene Button */}
            {scenesCount > 0 && (
              <button
                onClick={onPlayRandom}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-semibold uppercase tracking-wider bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 hover:text-white border border-white/10 hover:border-white/20 transition-all cursor-pointer active:scale-95 shadow-sm"
                title="Play a random scene featuring this performer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Play Random</span>
              </button>
            )}
          </div>

          {/* Quick Statistics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <div className="relative group overflow-hidden bg-white/[0.03] border border-white/5 hover:border-white/15 rounded-xl p-3 backdrop-blur-md transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Scenes</div>
              <div className="text-base font-bold text-white font-mono mt-0.5">{scenesCount}</div>
            </div>

            <div className="relative group overflow-hidden bg-white/[0.03] border border-white/5 hover:border-white/15 rounded-xl p-3 backdrop-blur-md transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Total Watch Time</div>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                {formatTotalDuration(stats?.total_duration)}
              </div>
            </div>

            <div className="relative group overflow-hidden bg-white/[0.03] border border-white/5 hover:border-white/15 rounded-xl p-3 backdrop-blur-md transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Studios</div>
              <div className="text-base font-bold text-white font-mono mt-0.5">{studiosCount}</div>
            </div>

            <div className="relative group overflow-hidden bg-white/[0.03] border border-white/5 hover:border-white/15 rounded-xl p-3 backdrop-blur-md transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
              <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                <span>Watched</span>
                <span className="text-zinc-400 font-bold">{watchPct}%</span>
              </div>
              <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-2.5">
                <div
                  className="bg-accent h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(255,255,255,0.4)]"
                  style={{ width: `${watchPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
