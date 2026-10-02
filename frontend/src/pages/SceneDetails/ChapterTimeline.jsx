import React from "react";
import { formatTime } from "../../utilities/formatters";
import { chapterThumbUrl } from "../../utilities/media";
import { chapterColor } from "../../constants/theme";
import { PerformerChips } from "../../components/PerformerTagPicker";

export default function ChapterTimeline({
  timestamps = [],
  onPlayFromTimestamp,
}) {
  if (!timestamps || timestamps.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono">
        Timeline Markers ({timestamps.length})
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {timestamps.map((t, idx) => {
          const color = chapterColor(t.category, idx);
          const span =
            t.end_seconds != null && t.end_seconds > t.seconds
              ? `${formatTime(t.seconds)} – ${formatTime(t.end_seconds)}`
              : `from ${formatTime(t.seconds)}`;
          return (
            <div
              key={t._id || idx}
              onClick={() => onPlayFromTimestamp(t.seconds)}
              className="group text-left rounded-2xl overflow-hidden bg-zinc-950/70 border border-white/10 hover:border-white/20 transition-all cursor-pointer shadow-sm"
            >
              <div className="relative w-full aspect-video overflow-hidden bg-zinc-900">
                {t._id ? (
                  <img
                    src={chapterThumbUrl(t._id)}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : null}
                <span
                  className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full border border-black/50"
                  style={{ backgroundColor: color }}
                  title={t.category || "main"}
                />
                <span className="absolute bottom-2 right-2 text-[10px] font-mono font-bold text-white bg-black/70 px-1.5 py-0.5 rounded">
                  {span}
                </span>
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="w-10 h-10 rounded-full bg-accent text-zinc-950 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-white truncate group-hover:text-accent transition-colors">
                    {t.label || `Chapter ${idx + 1}`}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-1 flex-wrap">
                    <span>{t.category || "main"}</span>
                    <PerformerChips
                      performers={t.performers}
                      performerIds={t.performer_ids}
                    />
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-zinc-400 bg-white/5 px-2 py-0.5 rounded-md flex-shrink-0">
                  {formatTime(t.seconds)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
