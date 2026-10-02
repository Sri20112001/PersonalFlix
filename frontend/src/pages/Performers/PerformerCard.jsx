import React, { useRef, useState } from "react";
import { performerImage } from "../../utilities/media";

export function PortraitCard({ p, imgErr, onImgErr, isFav, onToggleFav, onClick }) {
  const sceneCount = p.scene_count || 0;
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative bg-zinc-950/80 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-black/80 border border-white/10 hover:border-white/25 flex flex-col"
    >
      {/* Radial Spotlight Effect */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30"
        style={{
          background: isHovered
            ? `radial-gradient(150px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.12), transparent 80%)`
            : "none",
        }}
      />

      {/* Portrait Photo Container */}
      <div className="relative aspect-[3/4] w-full bg-zinc-900 overflow-hidden">
        {!imgErr && p.image_url ? (
          <img
            src={performerImage(p.image_url)}
            onError={onImgErr}
            alt={p.name}
            loading="lazy"
            className="w-full h-full object-cover object-top scale-100 group-hover:scale-105 transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-zinc-900 to-zinc-950 flex items-center justify-center font-display text-4xl text-white/30">
            {(p.name || "?")[0].toUpperCase()}
          </div>
        )}

        {/* Subtle Ambient Shadow */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-20">
          {p.country ? (
            <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-zinc-950/70 backdrop-blur-md border border-white/10 text-zinc-300 shadow-sm">
              {p.country}
            </span>
          ) : (
            <span />
          )}

          {/* Heart Pill */}
          <button
            onClick={onToggleFav}
            className={`pointer-events-auto w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-all cursor-pointer active:scale-90 ${
              isFav
                ? "bg-accent text-zinc-950 border-accent shadow-lg shadow-accent/30 scale-105"
                : "bg-black/40 text-white/80 border-white/15 hover:text-white hover:bg-black/70 opacity-0 group-hover:opacity-100"
            }`}
            title={isFav ? "Remove Favorite" : "Add Favorite"}
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
          </button>
        </div>

        {/* Bottom Floating Glass Island */}
        <div className="absolute bottom-2 left-2 right-2 p-2 rounded-xl bg-zinc-950/70 backdrop-blur-md border border-white/10 group-hover:border-white/20 transition-all duration-300 z-20">
          <div className="text-xs font-bold text-zinc-100 truncate group-hover:text-white transition-colors leading-tight">
            {p.name}
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1 font-mono">
            <span>{sceneCount} {sceneCount === 1 ? "scene" : "scenes"}</span>
            {p.gender && (
              <span className="capitalize text-[9px] text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded">
                {p.gender}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompactCard({ p, imgErr, onImgErr, isFav, onToggleFav, onClick }) {
  const sceneCount = p.scene_count || 0;
  return (
    <div
      onClick={onClick}
      className="group flex items-center justify-between bg-zinc-950/80 hover:bg-zinc-900/90 p-2.5 rounded-xl border border-white/10 hover:border-white/20 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl shadow-sm"
    >
      <div className="flex items-center gap-3 min-w-0">
        {!imgErr && p.image_url ? (
          <img
            src={performerImage(p.image_url)}
            onError={onImgErr}
            alt=""
            loading="lazy"
            className="w-11 h-11 rounded-full object-cover object-top flex-shrink-0 bg-zinc-900 border border-white/10 group-hover:border-white/30 transition-colors"
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center font-display text-sm flex-shrink-0 text-zinc-400">
            {(p.name || "?")[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-xs font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">
            {p.name}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
            {sceneCount} {sceneCount === 1 ? "scene" : "scenes"}
          </div>
        </div>
      </div>

      <button
        onClick={onToggleFav}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
          isFav
            ? "text-accent bg-accent/10 border border-accent/20"
            : "text-zinc-600 hover:text-white opacity-0 group-hover:opacity-100 hover:bg-white/10"
        }`}
        title={isFav ? "Remove Favorite" : "Add Favorite"}
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
      </button>
    </div>
  );
}

export default function PerformerCard({ mode = "portrait", ...props }) {
  if (mode === "compact") {
    return <CompactCard {...props} />;
  }
  return <PortraitCard {...props} />;
}
