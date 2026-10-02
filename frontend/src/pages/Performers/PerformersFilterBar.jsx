import React from "react";

export default function PerformersFilterBar({
  search = "",
  onSearchChange,
  favOnly = false,
  onToggleFavOnly,
  genderFilter = "all",
  onGenderChange,
  sortBy = "alpha-asc",
  onSortChange,
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap bg-zinc-950/70 backdrop-blur-xl p-3 rounded-2xl border border-white/10 shadow-xl">
      {/* Search Box */}
      <div className="relative flex-1 min-w-[240px]">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search performers by name..."
          className="w-full bg-zinc-900/90 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-accent/80 focus:ring-1 focus:ring-accent/50 transition-all"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {/* Favorites Filter Tab */}
      <div className="flex items-center bg-zinc-900/90 border border-white/10 rounded-xl p-1">
        <button
          onClick={() => onToggleFavOnly(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            !favOnly ? "bg-white/10 text-white shadow-sm" : "text-zinc-400 hover:text-white"
          }`}
        >
          All
        </button>
        <button
          onClick={() => onToggleFavOnly(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            favOnly
              ? "bg-accent text-zinc-950 font-black shadow-md shadow-accent/20"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill={favOnly ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
          <span>Favorites</span>
        </button>
      </div>

      {/* Gender Filter */}
      <select
        value={genderFilter}
        onChange={(e) => onGenderChange(e.target.value)}
        className="bg-zinc-900/90 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-accent/80 cursor-pointer shadow-inner"
      >
        <option value="all">All Genders</option>
        <option value="female">Female</option>
        <option value="male">Male</option>
        <option value="transgender">Transgender</option>
      </select>

      {/* Sort Selector */}
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value)}
        className="bg-zinc-900/90 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-accent/80 cursor-pointer shadow-inner"
      >
        <option value="alpha-asc">Sort: Name (A–Z)</option>
        <option value="alpha-desc">Sort: Name (Z–A)</option>
        <option value="scenes-desc">Sort: Most Scenes</option>
        <option value="views-desc">Sort: Most Views</option>
      </select>
    </div>
  );
}
