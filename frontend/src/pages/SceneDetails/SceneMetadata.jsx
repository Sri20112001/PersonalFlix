import React from "react";
import { Link } from "react-router-dom";
import { performerImage } from "../../utilities/media";
import { formatTime, formatBytes } from "../../utilities/formatters";
import { ROUTES } from "../../constants/routes";

export default function SceneMetadata({
  performers = [],
  scene,
  durationSec = 0,
  onCopyPath,
  copiedPath = false,
}) {
  return (
    <>
      {/* Cast & Performers */}
      {performers.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono">
            Cast &amp; Performers ({performers.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            {performers.map((p) => (
              <Link
                key={p._id}
                to={ROUTES.performer(p._id)}
                className="flex flex-col items-center p-3 rounded-2xl bg-zinc-950/70 border border-white/10 hover:border-white/25 hover:bg-zinc-900/80 transition-all group select-none shadow-md text-center"
              >
                <div className="w-20 h-20 rounded-full overflow-hidden mb-2.5 bg-zinc-900 border border-white/10 group-hover:border-accent/60 group-hover:scale-105 transition-all shadow-inner">
                  {p.image_path ? (
                    <img
                      src={performerImage(p.image_path)}
                      alt={p.name}
                      className="w-full h-full object-cover object-top"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 font-display font-bold text-xl">
                      {p.name ? p.name.charAt(0).toUpperCase() : "?"}
                    </div>
                  )}
                </div>
                <span className="text-xs font-bold text-white group-hover:text-accent transition-colors truncate w-full">
                  {p.name}
                </span>
                {p.birthdate && (
                  <span className="text-[10px] font-mono text-zinc-500 mt-0.5">
                    Born {p.birthdate.slice(0, 4)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Technical Specs Spec Island */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono">
          File Specifications
        </h2>
        <div className="p-5 rounded-2xl bg-zinc-950/70 border border-white/10 shadow-xl grid grid-cols-2 md:grid-cols-4 gap-5 text-xs font-mono">
          <div>
            <span className="text-zinc-500 block mb-1 uppercase text-[10px]">Resolution</span>
            <span className="text-sm font-bold text-white uppercase">{scene.resolution || "Unknown"}</span>
          </div>
          <div>
            <span className="text-zinc-500 block mb-1 uppercase text-[10px]">Duration</span>
            <span className="text-sm font-bold text-white">{formatTime(durationSec)}</span>
          </div>
          <div>
            <span className="text-zinc-500 block mb-1 uppercase text-[10px]">File Size</span>
            <span className="text-sm font-bold text-white">{formatBytes(scene.size_bytes)}</span>
          </div>
          <div>
            <span className="text-zinc-500 block mb-1 uppercase text-[10px]">Modified Date</span>
            <span className="text-sm font-bold text-white">
              {scene.mtime ? new Date(scene.mtime * 1000).toLocaleDateString() : "N/A"}
            </span>
          </div>
          {scene.file_path && (
            <div className="col-span-full pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-zinc-500 block mb-0.5 text-[10px]">Full Disk Path</span>
                <span className="text-zinc-300 break-all select-all text-xs font-mono">{scene.file_path}</span>
              </div>
              <button
                onClick={onCopyPath}
                className="px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white text-xs cursor-pointer active:scale-95"
              >
                {copiedPath ? "Copied!" : "Copy Path"}
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
