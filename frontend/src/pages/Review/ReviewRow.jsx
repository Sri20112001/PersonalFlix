import React from "react";
import { Link } from "react-router-dom";
import { thumbUrl } from "../../utilities/media";
import ReviewEditor from "./ReviewEditor";
import { ROUTES } from "../../constants/routes";

export default function ReviewRow({
  item,
  open,
  onToggle,
  studios,
  performers,
  onSaved,
}) {
  const hasIssues = (item.reasons || []).length > 0;

  return (
    <div
      className={`group/row relative overflow-hidden rounded-2xl border transition-all duration-300 backdrop-blur-xl ${
        open
          ? "bg-zinc-900/90 border-accent/60 shadow-xl shadow-accent/10 ring-1 ring-accent/40"
          : "bg-zinc-950/60 border-white/[0.08] hover:border-white/20 hover:bg-zinc-900/50 hover:shadow-lg"
      }`}
    >
      {/* Left Status Accent Spine */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 ${
          open
            ? "bg-accent"
            : hasIssues
              ? "bg-amber-500/70 group-hover/row:bg-amber-400"
              : "bg-transparent group-hover/row:bg-white/20"
        }`}
      />

      {/* Header Summary Row */}
      <div
        className="flex items-center gap-4 p-3.5 pl-5 cursor-pointer select-none"
        onClick={onToggle}
      >
        {/* Thumbnail with Hover Zoom */}
        <div className="relative w-20 h-12 rounded-xl overflow-hidden bg-zinc-900 border border-white/10 flex-shrink-0 shadow-inner group/thumb">
          <div
            className="w-full h-full bg-cover bg-center transition-transform duration-500 group-hover/thumb:scale-110"
            style={{
              backgroundImage: `url(${thumbUrl(item.sceneId)})`,
            }}
          />
          <div className="absolute inset-0 bg-black/20 group-hover/thumb:bg-black/0 transition-colors" />
        </div>

        {/* Primary Scene Details */}
        <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
          <div className="flex items-center gap-2">
            <Link
              to={ROUTES.scene(item.sceneId)}
              replace={true}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-bold text-zinc-100 hover:text-accent truncate transition-colors leading-tight tracking-wide"
            >
              {item.title || `Scene ${item.sceneId}`}
            </Link>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-zinc-400 border border-white/5 flex-shrink-0">
              #{item.sceneId}
            </span>
          </div>

          {/* Path & Issue Tags */}
          <div className="flex items-center gap-2 text-[11px] font-mono truncate">
            <span className="text-zinc-400 truncate max-w-[280px] lg:max-w-md">
              {item.filePath}
            </span>

            {hasIssues && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="w-1 h-1 rounded-full bg-zinc-700" />
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  {(item.reasons || []).join(" · ")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Metadata Badges & Trigger */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2 font-mono text-[10px]">
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-300">
              {item.studio || (
                <span className="text-zinc-500 italic">No Studio</span>
              )}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-300">
              {(item.performerRefs || []).length} Performers
            </span>
          </div>

          {/* Tactile Expand Chevron Button */}
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center border transition-all duration-300 ${
              open
                ? "bg-accent text-zinc-950 border-accent shadow-md shadow-accent/20 rotate-180"
                : "bg-white/[0.04] text-zinc-400 border-white/10 group-hover/row:text-white group-hover/row:bg-white/10"
            }`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>

      {/* Expanded Editor Tray */}
      {open && (
        <div className="border-t border-white/[0.08] bg-black/40 p-4 pl-6 animate-fade-in">
          <ReviewEditor
            item={item}
            studios={studios}
            performers={performers}
            onCancel={onToggle}
            onSaved={onSaved}
          />
        </div>
      )}
    </div>
  );
}
