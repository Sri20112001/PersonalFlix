import React from "react";
import { Link } from "react-router-dom";
import Rail from "../../components/Rail";
import { ROUTES } from "../../constants/routes";

export default function StudiosRail({ studios }) {
  if (!studios || studios.length === 0) return null;

  return (
    <div id="section-studios">
      <Rail
        title="Top Studios"
        subtitle="Productions in your library"
        count={studios.length}
        actionLink={ROUTES.STUDIOS}
        actionLabel="All Studios"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" />
            <path d="M2 20h20" />
          </svg>
        }
      >
        {studios.map((s) => (
          <Link
            key={s._id}
            to={ROUTES.studio(s._id)}
            className="flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-zinc-900/60 hover:bg-zinc-800/90 border border-white/10 hover:border-accent/40 backdrop-blur-md flex-shrink-0 transition-all duration-300 group/s hover:-translate-y-0.5 shadow-lg min-w-[170px]"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 group-hover/s:border-accent/30">
              {s.logo ? (
                <img
                  src={s.logo}
                  alt={s.name}
                  className="w-full h-full object-contain p-1"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <span className="font-display text-sm text-zinc-400 group-hover/s:text-accent uppercase font-bold">
                  {(s.name || "S").slice(0, 2)}
                </span>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-zinc-200 group-hover/s:text-white truncate">
                {s.name}
              </span>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold group-hover/s:text-accent transition-colors">
                Browse →
              </span>
            </div>
          </Link>
        ))}
      </Rail>
    </div>
  );
}
