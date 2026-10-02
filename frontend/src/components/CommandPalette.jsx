import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/apiClient";
import { thumbUrl } from "../utilities/media";
import { SearchIcon } from "../utilities/icons";
import { ROUTES } from "../constants/routes";

export default function CommandPalette({ open, onClose, sceneId, isScene }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState({ scenes: [], performers: [], studios: [] });
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults({ scenes: [], performers: [], studios: [] });
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length === 0) {
      setResults({ scenes: [], performers: [], studios: [] });
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const [scenes, performers, studios] = await Promise.all([
          api.search(q.trim(), 1, 12),
          api.performers({ search: q.trim() }),
          api.studios(),
        ]);
        if (cancelled) return;
        const p = performers.filter((x) =>
          (x.name || "").toLowerCase().includes(q.trim().toLowerCase())
        );
        const s = studios.filter((x) =>
          (x.name || "").toLowerCase().includes(q.trim().toLowerCase())
        );
        setResults({ scenes: scenes.scenes || [], performers: p, studios: s });
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, q]);

  const setStatus = (status) => {
    if (!sceneId) return;
    api
      .setTracking(sceneId, { status })
      .then(() => onClose())
      .catch(() => {});
  };

  const toggleFavorite = async () => {
    if (!sceneId) return;
    try {
      const [favs, scene] = await Promise.all([api.favorites("scene"), api.scene(sceneId)]);
      const existing = (favs || []).find(
        (f) => f.type === "scene" && String(f.target_id) === String(sceneId)
      );
      if (existing) await api.removeFavorite("scene", sceneId);
      else await api.addFavorite("scene", sceneId, (scene && scene.scene && scene.scene.title) || sceneId);
    } catch (e) {
      console.error(e);
    }
    onClose();
  };

  const commands = [
    { id: "home", label: "Go to Home", hint: "H", icon: "⌂", run: () => navigate(ROUTES.HOME) },
    { id: "library", label: "Go to Library", hint: "L", icon: "⊞", run: () => navigate(ROUTES.LIBRARY) },
    { id: "performers", label: "Browse Performers", icon: "👤", run: () => navigate(ROUTES.PERFORMERS) },
    { id: "studios", label: "Browse Studios", icon: "🏛", run: () => navigate(ROUTES.STUDIOS) },
    { id: "categories", label: "Browse Categories", icon: "🏷", run: () => navigate(ROUTES.CATEGORIES) },
    { id: "favorites", label: "Open Favorites", hint: "F", icon: "★", run: () => navigate(ROUTES.FAVORITES) },
    { id: "playlists", label: "Open Playlists", hint: "P", icon: "☰", run: () => navigate(ROUTES.PLAYLISTS) },
    { id: "multiview", label: "Open Multiview", hint: "V", icon: "⚏", run: () => navigate(ROUTES.MULTIVIEW) },
    { id: "settings", label: "Open Settings", icon: "⚙", run: () => navigate(ROUTES.SETTINGS) },
    { id: "health", label: "Library Health & Scan", icon: "♥", run: () => navigate(ROUTES.HEALTH) },
    { id: "review", label: "Open Metadata Review", icon: "✓", run: () => navigate(ROUTES.REVIEW) },
    { id: "history", label: "Open Watch History", icon: "⏱", run: () => navigate(ROUTES.HISTORY) },
    { id: "collections", label: "Open Smart Collections", icon: "◆", run: () => navigate(ROUTES.COLLECTIONS) },
    { id: "analytics", label: "Open Library Analytics", icon: "↗", run: () => navigate(ROUTES.ANALYTICS) },
    {
      id: "random",
      label: "Play a random scene",
      icon: "🎲",
      run: () =>
        api.randomScene().then((s) => {
          if (s && s._id) {
            onClose();
            navigate(ROUTES.scene(s._id), { replace: true });
          }
        }),
    },
    ...(isScene && sceneId
      ? [
          { id: "st-watching", label: "Mark as Watching", icon: "👁", run: () => setStatus("watching") },
          { id: "st-watched", label: "Mark as Watched", icon: "✓", run: () => setStatus("watched") },
          { id: "st-want", label: "Mark as Want to Watch", icon: "🔖", run: () => setStatus("want-to-watch") },
          { id: "st-skip", label: "Skip current scene", icon: "⊘", run: () => setStatus("skip") },
          { id: "fav-toggle", label: "Toggle favorite on scene", icon: "★", run: toggleFavorite },
        ]
      : []),
  ];

  const filteredCommands = q.trim()
    ? commands.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()))
    : commands;

  const flat = [
    ...filteredCommands.map((c) => ({ kind: "cmd", c })),
    ...results.scenes.map((s) => ({ kind: "scene", s })),
    ...results.performers.map((p) => ({ kind: "performer", p })),
    ...results.studios.map((s) => ({ kind: "studio", s })),
  ];

  const go = (item) => {
    onClose();
    if (item.kind === "cmd") return item.c.run();
    if (item.kind === "scene") navigate(ROUTES.scene(item.s._id), { replace: true });
    else if (item.kind === "performer") navigate(ROUTES.performer(item.p._id));
    else navigate(ROUTES.studio(item.s._id));
  };

  useEffect(() => {
    if (flat.length) setActive(0);
  }, [q]);

  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[active]) go(flat[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 select-none">
      {/* Dim Backdrop with Blur */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
      />

      {/* Main Command Modal */}
      <div
        onKeyDown={onKey}
        className="relative w-[640px] max-w-full rounded-3xl bg-zinc-950/85 border border-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.95)] backdrop-blur-2xl overflow-hidden flex flex-col transition-all animate-slide-up ring-1 ring-white/5"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="relative flex items-center justify-center text-zinc-400">
            {loading ? (
              <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            ) : (
              <SearchIcon size={18} strokeWidth={2.5} className="text-zinc-500" />
            )}
          </div>

          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or search library..."
            className="flex-1 bg-transparent outline-none text-zinc-100 placeholder:text-zinc-600 text-sm font-medium tracking-wide"
          />

          <kbd className="px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/10 text-[10px] font-mono text-zinc-500 font-bold uppercase">
            ESC
          </kbd>
        </div>

        {/* Results Container */}
        <div className="max-h-[55vh] overflow-y-auto p-2 custom-scrollbar space-y-3">
          {loading && q.trim() && flat.length === 0 && (
            <div className="px-4 py-8 text-center text-xs font-mono text-zinc-500">
              Querying database & catalog index...
            </div>
          )}

          {!loading && q.trim() && flat.length === 0 && (
            <div className="px-4 py-10 flex flex-col items-center justify-center text-center gap-1.5">
              <span className="text-xs font-bold text-zinc-300">No results found</span>
              <span className="text-[11px] font-mono text-zinc-600">
                No matching commands, performers, or scenes for "{q}"
              </span>
            </div>
          )}

          {/* Commands Group */}
          {filteredCommands.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">
                <span>Actions & Navigation</span>
                <span className="text-[9px] bg-white/5 px-1.5 py-0.2 rounded">{filteredCommands.length}</span>
              </div>
              <div className="space-y-0.5">
                {filteredCommands.map((c) => {
                  const idx = flat.findIndex((f) => f.kind === "cmd" && f.c.id === c.id);
                  const isSelected = active === idx;
                  return (
                    <button
                      key={c.id}
                      onClick={() => go(flat[idx])}
                      onMouseEnter={() => setActive(idx)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-accent/10 border border-accent/30 text-white shadow-sm"
                          : "text-zinc-300 hover:bg-white/[0.04] border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0 transition-colors ${
                          isSelected ? "bg-accent text-zinc-950 font-bold" : "bg-white/5 text-zinc-400"
                        }`}>
                          {c.icon || "›"}
                        </span>
                        <span className={`text-xs font-medium truncate ${isSelected ? "text-white font-bold" : ""}`}>
                          {c.label}
                        </span>
                      </div>
                      {c.hint && (
                        <kbd className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono text-zinc-500">
                          {c.hint}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scenes Group */}
          {results.scenes.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold border-t border-white/5 pt-2">
                <span>Scenes</span>
                <span className="text-[9px] bg-white/5 px-1.5 py-0.2 rounded">{results.scenes.length}</span>
              </div>
              <div className="space-y-0.5">
                {results.scenes.map((s) => {
                  const idx = flat.findIndex((f) => f.kind === "scene" && f.s._id === s._id);
                  const isSelected = active === idx;
                  return (
                    <button
                      key={s._id}
                      onClick={() => go(flat[idx])}
                      onMouseEnter={() => setActive(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-accent/10 border border-accent/30 text-white shadow-sm"
                          : "text-zinc-300 hover:bg-white/[0.04] border border-transparent"
                      }`}
                    >
                      <div
                        className="w-12 h-7 rounded-lg bg-cover bg-center flex-shrink-0 bg-zinc-900 border border-white/10 shadow-inner"
                        style={{ backgroundImage: `url(${thumbUrl(s._id)})` }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs truncate ${isSelected ? "text-white font-bold" : "text-zinc-200"}`}>
                          {s.title || s.file_name}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 truncate">
                          {s.studio || "Unknown Studio"}
                        </div>
                      </div>
                      {s.resolution && (
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-zinc-500 border border-white/5">
                          {s.resolution}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Performers Group */}
          {results.performers.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold border-t border-white/5 pt-2">
                <span>Performers</span>
                <span className="text-[9px] bg-white/5 px-1.5 py-0.2 rounded">{results.performers.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {results.performers.map((p) => {
                  const idx = flat.findIndex((f) => f.kind === "performer" && f.p._id === p._id);
                  const isSelected = active === idx;
                  return (
                    <button
                      key={p._id}
                      onClick={() => go(flat[idx])}
                      onMouseEnter={() => setActive(idx)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-accent/10 border border-accent/30 text-white shadow-sm"
                          : "text-zinc-300 hover:bg-white/[0.04] border border-transparent"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold uppercase flex-shrink-0 ${
                        isSelected ? "bg-accent text-zinc-950" : "bg-zinc-800 text-zinc-300 border border-white/10"
                      }`}>
                        {(p.name || "?")[0]}
                      </div>
                      <span className="text-xs truncate font-medium">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Studios Group */}
          {results.studios.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold border-t border-white/5 pt-2">
                <span>Studios</span>
                <span className="text-[9px] bg-white/5 px-1.5 py-0.2 rounded">{results.studios.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {results.studios.map((s) => {
                  const idx = flat.findIndex((f) => f.kind === "studio" && f.s._id === s._id);
                  const isSelected = active === idx;
                  return (
                    <button
                      key={s._id}
                      onClick={() => go(flat[idx])}
                      onMouseEnter={() => setActive(idx)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-accent/10 border border-accent/30 text-white shadow-sm"
                          : "text-zinc-300 hover:bg-white/[0.04] border border-transparent"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-accent/40" />
                      <span className="text-xs truncate font-medium">{s.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Hotkey Guide */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.08] bg-zinc-950/90 text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px]">↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[9px]">↵</kbd>
              <span>Select</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[10px] tracking-wider uppercase">Command Center</span>
          </div>
        </div>
      </div>
    </div>
  );
}