import React, { useState } from "react";
import { Link } from "react-router-dom";
import { thumbUrl } from "../utilities/media";
import { formatBytes, formatYear } from "../utilities/formatters";
import { ROUTES } from "../constants/routes";

const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(135deg, #1e1e24 0%, #2a2b36 100%)",
  "linear-gradient(135deg, #181920 0%, #20222e 100%)",
  "linear-gradient(135deg, #1f1d2b 0%, #252836 100%)",
];

export default function VideoCardApple({
  scene,
  width = null,
  height = null,
  aspectRatio = "16/9",
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

  const numId = typeof scene._id === "number" ? scene._id : parseInt(scene._id, 10) || 0;
  const grad = PLACEHOLDER_GRADIENTS[Math.abs(numId) % PLACEHOLDER_GRADIENTS.length];
  const isAutoNew = showNew || (scene.mtime && Date.now() - scene.mtime * 1000 < 14 * 86400 * 1000);

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

  const effectiveIsFav = Boolean(isFavorite || scene.isFavorite || scene.is_favorite || scene.favorite);
  const hasProgress = showProgress || effectiveProgress > 0 || effectiveStatus === "watching";
  const shouldAutoResume = autoResume || (hasProgress && effectiveProgress > 0 && effectiveProgress < 95);

  return (
    <Link
      to={shouldAutoResume ? ROUTES.scene(scene._id, { resume: "true" }) : ROUTES.scene(scene._id)}
      replace={true}
      state={shouldAutoResume ? { autoResume: true } : undefined}
      className={`group relative flex-shrink-0 w-full rounded-2xl overflow-hidden select-none block transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] bg-zinc-900 border border-white/[0.08] ${
        focused
          ? "ring-4 ring-white/60 scale-[1.04] shadow-[0_24px_50px_rgba(0,0,0,0.6)] z-20"
          : "hover:scale-[1.03] hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.55)] hover:border-white/20"
      } ${className}`}
      style={{
        width: width ?? undefined,
        height: height ?? undefined,
        aspectRatio: !height ? aspectRatio : undefined,
      }}
    >
      {/* 1. Backdrop Thumbnail & Soft Zoom */}
      {!imgFailed ? (
        <img
          src={thumbUrl(scene._id)}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover scale-100 group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] opacity-90 group-hover:opacity-100"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ background: grad }}>
          <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white/40">
            ▶
          </div>
        </div>
      )}

      {/* 2. Glass Sheen / Specular Light Reflection Sweep on Hover */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out" />

      {/* 3. Deep Vignette to ground the typography */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

      {/* 4. Top Status Capsule */}
      <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-1.5">
          {effectiveIsFav && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/20 backdrop-blur-xl border border-amber-300/30 text-amber-200 text-[10px] font-semibold shadow-sm">
              ★ Favorited
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {scene.resolution && (
            <span className="px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-xl text-zinc-300 border border-white/10 text-[9px] font-medium tracking-wide">
              {scene.resolution}
            </span>
          )}

          {effectiveStatus === "watching" && (
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xl text-white text-[9px] font-semibold border border-white/20">
              Resume
            </span>
          )}

          {effectiveStatus === "watched" && (
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 backdrop-blur-xl border border-emerald-400/30 text-emerald-300 text-[10px] flex items-center justify-center font-bold">
              ✓
            </span>
          )}

          {effectiveStatus === "unwatched" && isAutoNew && (
            <span className="px-2 py-0.5 rounded-full bg-blue-500/90 text-white text-[9px] font-semibold tracking-wider">
              NEW
            </span>
          )}
        </div>
      </div>

      {/* 5. Center Glass Play Badge */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="w-12 h-12 rounded-full bg-white/25 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.3)] flex items-center justify-center text-white opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 ease-out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 drop-shadow">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>

      {/* 6. Floating Liquid Glass Shelf */}
      <div className="absolute bottom-3 inset-x-3 p-2.5 rounded-xl bg-black/40 backdrop-blur-2xl border border-white/10 group-hover:border-white/20 group-hover:bg-black/55 transition-all duration-300 z-10 flex items-center justify-between gap-3 shadow-lg">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-white truncate tracking-tight">
            {scene.title || scene.file_name}
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
            {scene.studio && <span className="font-semibold text-zinc-300 truncate">{scene.studio}</span>}
            {metaParts.length > 0 && <span className="opacity-70 font-mono text-[9px]">{metaParts.slice(0, 2).join(" · ")}</span>}
          </div>
        </div>

        <div className="w-6 h-6 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 group-hover:text-white group-hover:bg-white/20 transition-colors shrink-0">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>

      {/* 7. Bottom Edge Progress Indicator */}
      {hasProgress && (
        <div className="absolute bottom-0 inset-x-0 h-[3px] bg-white/10 overflow-hidden z-20">
          <div
            className="h-full bg-white/90 rounded-r-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            style={{ width: `${Math.min(100, Math.max(0, effectiveProgress))}%` }}
          />
        </div>
      )}
    </Link>
  );
}