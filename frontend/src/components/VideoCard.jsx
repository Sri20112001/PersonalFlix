import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { thumbUrl } from "../utilities/media";
import { formatBytes, formatYear } from "../utilities/formatters";
import { ROUTES } from "../constants/routes";

const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(135deg,#141415 0%,#33270a 55%,#0a0a0b 100%)",
  "linear-gradient(135deg,#141415 0%,#1a1440 55%,#0a0a0b 100%)",
  "linear-gradient(135deg,#141415 0%,#0f2b2a 55%,#0a0a0b 100%)",
  "linear-gradient(135deg,#141415 0%,#3a2807 55%,#0a0a0b 100%)",
  "linear-gradient(135deg,#141415 0%,#2a0f35 55%,#0a0a0b 100%)",
];

export default function VideoCard({
  scene,
  width = null, // e.g. 300, "100%", or null (lets parent grid/rail dictate width)
  height = null, // null by default; aspect ratio calculates height automatically
  aspectRatio = "16/9", // "16/9", "video", "4/3", "1/1", etc.
  showProgress,
  progress,
  showNew,
  focused = false,
  className = "",
  autoResume = false,
  status = null,
  isFavorite = false,
}) {
  if (!scene || !scene._id) return null;

  const [imgFailed, setImgFailed] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef(null);

  const numId = typeof scene._id === "number" ? scene._id : parseInt(scene._id, 10) || 0;
  const grad = PLACEHOLDER_GRADIENTS[Math.abs(numId) % PLACEHOLDER_GRADIENTS.length];

  const isAutoNew =
    showNew || (scene.mtime && Date.now() - scene.mtime * 1000 < 14 * 86400 * 1000);

  const metaParts = [];
  if (scene.resolution) metaParts.push(scene.resolution.toUpperCase());
  if (scene.date) {
    const y = formatYear(scene.date);
    if (y) metaParts.push(y);
  }
  if (scene.size_bytes && scene.size_bytes > 0) {
    metaParts.push(formatBytes(scene.size_bytes));
  }

  const effectiveProgress = typeof progress === "number" ? progress : scene.progress || 0;
  const rawStatus = (status || scene.status || scene.tracking?.status || "").toLowerCase();
  const effectiveStatus = rawStatus
    ? rawStatus
    : effectiveProgress >= 90
    ? "watched"
    : effectiveProgress > 0
    ? "watching"
    : "unwatched";

  const effectiveIsFav = Boolean(
    isFavorite || scene.isFavorite || scene.is_favorite || scene.favorite
  );

  const hasProgress = showProgress || effectiveProgress > 0 || effectiveStatus === "watching";
  const shouldAutoResume = autoResume || (hasProgress && effectiveProgress > 0 && effectiveProgress < 95);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Distinct border & opacity classes based on status
  let statusClasses = "border-white/10";
  if (effectiveStatus === "skip") {
    statusClasses = "opacity-65 hover:opacity-100 grayscale-[40%] hover:grayscale-0 border-zinc-800/80";
  } else if (effectiveStatus === "watching") {
    statusClasses = "border-accent/40 shadow-lg shadow-accent/5";
  } else if (effectiveStatus === "watched") {
    statusClasses = "border-emerald-500/25";
  } else if (effectiveIsFav) {
    statusClasses = "border-rose-500/30";
  }

  return (
    <Link
      ref={cardRef}
      to={shouldAutoResume ? ROUTES.scene(scene._id, { resume: "true" }) : ROUTES.scene(scene._id)}
      replace={true}
      state={shouldAutoResume ? { autoResume: true } : undefined}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative flex-shrink-0 w-full rounded-xl bg-zinc-950/90 border overflow-hidden transition-all duration-300 group select-none block ${statusClasses} ${
        focused
          ? "ring-2 ring-accent scale-[1.03] shadow-2xl shadow-accent/20 z-10"
          : "hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/70 hover:border-white/25"
      } ${className}`}
      style={{
        width: width ?? undefined,
        height: height ?? undefined,
        aspectRatio: !height ? aspectRatio : undefined, // Enforces aspect ratio when explicit height is omitted
      }}
    >
      {/* 1. Dynamic Radial Spotlight Effect */}
      <div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30"
        style={{
          background: isHovered
            ? `radial-gradient(160px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.12), transparent 80%)`
            : "none",
        }}
      />

      {/* 2. Media Layer */}
      {!imgFailed ? (
        <img
          src={thumbUrl(scene._id)}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover scale-100 group-hover:scale-105 opacity-80 group-hover:opacity-100 transition-all duration-500 ease-out"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ background: grad }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" />
            <line x1="2" y1="17" x2="7" y2="17" />
            <line x1="17" y1="17" x2="22" y2="17" />
            <line x1="17" y1="7" x2="22" y2="7" />
          </svg>
        </div>
      )}

      {/* 3. Gradient Vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/20 group-hover:from-black/95 group-hover:via-black/40 group-hover:to-transparent transition-all duration-300 pointer-events-none" />

      {/* 4. Top Badges Row */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-20 gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {scene.resolution && (
            <span className="bg-zinc-950/70 backdrop-blur-md text-[10px] font-mono font-bold px-2 py-0.5 rounded-full text-zinc-300 border border-white/10 shadow-sm uppercase tracking-wider">
              {scene.resolution}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Favorite Badge */}
          {effectiveIsFav && (
            <span
              className="flex items-center gap-1 bg-rose-950/85 backdrop-blur-md text-rose-300 border border-rose-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-[0_0_12px_rgba(244,63,94,0.35)]"
              title="Favorite Scene"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-rose-400">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span>Fav</span>
            </span>
          )}

          {/* Skipped Badge */}
          {effectiveStatus === "skip" && (
            <span
              className="flex items-center gap-1 bg-zinc-900/90 backdrop-blur-md text-zinc-400 border border-zinc-700/60 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm"
              title="Skipped Scene"
            >
              <span>⊘</span>
              <span>Skipped</span>
            </span>
          )}

          {/* Watching Badge */}
          {effectiveStatus === "watching" && (
            <span
              className="flex items-center gap-1.5 bg-accent/90 backdrop-blur-md text-zinc-950 border border-accent text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-[0_0_10px_rgba(245,179,1,0.4)]"
              title="Currently Watching"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-pulse" />
              <span>Watching</span>
            </span>
          )}

          {/* Watched Badge */}
          {effectiveStatus === "watched" && (
            <span
              className="flex items-center gap-1 bg-emerald-950/85 backdrop-blur-md text-emerald-300 border border-emerald-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm"
              title="Watched Scene"
            >
              <span>✓</span>
              <span>Watched</span>
            </span>
          )}

          {/* Want to Watch Badge */}
          {effectiveStatus === "want-to-watch" && (
            <span
              className="flex items-center gap-1 bg-sky-950/85 backdrop-blur-md text-sky-300 border border-sky-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm"
              title="Want to Watch"
            >
              <span>🔖</span>
              <span>Want</span>
            </span>
          )}

          {/* New Badge for unwatched recent scenes */}
          {effectiveStatus === "unwatched" && isAutoNew && (
            <span className="relative flex items-center gap-1.5 bg-accent/90 backdrop-blur-md text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest shadow-[0_0_12px_rgba(255,255,255,0.2)] border border-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              New
            </span>
          )}
        </div>
      </div>

      {/* 5. Center Play Button */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
        <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 shadow-xl group-hover:shadow-accent/40">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>

      {/* 6. Bottom Metadata Island */}
      <div className="absolute bottom-2 left-2 right-2 p-2 rounded-lg bg-zinc-900/60 backdrop-blur-md border border-white/10 flex items-center justify-between gap-2 z-20 transition-all duration-300 group-hover:border-white/20 group-hover:bg-zinc-900/80">
        <div className="flex flex-col min-w-0 pr-1">
          <span className="font-semibold text-xs text-zinc-100 truncate leading-tight group-hover:text-white transition-colors">
            {scene.title || scene.file_name}
          </span>

          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400 font-medium">
            {scene.studio && (
              <span className="truncate max-w-[100px] text-zinc-300">
                {scene.studio}
              </span>
            )}
            {metaParts.length > 0 && (
              <span className="text-zinc-500 font-mono text-[9px]">
                {metaParts.slice(0, 2).join(" · ")}
              </span>
            )}
          </div>
        </div>

        <div className="w-5 h-5 rounded-md bg-white/5 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:bg-accent/80 transition-all flex-shrink-0">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>

      {/* 7. Watch Progress Bar */}
      {hasProgress && (
        <div className="absolute bottom-0 left-0 w-full h-[3px] bg-black/80 overflow-hidden z-20">
          <div
            className="h-full bg-accent transition-all duration-300 rounded-r-full shadow-[0_0_8px_var(--color-accent)]"
            style={{ width: `${Math.min(100, Math.max(0, effectiveProgress))}%` }}
          />
        </div>
      )}
    </Link>
  );
}