import React from "react";
import { Link } from "react-router-dom";
import { performerImage } from "../../utilities/media";
import Rail from "../../components/Rail";
import { ROUTES } from "../../constants/routes";

export default function PerformersRail({ performers }) {
  if (!performers || performers.length === 0) return null;

  return (
    <div id="section-performers">
      <Rail
        title="Featured Performers"
        subtitle="Explore stars in your collection"
        count={performers.length}
        actionLink={ROUTES.PERFORMERS}
        actionLabel="All Performers"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        }
      >
        {performers.map((p) => {
          const img = performerImage(p.image_url);
          return (
            <Link
              key={p._id}
              to={ROUTES.performer(p._id)}
              className="flex flex-col items-center gap-2.5 flex-shrink-0 group/p w-28 text-center"
            >
              <div className="relative w-24 h-24 rounded-full p-0.5 bg-gradient-to-tr from-white/10 to-white/30 group-hover/p:from-accent group-hover/p:to-amber-300 transition-all duration-300 shadow-xl group-hover/p:shadow-accent/30 group-hover/p:scale-105">
                <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900 flex items-center justify-center">
                  {img ? (
                    <img
                      src={img}
                      alt={p.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover/p:scale-110 transition-transform duration-500"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-xl font-display text-zinc-400 group-hover/p:text-accent uppercase">
                      {(p.name || "?").slice(0, 2)}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs font-bold text-zinc-200 group-hover/p:text-white truncate max-w-[105px] tracking-wide">
                {p.name}
              </span>
              {p.scene_count > 0 && (
                <span className="text-[10px] font-mono font-medium text-zinc-500 px-2 py-0.5 rounded-full bg-white/5 border border-white/5 -mt-1">
                  {p.scene_count} {p.scene_count === 1 ? "scene" : "scenes"}
                </span>
              )}
            </Link>
          );
        })}
      </Rail>
    </div>
  );
}
