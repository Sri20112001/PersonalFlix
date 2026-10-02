import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "../../components/Spinner";
import VideoCard from "../../components/VideoCard";
import { PortraitCard } from "../Performers/PerformerCard";
import {
  HeartIcon,
  SearchIcon,
  ShuffleIcon,
  CloseIcon,
} from "../../utilities/icons";
import { useFavorites } from "../../hooks/useFavorites";
import { ROUTES } from "../../constants/routes";

const TABS = [
  { id: "all", label: "All" },
  { id: "scene", label: "Scenes" },
  { id: "performer", label: "Performers" },
];

function SectionHeader({ label, count }) {
  return (
    <div className="flex items-center gap-3 mb-3.5">
      <div className="px-2.5 py-1 rounded-md bg-accent/10 border border-accent/30 text-accent text-xs font-black font-mono uppercase tracking-widest">
        {label}
      </div>
      <span className="text-xs text-zinc-500 font-mono">({count})</span>
      <div className="flex-1 h-px bg-white/10" />
    </div>
  );
}

export default function FavoritesPage() {
  const {
    favorites,
    scenes,
    performers,
    sceneDetails,
    performerDetails,
    loading,
    remove,
  } = useFavorites();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [imgErr, setImgErr] = useState({});

  const q = search.trim().toLowerCase();
  const matches = (name) =>
    !q || (name || "").toLowerCase().includes(q);

  const filteredScenes = useMemo(
    () =>
      scenes.filter((f) => {
        const full =
          sceneDetails[String(f.target_id)] || {};
        return (
          matches(f.target_name) ||
          matches(full.title) ||
          matches(full.file_name) ||
          matches(full.studio)
        );
      }),
    [scenes, sceneDetails, q]
  );

  const filteredPerformers = useMemo(
    () => performers.filter((f) => matches(f.target_name)),
    [performers, q]
  );

  const showScenes = activeTab === "all" || activeTab === "scene";
  const showPerformers = activeTab === "all" || activeTab === "performer";
  const hasResults =
    (showScenes && filteredScenes.length > 0) ||
    (showPerformers && filteredPerformers.length > 0);

  const playRandomFavoriteScene = () => {
    const pool = filteredScenes.length > 0 ? filteredScenes : scenes;
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) navigate(ROUTES.scene(pick.target_id));
  };

  return (
    <div className="h-full flex flex-col bg-[#070708] pt-20 px-8 select-none">
      {/* Header & metrics */}
      <div className="flex flex-col gap-4 mb-5 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display uppercase tracking-[0.2em] text-2xl font-black text-white flex items-center gap-3">
              Favorites
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-300 font-sans font-bold normal-case tracking-normal flex items-center gap-1.5">
                <HeartIcon size={11} fill="currentColor" strokeWidth={0} />
                Your collection
              </span>
            </h1>
            <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1 font-mono">
              <span>{favorites.length} total</span>
              <span className="text-zinc-600">·</span>
              <span>{scenes.length} scenes</span>
              <span className="text-zinc-600">·</span>
              <span>{performers.length} performers</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {scenes.length > 0 && (
              <button
                onClick={playRandomFavoriteScene}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface hover:bg-surfaceHover border border-white/10 hover:border-accent/50 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:text-white transition-all cursor-pointer"
                title="Play a random favorite scene"
              >
                <ShuffleIcon size={13} strokeWidth={2.5} />
                <span>Random</span>
              </button>
            )}
            {/* Tab switcher */}
            <div className="flex items-center bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-xl p-1 gap-1 shadow-lg">
              {TABS.map((t) => {
                const count =
                  t.id === "all"
                    ? favorites.length
                    : t.id === "scene"
                    ? scenes.length
                    : performers.length;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeTab === t.id
                        ? "bg-accent text-zinc-950 font-black shadow-md shadow-accent/20"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <span>{t.label}</span>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                        activeTab === t.id
                          ? "bg-black/20 text-zinc-900"
                          : "bg-black/40 text-zinc-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Search */}
        {favorites.length > 0 && (
          <div className="relative max-w-md">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
              <SearchIcon size={15} strokeWidth={2} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your favorites..."
              className="w-full bg-surface border border-white/10 rounded-xl pl-10 pr-9 py-2.5 text-sm outline-none focus:border-accent placeholder:text-textMuted"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                title="Clear search"
              >
                <CloseIcon size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar pb-10">
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <Spinner />
          </div>
        ) : favorites.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-xl">
              <HeartIcon size={24} fill="none" strokeWidth={2} />
            </div>
            <div className="text-white font-semibold text-sm">
              No favorites yet
            </div>
            <p className="text-zinc-500 text-xs max-w-sm">
              Open a scene and hit the heart, or favorite a performer to
              build your collection here.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => navigate(ROUTES.LIBRARY)}
                className="bg-accent hover:bg-[#FFC52F] text-zinc-950 text-xs px-4 py-2 rounded-xl font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95"
              >
                Browse Library
              </button>
              <button
                onClick={() => navigate(ROUTES.PERFORMERS)}
                className="bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-white text-xs px-4 py-2 rounded-xl font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95"
              >
                Browse Performers
              </button>
            </div>
          </div>
        ) : !hasResults ? (
          <div className="h-64 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500 shadow-xl">
              <SearchIcon size={22} strokeWidth={2} />
            </div>
            <div className="text-white font-semibold text-sm">
              Nothing matches “{search.trim()}”
            </div>
            <p className="text-zinc-500 text-xs">
              Try a different search or switch tabs.
            </p>
            <button
              onClick={() => {
                setSearch("");
                setActiveTab("all");
              }}
              className="mt-2 bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-white text-xs px-4 py-2 rounded-xl font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {showScenes && filteredScenes.length > 0 && (
              <section>
                <SectionHeader label="Scenes" count={filteredScenes.length} />
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(450px, 1fr))",
                  }}
                >
                  {filteredScenes.map((f) => {
                    const fullScene = sceneDetails[
                      String(f.target_id)
                    ] || {
                      _id: f.target_id,
                      title: f.target_name,
                    };
                    return (
                      <div key={f._id} className="relative group">
                        <VideoCard
                          scene={fullScene}
                          isFavorite={true}
                        />
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            remove(f);
                          }}
                          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-all cursor-pointer active:scale-90 z-20 bg-accent text-zinc-950 border-accent shadow-lg shadow-accent/30 opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Remove from favorites"
                        >
                          <HeartIcon
                            size={13}
                            fill="currentColor"
                            strokeWidth={0}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {showPerformers && filteredPerformers.length > 0 && (
              <section>
                <SectionHeader
                  label="Performers"
                  count={filteredPerformers.length}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {filteredPerformers.map((f) => {
                    const pid = String(f.target_id);
                    const full = performerDetails[pid] || {
                      _id: f.target_id,
                      name: f.target_name,
                    };
                    return (
                      <PortraitCard
                        key={f._id}
                        p={{
                          ...full,
                          _id: full._id ?? f.target_id,
                          name: full.name || f.target_name,
                        }}
                        imgErr={imgErr[pid]}
                        onImgErr={() =>
                          setImgErr((s) => ({ ...s, [pid]: true }))
                        }
                        isFav={true}
                        onToggleFav={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          remove(f);
                        }}
                        onClick={() =>
                          navigate(ROUTES.performer(f.target_id))
                        }
                      />
                    );
                  })}
                </div>
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
