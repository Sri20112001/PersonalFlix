import React from "react";

export default function QuickNavRibbon({
  activeFilter,
  scrollToSection,
  hasContinue,
  hasRecent,
  hasPerformers,
  hasStudios,
  hasFavorites,
  hasUnwatched,
  hasWatched,
}) {
  const tabs = [
    { id: "all", label: "Overview" },
    ...(hasContinue ? [{ id: "continue", label: "Continue Watching" }] : []),
    ...(hasRecent ? [{ id: "recent", label: "Recently Added" }] : []),
    ...(hasPerformers ? [{ id: "performers", label: "Performers" }] : []),
    ...(hasStudios ? [{ id: "studios", label: "Studios" }] : []),
    ...(hasFavorites ? [{ id: "favorites", label: "Favorites" }] : []),
    ...(hasUnwatched ? [{ id: "unwatched", label: "Unwatched" }] : []),
    ...(hasWatched ? [{ id: "watched", label: "History" }] : []),
  ];

  return (
    <nav
      aria-label="Section Quick Jump"
      className="sticky top-0 z-30 px-8 md:px-14 py-3 bg-[#070708]/90 backdrop-blur-2xl border-b border-white/5 flex items-center gap-2 overflow-x-auto rail-container select-none"
    >
      <span className="text-[11px] font-mono uppercase text-zinc-500 font-bold mr-2 hidden sm:inline">
        Explore:
      </span>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => scrollToSection(tab.id)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide whitespace-nowrap transition-all duration-200 cursor-pointer ${
            activeFilter === tab.id
              ? "bg-accent text-zinc-950 shadow-md shadow-accent/20 scale-105"
              : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/5"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
