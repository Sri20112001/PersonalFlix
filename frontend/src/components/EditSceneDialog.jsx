import React, { useEffect, useState } from "react";
import { api } from "../api/apiClient";

const RESOLUTIONS = ["", "480", "480m", "720", "720m", "1080p", "4k"];

export default function EditSceneDialog({
  open,
  sceneId,
  scene,
  performers,
  studio,
  categories,
  onClose,
  onSaved,
}) {
  const [title, setTitle] = useState("");
  const [studioId, setStudioId] = useState("");
  const [date, setDate] = useState("");
  const [resolution, setResolution] = useState("");
  const [selPerformers, setSelPerformers] = useState([]);
  const [selCategories, setSelCategories] = useState([]);
  const [allStudios, setAllStudios] = useState([]);
  const [allPerformers, setAllPerformers] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [pFilter, setPFilter] = useState("");
  const [cFilter, setCFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(scene?.title || "");
    setStudioId(studio?._id || "");
    setDate(scene?.date ? String(scene.date).slice(0, 10) : "");
    setResolution(scene?.resolution || "");
    setSelPerformers((performers || []).map((p) => String(p._id)));
    setSelCategories((categories || []).map((c) => String(c._id)));
    setPFilter("");
    setCFilter("");
    setError("");
    (async () => {
      try {
        const [st, pf, ct] = await Promise.all([
          api.studios().catch(() => []),
          api.performers().catch(() => []),
          api.categories().catch(() => []),
        ]);
        setAllStudios(st || []);
        setAllPerformers(pf || []);
        setAllCategories(ct || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [open, sceneId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const toggle = (list, setList, id) => {
    const s = String(id);
    setList((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const pList = allPerformers.filter((p) =>
    (p.name || "").toLowerCase().includes(pFilter.trim().toLowerCase())
  );
  const cList = allCategories.filter((c) =>
    (c.name || "").toLowerCase().includes(cFilter.trim().toLowerCase())
  );
  const selPNames = selPerformers.map(
    (id) => allPerformers.find((p) => String(p._id) === id)?.name || id
  );
  const selCNames = selCategories.map(
    (id) => allCategories.find((c) => String(c._id) === id)?.name || id
  );

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.updateScene(sceneId, {
        title,
        studio_id: studioId || null,
        date: date || null,
        resolution: resolution || null,
        performer_ids: selPerformers,
        category_ids: selCategories,
      });
      const detail = await api.scene(sceneId);
      onSaved && onSaved(detail);
      onClose && onClose();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-200">
      {/* Dark Ambient Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Editor Modal Shell */}
      <div className="relative w-full max-w-[680px] max-h-[88vh] flex flex-col bg-[#070708] border border-white/10 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.85)] overflow-hidden backdrop-blur-xl">
        {/* Sticky Compact Header */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30 flex-shrink-0">
          <div className="flex flex-col min-w-0 pr-4">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500">
              Scene Metadata
            </span>
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="text-base font-bold text-zinc-100 tracking-tight">
                Edit Scene
              </h2>
              {scene?.title && (
                <span className="text-xs text-zinc-500 font-mono truncate max-w-[280px] sm:max-w-[360px]">
                  · {scene.title}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors cursor-pointer flex-shrink-0"
            title="Close (Esc)"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6 custom-scrollbar select-text">
          {/* Error Banner */}
          {error && (
            <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-xl px-3.5 py-2.5 font-mono flex items-start gap-2.5">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-rose-400 flex-shrink-0 mt-0.5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="flex-1 break-words leading-relaxed">{error}</span>
            </div>
          )}

          {/* Section: Basic Information */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400">
                Basic Information
              </h3>
            </div>

            <div className="flex flex-col gap-3">
              {/* Primary Title Field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Scene title..."
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-all font-sans"
                />
              </div>

              {/* Studio, Resolution, Date Responsive Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Studio Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                    Studio
                  </label>
                  <select
                    value={studioId}
                    onChange={(e) => setStudioId(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 cursor-pointer transition-all"
                  >
                    <option value="" className="bg-zinc-950 text-zinc-400">
                      (none)
                    </option>
                    {allStudios.map((s) => (
                      <option
                        key={s._id}
                        value={s._id}
                        className="bg-zinc-950 text-zinc-200"
                      >
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Resolution Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                    Resolution
                  </label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-zinc-200 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 cursor-pointer transition-all"
                  >
                    {RESOLUTIONS.map((r) => (
                      <option
                        key={r}
                        value={r}
                        className="bg-zinc-950 text-zinc-200"
                      >
                        {r === "" ? "(none)" : r.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Release Date */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                    Release Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-zinc-200 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-all"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section: Performers */}
          <section className="flex flex-col gap-2.5 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400">
                  Performers
                </h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                {selPerformers.length} selected
              </span>
            </div>

            {/* Selected Performer Pills */}
            {selPNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-white/[0.02] border border-white/5 max-h-24 overflow-y-auto custom-scrollbar">
                {selPNames.map((n, i) => (
                  <button
                    key={`${n}-${i}`}
                    type="button"
                    onClick={() =>
                      toggle(selPerformers, setSelPerformers, selPerformers[i])
                    }
                    className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-accent/15 border border-accent/30 text-accent hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300 transition-all cursor-pointer active:scale-95"
                    title="Remove performer"
                  >
                    <span>{n}</span>
                    <span className="text-[10px] opacity-70 group-hover:opacity-100">
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Performer Search Filter */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                value={pFilter}
                onChange={(e) => setPFilter(e.target.value)}
                placeholder="Search performers..."
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-8 pr-3.5 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-accent font-mono transition-all"
              />
              {pFilter && (
                <button
                  type="button"
                  onClick={() => setPFilter("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs font-mono cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Scrollable Performer Selection Box */}
            <div className="max-h-44 overflow-y-auto border border-white/10 rounded-xl bg-zinc-950/60 divide-y divide-white/[0.04] custom-scrollbar">
              {pList.slice(0, 60).map((p) => {
                const active = selPerformers.includes(String(p._id));
                return (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() =>
                      toggle(selPerformers, setSelPerformers, p._id)
                    }
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left transition-colors cursor-pointer ${
                      active
                        ? "bg-accent/10 text-accent font-medium"
                        : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] flex-shrink-0 transition-colors ${
                        active
                          ? "bg-accent border-accent text-zinc-950 font-bold"
                          : "border-white/20"
                      }`}
                    >
                      {active ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
              {pList.length === 0 && (
                <div className="p-4 text-center text-xs text-zinc-500 font-mono">
                  No performers found.
                </div>
              )}
            </div>
          </section>

          {/* Section: Categories */}
          <section className="flex flex-col gap-2.5 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400">
                  Categories
                </h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                {selCategories.length} selected
              </span>
            </div>

            {/* Selected Category Pills */}
            {selCNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-white/[0.02] border border-white/5 max-h-24 overflow-y-auto custom-scrollbar">
                {selCNames.map((n, i) => (
                  <button
                    key={`${n}-${i}`}
                    type="button"
                    onClick={() =>
                      toggle(selCategories, setSelCategories, selCategories[i])
                    }
                    className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-accent/15 border border-accent/30 text-accent hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300 transition-all cursor-pointer active:scale-95"
                    title="Remove category"
                  >
                    <span>{n}</span>
                    <span className="text-[10px] opacity-70 group-hover:opacity-100">
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Category Search Filter */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                value={cFilter}
                onChange={(e) => setCFilter(e.target.value)}
                placeholder="Search categories..."
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-8 pr-3.5 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-accent font-mono transition-all"
              />
              {cFilter && (
                <button
                  type="button"
                  onClick={() => setCFilter("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs font-mono cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Compact Category Tag Selector Box */}
            <div className="p-2.5 border border-white/10 rounded-xl bg-zinc-950/60 max-h-40 overflow-y-auto custom-scrollbar flex flex-wrap gap-1.5">
              {cList.slice(0, 80).map((c) => {
                const active = selCategories.includes(String(c._id));
                return (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() =>
                      toggle(selCategories, setSelCategories, c._id)
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer active:scale-95 border ${
                      active
                        ? "bg-accent/20 border-accent/50 text-accent font-semibold shadow-sm"
                        : "bg-white/[0.03] hover:bg-white/[0.07] text-zinc-300 border-white/5 hover:border-white/15"
                    }`}
                  >
                    <span>{c.name}</span>
                    {active && <span className="text-[10px] font-bold">✓</span>}
                  </button>
                );
              })}
              {cList.length === 0 && (
                <div className="w-full py-3 text-center text-xs text-zinc-500 font-mono">
                  No categories found.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Sticky Footer Action Bar */}
        <footer className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-white/10 bg-zinc-950/80 backdrop-blur-md sticky bottom-0 z-30 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-mono font-medium text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider text-zinc-950 bg-accent hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            {saving && (
              <svg
                className="animate-spin -ml-0.5 h-3.5 w-3.5 text-zinc-950"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            <span>{saving ? "Saving…" : "Save Changes"}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}