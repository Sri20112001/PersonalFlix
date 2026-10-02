import React from "react";
import { thumbUrl, performerImage } from "../../utilities/media";
import { formatTime, formatDate } from "../../utilities/formatters";
import { ROUTES } from "../../constants/routes";

// Uiverse-styled inspector: gradient-border profile cards, shine-sweep CTA
// and ghost buttons. Props & behavior unchanged.
export default function GraphInspector({ selectedNode, onClose, navigate }) {
  if (!selectedNode) return null;

  return (
    <div className="uv-scope absolute top-16 right-6 bottom-6 w-80 sm:w-96 bg-surface/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-30 flex flex-col overflow-hidden slide-in-right">
      {/* Drawer Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              selectedNode.type === "studio"
                ? "bg-indigo-400"
                : selectedNode.type === "performer"
                ? "bg-accent"
                : "bg-red-400"
            }`}
          />
          <span className="text-xs uppercase font-mono tracking-widest text-textMuted">
            {selectedNode.type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-textSecondary hover:text-white transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 custom-scrollbar">
        {/* SCENE NODE INSPECTOR */}
        {selectedNode.type === "scene" && (
          <>
            <div className="uv-card" style={{ padding: 0, overflow: "hidden", display: "block" }}>
              <div className="relative aspect-video w-full bg-black/60">
                <img
                  src={thumbUrl(selectedNode.raw_id)}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => (e.target.style.display = "none")}
                />
                {selectedNode.resolution && (
                  <span className="absolute top-2 left-2 bg-black/80 backdrop-blur px-2 py-0.5 rounded text-[10px] font-mono text-white font-bold border border-white/10 uppercase">
                    {selectedNode.resolution}
                  </span>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold text-white leading-snug">
                {selectedNode.name}
              </h2>
              <div className="flex items-center gap-2 text-xs text-textSecondary mt-1 font-mono">
                {selectedNode.duration && <span>{formatTime(selectedNode.duration)}</span>}
                {selectedNode.date && (
                  <>
                    <span>·</span>
                    <span>{formatDate(selectedNode.date)}</span>
                  </>
                )}
              </div>
            </div>

            {selectedNode.studio && (
              <div className="text-xs">
                <span className="text-textMuted uppercase font-mono text-[10px] block mb-1">Studio</span>
                <button
                  onClick={() => navigate(ROUTES.studio(selectedNode.studio_id))}
                  className="text-white hover:text-accent font-medium transition-colors cursor-pointer"
                >
                  {selectedNode.studio}
                </button>
              </div>
            )}

            <button
              onClick={() => navigate(ROUTES.scene(selectedNode.raw_id))}
              className="uv-cta"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Play Scene</span>
            </button>
          </>
        )}

        {/* PERFORMER NODE INSPECTOR */}
        {selectedNode.type === "performer" && (
          <>
            <div className="uv-card">
              {selectedNode.image_url ? (
                <img
                  src={performerImage(selectedNode.image_url)}
                  alt=""
                />
              ) : (
                <div className="uv-fallback">
                  {selectedNode.name[0]?.toUpperCase() || "?"}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white leading-snug truncate">
                  {selectedNode.name}
                </h2>
                <div className="flex items-center gap-2 text-xs text-textSecondary mt-1 font-mono">
                  <span>{selectedNode.scene_count || 0} scenes</span>
                  {selectedNode.country && (
                    <>
                      <span>·</span>
                      <span>{selectedNode.country}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate(ROUTES.performer(selectedNode.raw_id))}
              className="uv-ghostbtn"
            >
              View Performer Profile
            </button>
          </>
        )}

        {/* STUDIO NODE INSPECTOR */}
        {selectedNode.type === "studio" && (
          <>
            <div className="uv-card uv-indigo">
              <div className="uv-fallback uv-sm">
                {selectedNode.name[0]?.toUpperCase() || "S"}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white leading-snug truncate">
                  {selectedNode.name}
                </h2>
                <div className="text-xs text-textSecondary mt-1 font-mono">
                  {selectedNode.scene_count || 0} scenes
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate(ROUTES.studio(selectedNode.raw_id))}
              className="uv-ghostbtn"
            >
              View Studio Catalog
            </button>
          </>
        )}
      </div>
    </div>
  );
}
