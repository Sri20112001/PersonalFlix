import React from "react";
import { useNavigate } from "react-router-dom";
import { thumbUrl } from "../utilities/media";
import { formatTime } from "../utilities/formatters";
import { ROUTES } from "../constants/routes";

// YouTube-style end screen: ranked recommendations overlaid on the player.
// Opens automatically when the video ends (unless auto-show is off) and can
// be toggled any time with the Up-Next button / U key.
export default function UpNextOverlay({
  recs = [],
  onClose,
  onReplay,
  autoShow,
  onToggleAutoShow,
}) {
  const navigate = useNavigate();
  if (!recs || recs.length === 0) return null;

  const [first, ...rest] = recs.slice(0, 7);
  const firstScene = first.scene || first;

  const go = (id) => {
    onClose && onClose();
    navigate(ROUTES.scene(id), { replace: true });
  };

  const Card = ({ item }) => {
    const sc = item.scene || item;
    const matchPct = item.match_percentage;
    const reason = (item.reasons && item.reasons[0]) || sc.studio || "";
    return (
      <button
        type="button"
        onClick={() => go(sc._id)}
        className="group text-left rounded-xl overflow-hidden bg-zinc-900/80 border border-white/10 hover:border-accent/60 hover:bg-zinc-900 transition-all cursor-pointer min-w-0"
      >
        <div className="relative w-full aspect-video overflow-hidden bg-black">
          <img
            src={thumbUrl(sc._id)}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          {matchPct && (
            <span className="absolute top-1.5 left-1.5 bg-black/80 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
              {matchPct}%
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="w-10 h-10 rounded-full bg-accent text-zinc-950 flex items-center justify-center font-bold">
              ▶
            </span>
          </span>
        </div>
        <div className="p-2 min-w-0">
          <div
            className="text-xs text-zinc-100 truncate group-hover:text-white font-medium"
            title={sc.title || sc.file_name}
          >
            {sc.title || sc.file_name}
          </div>
          {reason && (
            <div className="text-[10px] text-zinc-500 font-mono truncate mt-0.5" title={reason}>
              <span className="text-accent/80 font-bold">• </span>
              {reason}
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto custom-scrollbar"
      onClick={(e) => {
        e.stopPropagation();
        onClose && onClose();
      }}
    >
      <div
        className="w-full max-w-3xl px-6 py-6 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-white font-mono">
              Up next
            </h2>
            <span className="text-[10px] font-mono text-zinc-500">
              {recs.length} recommended
            </span>
          </div>
          <div className="flex items-center gap-3">
            <label
              className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 cursor-pointer select-none"
              title="Automatically show recommendations when a video ends"
            >
              <input
                type="checkbox"
                checked={!!autoShow}
                onChange={() => onToggleAutoShow && onToggleAutoShow()}
                className="accent-[#F5B301] w-3.5 h-3.5 cursor-pointer"
              />
              Auto-show
            </label>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-white text-lg leading-none px-1 cursor-pointer"
              title="Close (U)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Featured: top recommendation */}
        <button
          type="button"
          onClick={() => go(firstScene._id)}
          className="group w-full flex items-stretch gap-4 p-3 rounded-2xl bg-accent/10 border border-accent/40 hover:bg-accent/15 transition-all cursor-pointer text-left mb-3"
        >
          <div className="relative w-48 sm:w-64 flex-shrink-0 aspect-video rounded-xl overflow-hidden bg-black">
            <img
              src={thumbUrl(firstScene._id)}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            {first.match_percentage && (
              <span className="absolute top-1.5 left-1.5 bg-black/80 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                {first.match_percentage}% Match
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5 py-1">
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-accent">
              Best match — play next
            </div>
            <div
              className="text-sm font-bold text-white truncate"
              title={firstScene.title || firstScene.file_name}
            >
              {firstScene.title || firstScene.file_name}
            </div>
            {(first.reasons || []).slice(0, 2).map((r) => (
              <div key={r} className="text-[11px] font-mono text-zinc-400 truncate">
                <span className="text-accent/80 font-bold">• </span>
                {r}
              </div>
            ))}
            <div className="text-[11px] font-mono text-zinc-500">
              {[
                firstScene.studio,
                firstScene.duration ? formatTime(firstScene.duration) : null,
              ]
                .filter(Boolean)
                .join(" • ")}
            </div>
          </div>
          <div className="flex-shrink-0 self-center hidden sm:flex w-12 h-12 rounded-full bg-accent text-zinc-950 items-center justify-center font-bold text-lg group-hover:scale-105 transition-transform">
            ▶
          </div>
        </button>

        {/* Rest of the ranked list */}
        {rest.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {rest.map((item) => {
              const sc = item.scene || item;
              return <Card key={sc._id} item={item} />;
            })}
          </div>
        )}

        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            type="button"
            onClick={onReplay}
            className="px-4 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors cursor-pointer"
            title="Replay this video from the start"
          >
            ↺ Replay
          </button>
          <span className="text-[10px] font-mono text-zinc-600">
            Press <kbd className="px-1 py-0.5 rounded bg-white/10 text-zinc-300">U</kbd> to toggle
          </span>
        </div>
      </div>
    </div>
  );
}
