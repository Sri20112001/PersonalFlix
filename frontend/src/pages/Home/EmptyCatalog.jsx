import React from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "../../constants/routes";

export default function EmptyCatalog() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4 bg-zinc-950/40 border border-white/10 rounded-3xl p-8 max-w-2xl mx-auto shadow-2xl">
      <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shadow-[0_0_25px_rgba(245,179,1,0.2)]">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="20" rx="4" />
          <path d="M10 9l5 3-5 3V9z" />
        </svg>
      </div>
      <h3 className="text-2xl font-display uppercase tracking-wider text-white">
        Welcome to PersonalFlix
      </h3>
      <p className="text-zinc-400 text-sm max-w-md leading-relaxed">
        Your personal theater is ready. Scan your video directory or import metadata to begin streaming your collection.
      </p>
      <div className="flex items-center gap-3 mt-3 flex-wrap justify-center">
        <Link
          to={ROUTES.HEALTH}
          className="px-6 py-2.5 rounded-xl bg-accent hover:brightness-110 text-zinc-950 font-bold text-xs uppercase tracking-wider shadow-lg transition-all"
        >
          Scan Library Folder
        </Link>
        <Link
          to={ROUTES.LIBRARY}
          className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider border border-white/10 transition-all"
        >
          Open Library
        </Link>
        <Link
          to={ROUTES.SETTINGS}
          className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider border border-white/10 transition-all"
        >
          Settings
        </Link>
      </div>
    </div>
  );
}
