import React from "react";
import { thumbUrl } from "../../utilities/media";
import { formatYear, formatBytes } from "../../utilities/formatters";

export default function SceneListItem({
  scene,
  index,
  isFocused = false,
  onFocus,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
  onOpen,
  effectiveStatus = "unwatched",
  effectiveProg = 0,
  isFav = false,
}) {
  const hasProgress = effectiveStatus === "watching" || (effectiveProg || 0) > 0;

  let listStatusClasses = "border-white/[0.08]";
  if (effectiveStatus === "skip") {
    listStatusClasses = "opacity-60 hover:opacity-100 grayscale-[40%] hover:grayscale-0 border-zinc-800/80";
  } else if (effectiveStatus === "watching") {
    listStatusClasses = "border-accent/40 shadow-sm shadow-accent/5";
  } else if (effectiveStatus === "watched") {
    listStatusClasses = "border-emerald-500/20";
  } else if (isFav) {
    listStatusClasses = "border-rose-500/25";
  }

  return (
    <div
      data-idx={index}
      onClick={(e) => {
        if (selectMode) {
          onToggleSelect && onToggleSelect(scene._id, e);
        } else {
          onOpen && onOpen(scene._id);
        }
      }}
      onMouseEnter={onFocus}
      className={`group/item relative flex items-center justify-between gap-4 p-2 rounded-2xl border backdrop-blur-xl transition-all duration-200 select-none cursor-pointer overflow-hidden ${
        selectMode && isSelected
          ? "bg-accent/10 border-accent shadow-lg shadow-accent/5 ring-1 ring-accent/40"
          : listStatusClasses
      } ${
        isFocused
          ? "bg-zinc-900/90 border-accent/50 shadow-xl shadow-accent/5 ring-1 ring-accent/30 -translate-y-0.5"
          : "bg-zinc-950/60 hover:bg-zinc-900/60 hover:border-white/20"
      }`}
    >
      {/* Left Focus Indicator Bar */}
      <div
        className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-all duration-300 ${
          isFocused
            ? "bg-accent opacity-100 shadow-[0_0_10px_var(--color-accent)]"
            : "opacity-0 group-hover/item:opacity-40 bg-white"
        }`}
      />

      {/* Media & Content Left Block */}
      <div className="flex items-center gap-3.5 min-w-0 pl-1.5">
        {/* Select Mode Checkbox */}
        {selectMode && (
          <button
            type="button"
            onClick={(e) => onToggleSelect && onToggleSelect(scene._id, e)}
            className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center transition-all ${
              isSelected
                ? "bg-accent text-zinc-950 shadow-md ring-2 ring-zinc-950"
                : "bg-black/60 border border-white/40 text-white/50 hover:border-white"
            }`}
          >
            {isSelected ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <div className="w-2 h-2 rounded-full bg-white/20" />
            )}
          </button>
        )}

        {/* Native Lightweight Thumbnail */}
        <div className="relative w-60 aspect-video flex-shrink-0 rounded-xl overflow-hidden bg-zinc-900 border border-white/10 shadow-md group/thumb">
          <img
            src={thumbUrl(scene._id)}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              if (e.currentTarget.nextSibling) {
                e.currentTarget.nextSibling.style.display = "flex";
              }
            }}
            className="w-full h-full object-cover scale-100 group-hover/item:scale-105 transition-transform duration-500 ease-out"
          />

          {/* Image Fallback Container */}
          <div className="hidden w-full h-full items-center justify-center bg-zinc-900 text-zinc-600">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="2" y="2" width="20" height="20" rx="4" />
              <path d="M10 9l5 3-5 3V9z" />
            </svg>
          </div>

          {/* Thumbnail Hover Darkening */}
          <div className="absolute inset-0 bg-black/25 group-hover/item:bg-black/0 transition-colors" />

          {/* Top Badges inside thumbnail */}
          <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 pointer-events-none z-10">
            {scene.resolution ? (
              <span className="bg-black/80 backdrop-blur text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-zinc-300 border border-white/10 uppercase">
                {scene.resolution}
              </span>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-1 flex-wrap justify-end">
              {isFav && (
                <span className="bg-rose-950/90 text-rose-300 border border-rose-500/40 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" className="text-rose-400">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                  <span>Fav</span>
                </span>
              )}
              {effectiveStatus === "skip" && (
                <span className="bg-zinc-900/90 text-zinc-400 border border-zinc-700/60 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full">
                  ⊘ Skip
                </span>
              )}
              {effectiveStatus === "watching" && (
                <span className="bg-accent/90 text-zinc-950 font-black text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                  <span className="w-1 h-1 rounded-full bg-zinc-950 animate-pulse" />
                  Watching
                </span>
              )}
              {effectiveStatus === "watched" && (
                <span className="bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  ✓ Watched
                </span>
              )}
              {effectiveStatus === "want-to-watch" && (
                <span className="bg-sky-950/90 text-sky-300 border border-sky-500/40 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  🔖 Want
                </span>
              )}
            </div>
          </div>

          {/* Watch Progress Bar */}
          {hasProgress && (
            <div className="absolute bottom-0 left-0 w-full h-1 bg-black/60 overflow-hidden">
              <div
                className="h-full bg-accent"
                style={{
                  width: `${Math.min(100, Math.max(0, effectiveProg || 0))}%`,
                }}
              />
            </div>
          )}
        </div>

        {/* Metadata Block */}
        <div className="min-w-0 flex flex-col justify-center gap-1">
          {/* Title */}
          <div className="text-xs sm:text-sm font-bold text-zinc-100 truncate group-hover/item:text-accent transition-colors tracking-wide leading-tight">
            {scene.title || scene.file_name}
          </div>

          {/* Studio & Performers Tagline */}
          <div className="flex items-center gap-2 text-xs text-zinc-400 truncate">
            {scene.studio && (
              <span className="font-semibold text-zinc-200 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-md">
                {scene.studio}
              </span>
            )}
            {scene.performers && scene.performers.length > 0 && (
              <span className="text-zinc-400 truncate text-[11px]">
                {scene.performers.slice(0, 3).join(", ")}
              </span>
            )}
          </div>

          {/* Spec Chips Row */}
          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
            {scene.date && <span>{formatYear(scene.date)}</span>}
            {scene.size_bytes && scene.size_bytes > 0 && (
              <>
                <span className="text-zinc-700">•</span>
                <span>{formatBytes(scene.size_bytes)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right Play Action Trigger */}
      <div className="flex items-center gap-2 flex-shrink-0 pr-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen && onOpen(scene._id);
          }}
          className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all duration-200 cursor-pointer shadow-md ${
            isFocused
              ? "bg-accent text-zinc-950 border-accent shadow-accent/20 scale-105"
              : "bg-white/[0.04] text-zinc-400 border-white/10 hover:text-white hover:bg-white/10 group-hover/item:scale-100 scale-95"
          }`}
          title="Play Scene"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="ml-0.5"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
