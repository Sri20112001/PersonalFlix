import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/apiClient";
import VideoCard from "../../components/VideoCard";
import Spinner from "../../ui/Spinner";
import { CheckIcon } from "../../utilities/icons";
import { useNavQueueStore } from "../../stores/navQueueStore";

import LibraryHeader from "./LibraryHeader";
import FilterDrawer from "./FilterDrawer";
import BulkActionBar from "./BulkActionBar";
import PaginationBar from "./PaginationBar";
import SceneListItem from "./SceneListItem";
import { ROUTES } from "../../constants/routes";

const PAGE_SIZE = 48;

export default function Library() {
  const [tab, setTab] = useState("");
  const [sort, setSort] = useState(() => {
    return localStorage.getItem("pfx-library-sort") || "recent";
  });
  const [mode, setMode] = useState("grid");
  const [scenes, setScenes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [startPage, setStartPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState(0);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState([]);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  // Favorites-only view (server-side ?fav=1 filter, orthogonal to tabs/sort/search)
  const [favOnly, setFavOnly] = useState(false);
  const [autoScroll, setAutoScroll] = useState(() => {
    return localStorage.getItem("pfx-library-autoscroll") !== "false";
  });
  const [jumpInput, setJumpInput] = useState("");
  const [showBackToTop, setShowBackToTop] = useState(false);

  // User metadata (watch status & favorites) for visual card differentiation
  const [trackingMap, setTrackingMap] = useState(new Map());
  const [favSet, setFavSet] = useState(new Set());

  // Multi-Select Bulk Operations
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkToast, setBulkToast] = useState(null);
  const [playlistsList, setPlaylistsList] = useState([]);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);

  // Metadata for filter dropdowns
  const [studios, setStudios] = useState([]);
  const [performers, setPerformers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState({ total: 0, studios: 0, watched: 0 });

  const gridRef = useRef(null);
  const sentinelRef = useRef(null);
  const navigate = useNavigate();
  const query = q.trim();
  const isSearch = query.length > 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleSelectScene = (id, e) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const strId = String(id);
      if (next.has(strId)) next.delete(strId);
      else next.add(strId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(scenes.map((s) => String(s._id))));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkStatus = async (newStatus) => {
    if (selectedIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          api.setTracking(parseInt(id, 10), { status: newStatus, currentTime: 0 })
        )
      );
      setBulkToast(`Updated ${selectedIds.size} scenes to ${newStatus}`);
      setTimeout(() => setBulkToast(null), 3000);
      clearSelection();
      refreshUserMeta();
    } catch (e) {
      console.error("Bulk status error:", e);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkAddToPlaylist = async (playlistId) => {    if (selectedIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          api.addToPlaylist(playlistId, parseInt(id, 10))
        )
      );
      setShowPlaylistPicker(false);
      setBulkToast(`Added ${selectedIds.size} scenes to playlist`);
      setTimeout(() => setBulkToast(null), 3000);
      clearSelection();
    } catch (e) {
      console.error("Bulk playlist error:", e);
    } finally {
      setBulkBusy(false);
    }
  };

  // Batch Whisper captions: one POST queues the whole selection server-side
  // (sequential worker). Poll batch progress and report the tally on done.
  const batchPoll = useRef(null);
  useEffect(() => () => batchPoll.current && clearInterval(batchPoll.current), []);

  const handleBulkCaptions = async (force = false) => {
    if (selectedIds.size === 0 || bulkBusy) return;
    if (
      force &&
      !window.confirm(
        `Re-generate captions for ${selectedIds.size} scenes? Existing transcripts will be replaced.`
      )
    )
      return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds).map((id) => parseInt(id, 10));
      const res = await api.transcribeBatch(ids, force);
      if (res?.error) {
        setBulkToast(`Captions batch failed: ${res.error}`);
        setTimeout(() => setBulkToast(null), 4000);
        setBulkBusy(false);
        return;
      }
      const total = res?.batch?.total || ids.length;
      setBulkToast(
        res?.dedup ? "Captions batch already running…" : `Captioning ${total} scenes… (0/${total})`
      );
      if (batchPoll.current) clearInterval(batchPoll.current);
      batchPoll.current = setInterval(async () => {
        try {
          const st = await api.transcribeBatchStatus();
          if (!st || st.state === "idle" || st.state === "queued") return;
          if (st.state === "done" || st.state === "error" || st.state === "cancelled") {
            clearInterval(batchPoll.current);
            setBulkToast(
              st.state === "done"
                ? `Captions done: ${st.succeeded ?? 0} ok, ${st.skipped ?? 0} skipped, ${st.failed ?? 0} failed`
                : `Captions batch ${st.state}: ${st.message || "unknown"}`
            );
            setTimeout(() => setBulkToast(null), 6000);
            setBulkBusy(false);
            clearSelection();
          } else {
            setBulkToast(`Captioning… (${st.done ?? 0}/${st.total ?? total})`);
          }
        } catch (e) {
          clearInterval(batchPoll.current);
          setBulkBusy(false);
        }
      }, 5000);
    } catch (e) {
      console.error("Bulk captions error:", e);
      setBulkToast("Captions batch request failed");
      setTimeout(() => setBulkToast(null), 4000);
      setBulkBusy(false);
    }
  };

  const handleSortChange = (newSort) => {
    setSort(newSort);
    localStorage.setItem("pfx-library-sort", newSort);
  };

  const refreshUserMeta = async () => {
    try {
      const [trackData, favData] = await Promise.all([
        api.tracking().catch(() => []),
        api.favorites("scene").catch(() => []),
      ]);
      const tMap = new Map();
      (Array.isArray(trackData) ? trackData : []).forEach((t) => {
        tMap.set(String(t.scene_id || t._id), t);
      });
      setTrackingMap(tMap);

      const fSet = new Set(
        (Array.isArray(favData) ? favData : []).map((f) => String(f.target_id))
      );
      setFavSet(fSet);
    } catch (err) {
      console.error("Library metadata error:", err);
    }
  };

  // Load initial dropdown metadata & stats & user metadata
  useEffect(() => {
    refreshUserMeta();
    const onWindowFocus = () => refreshUserMeta();
    window.addEventListener("focus", onWindowFocus);

    Promise.all([
      api.studios().catch(() => []),
      api.performers({ limit: 100 }).catch(() => ({ performers: [] })),
      api.categories().catch(() => []),
      api.scenes({ status: "watched", limit: 1 }).catch(() => ({ total: 0 })),
    ]).then(([st, pe, ca, wa]) => {
      const studioList = Array.isArray(st) ? st : [];
      setStudios(studioList);
      setPerformers(pe.performers || (Array.isArray(pe) ? pe : []));
      setCategories(Array.isArray(ca) ? ca : []);
      setStats((prev) => ({
        ...prev,
        studios: studioList.length,
        watched: wa.total || 0,
      }));
    });

    return () => window.removeEventListener("focus", onWindowFocus);
  }, []);

  const load = async (t, p, s = sort, append = false, fav = favOnly) => {
    setLoading(true);
    try {
      const params = { page: p, limit: PAGE_SIZE, sort: s };
      if (t) params.status = t;
      if (fav) params.fav = 1;
      const res = await api.scenes(params);
      setScenes((prev) => (append ? [...prev, ...res.scenes] : res.scenes));
      setTotal(res.total);
      setPage(p);
      if (!append) setStartPage(p);
      if (p === 1 && !t && s === "recent") {
        setStats((prev) => ({ ...prev, total: res.total }));
      }
    } catch (e) {
      console.error("scenes load error", e);
    } finally {
      setLoading(false);
    }
  };

  const runSearch = async (text, p, append = false, fav = favOnly) => {
    setLoading(true);
    try {
      const res = await api.search(text, p, PAGE_SIZE, fav);
      setScenes((prev) =>
        append ? [...prev, ...(res.scenes || [])] : res.scenes || [],
      );
      setTotal(res.total || 0);
      setPage(p);
      if (!append) setStartPage(p);
      if (!append) setFilters(res.filters || []);
    } catch (e) {
      console.error("search error", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (loading || scenes.length >= total) return;
    const nextPage = page + 1;
    if (isSearch) {
      runSearch(query, nextPage, true);
    } else {
      load(tab, nextPage, sort, true);
    }
  };

  const goToPage = (p) => {
    const target = Math.max(1, Math.min(totalPages, p));
    if (isSearch) {
      runSearch(query, target, false);
    } else {
      load(tab, target, sort, false);
    }
    if (gridRef.current) {
      gridRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleJumpSubmit = (e) => {
    e.preventDefault();
    const val = parseInt(jumpInput, 10);
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      goToPage(val);
      setJumpInput("");
    }
  };

  const scrollToTop = () => {
    if (gridRef.current) {
      gridRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleToggleAutoScroll = (enabled) => {
    setAutoScroll(enabled);
    localStorage.setItem("pfx-library-autoscroll", String(enabled));
  };

  // Scroll listener for Back to Top visibility
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onScroll = () => {
      setShowBackToTop(el.scrollTop > 400);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // IntersectionObserver for Infinite Scroll Sentinel
  useEffect(() => {
    if (!autoScroll || loading || scenes.length >= total) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && scenes.length < total) {
          loadMore();
        }
      },
      { root: gridRef.current, rootMargin: "300px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [autoScroll, loading, scenes.length, total, page, isSearch, query, tab, sort]);

  // Persist current scene list so Scene Player can navigate Next/Prev seamlessly
  useEffect(() => {
    if (scenes && scenes.length > 0) {
      try {
        sessionStorage.setItem("pfx-nav-scenes", JSON.stringify(scenes.map((s) => s._id)));
        useNavQueueStore.getState().setQueue(scenes.map((s) => s._id));
      } catch (e) {}
    }
  }, [scenes]);

  // Refetch when tab, search, or sort changes
  useEffect(() => {
    setScenes([]);
    setFocus(0);
    setStartPage(1);
    if (isSearch) {
      const t = setTimeout(() => runSearch(query, 1, false), 250);
      return () => clearTimeout(t);
    }
    setFilters([]);
    load(tab, 1, sort, false);
  }, [tab, q, sort, favOnly]);

  const addFilterToken = (field, value) => {
    if (!value) return;
    const cleanVal = String(value).trim();
    const token = cleanVal.includes(" ")
      ? `${field}:"${cleanVal}"`
      : `${field}:${cleanVal}`;
    if (q.includes(`${field}:`)) {
      removeFilter(field);
    }
    setQ((prev) => `${prev.trim()} ${token}`.trim());
  };

  const removeFilter = (field, value) => {
    let next = q;
    if (value) {
      const plain = `${field}:${value}`;
      const quoted = `${field}:"${value}"`;
      next = next.replace(quoted, "").replace(plain, "");
    } else {
      const regex = new RegExp(`${field}:("[^"]+"|[\\S]+)`, "gi");
      next = next.replace(regex, "");
    }
    setQ(next.replace(/\s{2,}/g, " ").trim());
  };

  const clearAllFilters = () => {
    setQ("");
    setTab("");
    setFavOnly(false);
    handleSortChange("recent");
  };

  const handleSurpriseMe = async () => {
    try {
      const res = await api.randomScene();
      const s = res.scene || res;
      if (s && s._id) {
        navigate(ROUTES.scene(s._id), { replace: true });
      }
    } catch (err) {
      console.error("Surprise Me failed:", err);
    }
  };

  const handleSaveCollection = async () => {
    const name = window.prompt("Name this collection:", query);
    if (name && name.trim()) {
      try {
        await api.createCollection(name.trim(), query);
        navigate(ROUTES.COLLECTIONS);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Dynamically calculate actual rendered columns based on container width
  const getColumnCount = () => {
    if (!gridRef.current || mode !== "grid") return 1;
    const cardEl = gridRef.current.querySelector("[data-idx]");
    if (!cardEl) return 4;
    const containerW = gridRef.current.clientWidth;
    const cardW = cardEl.offsetWidth || 240;
    return Math.max(1, Math.round(containerW / (cardW + 16)));
  };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.target &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.tagName === "SELECT")
      ) {
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        handleSurpriseMe();
        return;
      }
      const cols = getColumnCount();
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setFocus((f) => Math.min(f + 1, scenes.length - 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setFocus((f) => Math.max(f - 1, 0));
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocus((f) => Math.min(f + cols, scenes.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocus((f) => Math.max(f - cols, 0));
          break;
        case "Home":
          e.preventDefault();
          setFocus(0);
          break;
        case "End":
          e.preventDefault();
          setFocus(Math.max(0, scenes.length - 1));
          break;
        case "PageDown":
          e.preventDefault();
          setFocus((f) => Math.min(f + cols * 3, scenes.length - 1));
          break;
        case "PageUp":
          e.preventDefault();
          setFocus((f) => Math.max(f - cols * 3, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (scenes[focus]) {
            navigate(ROUTES.scene(scenes[focus]._id), {
              state: { sceneList: scenes.map((x) => x._id) },
              replace: true,
            });
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenes, focus, mode, navigate]);

  // Keep focused item scrolled into view
  useEffect(() => {
    const el = gridRef.current?.querySelector(`[data-idx="${focus}"]`);
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [focus]);

  return (
    <div className="h-full flex flex-col bg-background p-8 overflow-hidden select-none">
      <LibraryHeader
        total={total}
        stats={stats}
        onSurpriseMe={handleSurpriseMe}
        query={q}
        onQueryChange={setQ}
        isSearch={isSearch}
        onClearQuery={() => setQ("")}
        onSaveCollection={handleSaveCollection}
        filters={filters}
        onRemoveFilter={removeFilter}
        tab={tab}
        onTabChange={setTab}
        favOnly={favOnly}
        onToggleFavOnly={() => setFavOnly((v) => !v)}
        filterDrawerOpen={filterDrawerOpen}
        onToggleFilterDrawer={() => setFilterDrawerOpen((o) => !o)}
        sort={sort}
        onSortChange={handleSortChange}
        autoScroll={autoScroll}
        onToggleAutoScroll={handleToggleAutoScroll}
        mode={mode}
        onModeChange={setMode}
        selectMode={selectMode}
        onToggleSelectMode={() => {
          setSelectMode((v) => {
            const next = !v;
            if (!next) clearSelection();
            else {
              api.playlists().then(setPlaylistsList).catch(() => {});
            }
            return next;
          });
        }}
      />

      <FilterDrawer
        open={filterDrawerOpen}
        studios={studios}
        performers={performers}
        categories={categories}
        currentQuery={q}
        onAddFilterToken={addFilterToken}
        onRemoveFilter={removeFilter}
        onClearAll={clearAllFilters}
      />

      {/* Main Grid / List Content */}
      <div
        ref={gridRef}
        className="flex-1 overflow-y-auto overflow-x-hidden pr-2"
      >
        {mode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {scenes.map((s, i) => {
              const tInfo = trackingMap.get(String(s._id));
              const isFav = favSet.has(String(s._id));
              const effectiveStatus = tInfo?.status || (tInfo?.currentTime > 0 ? "watching" : "unwatched");
              const effectiveProg = tInfo?.duration > 0 ? (tInfo.currentTime / tInfo.duration) * 100 : s.progress;

              return (
                <React.Fragment key={s._id}>
                  {i > 0 && i % PAGE_SIZE === 0 && (
                    <div className="col-span-full my-6 flex items-center gap-4 select-none">
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-white/5" />
                      <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-zinc-900/90 border border-white/15 backdrop-blur-md shadow-lg text-xs font-mono">
                        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                        <span className="font-bold text-white uppercase tracking-wider">
                          Page {startPage + Math.floor(i / PAGE_SIZE)}
                        </span>
                        <span className="text-zinc-500">of</span>
                        <span className="text-zinc-400 font-bold">{totalPages}</span>
                        <span className="text-zinc-600">Ã‚Â·</span>
                        <span className="text-zinc-400 text-[11px]">
                          Scenes {(startPage + Math.floor(i / PAGE_SIZE) - 1) * PAGE_SIZE + 1}Ã¢â‚¬â€œ
                          {Math.min(total, (startPage + Math.floor(i / PAGE_SIZE)) * PAGE_SIZE)}
                        </span>
                      </div>
                      <div className="flex-1 h-px bg-gradient-to-r from-white/5 via-white/15 to-transparent" />
                    </div>
                  )}
                  <div
                    data-idx={i}
                    onClick={(e) => {
                      if (selectMode) {
                        toggleSelectScene(s._id, e);
                      } else {
                        navigate(ROUTES.scene(s._id), {
                          state: { sceneList: scenes.map((x) => x._id) },
                          replace: true,
                        });
                      }
                    }}
                    onMouseEnter={() => setFocus(i)}
                    className={`cursor-pointer relative transition-transform ${
                      selectMode && selectedIds.has(String(s._id))
                        ? "ring-2 ring-accent rounded-xl scale-[0.98]"
                        : ""
                    }`}
                  >
                    <VideoCard
                      scene={s}
                      focused={focus === i}
                      status={effectiveStatus}
                      isFavorite={isFav}
                      progress={effectiveProg}
                      showProgress={effectiveStatus === "watching" || (effectiveProg > 0 && effectiveProg < 95)}
                    />
                    {selectMode && (
                      <button
                        type="button"
                        onClick={(e) => toggleSelectScene(s._id, e)}
                        className={`absolute top-2 left-2 z-30 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg cursor-pointer ${
                          selectedIds.has(String(s._id))
                            ? "bg-accent text-zinc-950 scale-110 ring-2 ring-zinc-950"
                            : "bg-black/60 border border-white/40 text-white/50 hover:border-white hover:text-white"
                        }`}
                        title={selectedIds.has(String(s._id)) ? "Deselect" : "Select"}
                      >
                        {selectedIds.has(String(s._id)) ? (
                          <CheckIcon size={15} strokeWidth={3.5} />
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-white/30" />
                        )}
                      </button>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2 pb-6">
            {scenes.map((s, i) => {
              const isFocused = focus === i;
              const tInfo = trackingMap.get(String(s._id));
              const isFav = favSet.has(String(s._id));
              const effectiveStatus = tInfo?.status || (tInfo?.currentTime > 0 ? "watching" : "unwatched");
              const effectiveProg = tInfo?.duration > 0 ? (tInfo.currentTime / tInfo.duration) * 100 : s.progress;

              return (
                <React.Fragment key={s._id}>
                  {i > 0 && i % PAGE_SIZE === 0 && (
                    <div className="w-full my-6 flex items-center gap-4 select-none">
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-white/5" />
                      <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-zinc-900/90 border border-white/15 backdrop-blur-md shadow-lg text-xs font-mono">
                        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                        <span className="font-bold text-white uppercase tracking-wider">
                          Page {startPage + Math.floor(i / PAGE_SIZE)}
                        </span>
                        <span className="text-zinc-500">of</span>
                        <span className="text-zinc-400 font-bold">{totalPages}</span>
                        <span className="text-zinc-600">Ã‚Â·</span>
                        <span className="text-zinc-400 text-[11px]">
                          Scenes {(startPage + Math.floor(i / PAGE_SIZE) - 1) * PAGE_SIZE + 1}Ã¢â‚¬â€œ
                          {Math.min(total, (startPage + Math.floor(i / PAGE_SIZE)) * PAGE_SIZE)}
                        </span>
                      </div>
                      <div className="flex-1 h-px bg-gradient-to-r from-white/5 via-white/15 to-transparent" />
                    </div>
                  )}
                  <SceneListItem
                    scene={s}
                    index={i}
                    isFocused={isFocused}
                    onFocus={() => setFocus(i)}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(String(s._id))}
                    onToggleSelect={toggleSelectScene}
                    onOpen={(sceneId) => {
                      navigate(ROUTES.scene(sceneId), {
                        state: { sceneList: scenes.map((x) => x._id) },
                        replace: true,
                      });
                    }}
                    effectiveStatus={effectiveStatus}
                    effectiveProg={effectiveProg}
                    isFav={isFav}
                  />
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Loading Spinner for initial load */}
        {loading && scenes.length === 0 && (
          <div className="h-64 flex items-center justify-center">
            <Spinner />
          </div>
        )}

        {/* Empty State */}
        {!loading && scenes.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-textMuted">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <div className="text-sm font-bold uppercase tracking-wider text-white">
              No Scenes Found
            </div>
            <p className="text-xs text-textSecondary max-w-sm">
              {isSearch
                ? `No videos match "${q}". Try clearing filters or using broader search terms.`
                : favOnly
                  ? "No favorites yet. Open a scene and hit the heart to pin it here."
                  : tab
                    ? `No videos marked as "${tab}".`
                    : "No video files found in your media library."}
            </p>
            {(isSearch || tab || favOnly) && (
              <button
                onClick={clearAllFilters}
                className="mt-2 bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow-md"
              >
                Clear All Filters
              </button>
            )}
          </div>
        )}

        {/* Infinite Scroll Sentinel */}
        {autoScroll && scenes.length < total && (
          <div ref={sentinelRef} className="h-12 w-full flex items-center justify-center my-4 select-none">
            {loading && (
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-zinc-900/80 border border-white/10 text-xs text-zinc-300 font-mono shadow-md animate-pulse">
                <Spinner size="sm" />
                <span>Loading more scenes...</span>
              </div>
            )}
          </div>
        )}

        {/* Pagination & Action Dock */}
        <PaginationBar
          total={total}
          page={page}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          loading={loading}
          autoScroll={autoScroll}
          scenesCount={scenes.length}
          jumpInput={jumpInput}
          setJumpInput={setJumpInput}
          onJumpSubmit={handleJumpSubmit}
          onGoToPage={goToPage}
          onScrollToTop={scrollToTop}
        />
      </div>

      {/* Floating Back to Top Action Button (Scroll Mode only) */}
      {showBackToTop && autoScroll && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-14 right-8 z-40 flex items-center gap-2 bg-zinc-900/90 hover:bg-zinc-800 border border-white/15 text-zinc-200 hover:text-white px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer text-xs font-bold uppercase tracking-wider group animate-fade-in"
          title="Scroll back to top"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="transition-transform group-hover:-translate-y-0.5 text-accent"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
          <span>Top</span>
          <span className="text-[10px] text-zinc-500 font-mono font-normal">
            (P. {page})
          </span>
        </button>
      )}

      {/* Floating Batch Action Dock */}
      <BulkActionBar
        selectMode={selectMode}
        selectedIds={selectedIds}
        scenesCount={scenes.length}
        bulkBusy={bulkBusy}
        onSelectAll={selectAllVisible}
        onClearSelection={clearSelection}
        onBulkStatus={handleBulkStatus}
        onBulkAddToPlaylist={handleBulkAddToPlaylist}
        onBulkCaptions={handleBulkCaptions}
        playlistsList={playlistsList}
        showPlaylistPicker={showPlaylistPicker}
        setShowPlaylistPicker={setShowPlaylistPicker}
        onCloseSelectMode={() => {
          setSelectMode(false);
          clearSelection();
        }}
        bulkToast={bulkToast}
      />
    </div>
  );
}
