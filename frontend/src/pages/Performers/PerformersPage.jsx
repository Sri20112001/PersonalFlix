import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/apiClient";
import { ALPHABET_LETTERS } from "../../constants/status";
import Spinner from "../../ui/Spinner";
import { GridIcon, ListIcon, SearchIcon } from "../../utilities/icons";
import { ROUTES } from "../../constants/routes";

import PerformersFilterBar from "./PerformersFilterBar";
import AlphabetNav from "./AlphabetNav";
import PerformerCard from "./PerformerCard";

export default function Performers() {
  const [list, setList] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [sortBy, setSortBy] = useState("alpha-asc");
  const [viewMode, setViewMode] = useState("portrait");
  const [imgErr, setImgErr] = useState({});

  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.performers().catch(() => []),
      api.favorites().catch(() => []),
    ])
      .then(([perfList, favList]) => {
        setList(perfList || []);
        setFavorites(
          (favList || []).filter((f) => f.type === "performer").map((f) => String(f.target_id))
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const isFavorited = (pId) => favorites.includes(String(pId));

  const toggleFavorite = async (e, p) => {
    e.stopPropagation();
    e.preventDefault();
    const pid = String(p._id);
    const wasFav = isFavorited(pid);

    if (wasFav) {
      setFavorites((prev) => prev.filter((id) => id !== pid));
      try {
        await api.removeFavorite("performer", pid);
      } catch (err) {
        console.error("Failed to remove favorite", err);
        setFavorites((prev) => [...prev, pid]);
      }
    } else {
      setFavorites((prev) => [...prev, pid]);
      try {
        await api.addFavorite("performer", pid, p.name || pid);
      } catch (err) {
        console.error("Failed to add favorite", err);
        setFavorites((prev) => prev.filter((id) => id !== pid));
      }
    }
  };

  const filteredList = useMemo(() => {
    let result = [...list];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((p) => (p.name || "").toLowerCase().includes(q));
    }

    if (genderFilter !== "all") {
      result = result.filter(
        (p) => (p.gender || "").toLowerCase() === genderFilter.toLowerCase()
      );
    }

    if (favOnly) {
      result = result.filter((p) => isFavorited(p._id));
    }

    result.sort((a, b) => {
      if (sortBy === "alpha-asc") {
        return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
      }
      if (sortBy === "alpha-desc") {
        return (b.name || "").localeCompare(a.name || "", undefined, { sensitivity: "base" });
      }
      if (sortBy === "scenes-desc") {
        return (b.scene_count || 0) - (a.scene_count || 0);
      }
      if (sortBy === "views-desc") {
        const aViews = typeof a.views === "number" ? a.views : parseInt(a.views, 10) || 0;
        const bViews = typeof b.views === "number" ? b.views : parseInt(b.views, 10) || 0;
        return bViews - aViews;
      }
      return 0;
    });

    return result;
  }, [list, search, genderFilter, favOnly, sortBy, favorites]);

  const isAlphabetical = sortBy === "alpha-asc" && !search.trim();

  const groups = useMemo(() => {
    if (!isAlphabetical) return null;
    const g = {};
    for (const p of filteredList) {
      const first = (p.name || "?")[0].toUpperCase();
      const key = ALPHABET_LETTERS.includes(first) ? first : "#";
      (g[key] = g[key] || []).push(p);
    }
    return g;
  }, [filteredList, isAlphabetical]);

  const totalScenes = useMemo(() => {
    return list.reduce((acc, p) => acc + (p.scene_count || 0), 0);
  }, [list]);

  const scrollToLetter = (l) => {
    const el = document.getElementById(`letter-section-${l}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#070708] pt-20 px-8 select-none">
      {/* Header & Metrics */}
      <div className="flex flex-col gap-4 mb-5 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display uppercase tracking-[0.2em] text-2xl font-black text-white">
              Performers
            </h1>
            <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1 font-mono">
              <span>{list.length} performers</span>
              <span className="text-zinc-600">Â·</span>
              <span>{totalScenes} scenes</span>
              <span className="text-zinc-600">Â·</span>
              <span className="text-accent font-semibold">{favorites.length} favorites</span>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-xl p-1 gap-1 shadow-lg">
            <button
              onClick={() => setViewMode("portrait")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === "portrait"
                  ? "bg-accent text-zinc-950 font-black shadow-md shadow-accent/20"
                  : "text-zinc-400 hover:text-white"
              }`}
              title="Portrait Grid View"
            >
              <GridIcon size={13} strokeWidth={2.5} />
              <span>Portrait</span>
            </button>
            <button
              onClick={() => setViewMode("compact")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === "compact"
                  ? "bg-accent text-zinc-950 font-black shadow-md shadow-accent/20"
                  : "text-zinc-400 hover:text-white"
              }`}
              title="Compact List View"
            >
              <ListIcon size={13} strokeWidth={2.5} />
              <span>Compact</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <PerformersFilterBar
          search={search}
          onSearchChange={setSearch}
          favOnly={favOnly}
          onToggleFavOnly={setFavOnly}
          genderFilter={genderFilter}
          onGenderChange={setGenderFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Aâ€“Z Sticky Quick Jump Bar */}
        {isAlphabetical && (
          <AlphabetNav
            groups={groups}
            onScrollToLetter={scrollToLetter}
          />
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar pb-10">
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <Spinner />
          </div>
        ) : filteredList.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500 shadow-xl">
              <SearchIcon size={22} strokeWidth={2} />
            </div>
            <div className="text-white font-semibold text-sm">No performers found</div>
            <p className="text-zinc-500 text-xs">Try adjusting your search query or filters.</p>
            {(search || genderFilter !== "all" || favOnly) && (
              <button
                onClick={() => {
                  setSearch("");
                  setGenderFilter("all");
                  setFavOnly(false);
                }}
                className="mt-2 bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-white text-xs px-4 py-2 rounded-xl font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : isAlphabetical ? (
          <div className="flex flex-col gap-8">
            {ALPHABET_LETTERS.map((l) => {
              const items = groups ? groups[l] || [] : [];
              if (!items.length) return null;
              return (
                <div key={l} id={`letter-section-${l}`} className="scroll-mt-6">
                  <div className="flex items-center gap-3 mb-3.5">
                    <div className="w-6 h-6 rounded-md bg-accent/10 border border-accent/30 flex items-center justify-center text-accent text-xs font-black font-mono">
                      {l}
                    </div>
                    <span className="text-xs text-zinc-500 font-mono">({items.length})</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  <div
                    className={
                      viewMode === "portrait"
                        ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                        : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
                    }
                  >
                    {items.map((p) => (
                      <PerformerCard
                        key={p._id}
                        p={p}
                        mode={viewMode}
                        imgErr={imgErr[p._id]}
                        onImgErr={() => setImgErr((s) => ({ ...s, [p._id]: true }))}
                        isFav={isFavorited(p._id)}
                        onToggleFav={(e) => toggleFavorite(e, p)}
                        onClick={() => navigate(ROUTES.performer(p._id))}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <div className="text-xs text-zinc-500 mb-3 font-mono">
              Showing {filteredList.length} performers
            </div>
            <div
              className={
                viewMode === "portrait"
                  ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                  : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
              }
            >
              {filteredList.map((p) => (
                <PerformerCard
                  key={p._id}
                  p={p}
                  mode={viewMode}
                  imgErr={imgErr[p._id]}
                  onImgErr={() => setImgErr((s) => ({ ...s, [p._id]: true }))}
                  isFav={isFavorited(p._id)}
                  onToggleFav={(e) => toggleFavorite(e, p)}
                  onClick={() => navigate(ROUTES.performer(p._id))}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
