import React, { useMemo, useState } from "react";
import { api } from "../../api/apiClient";

export default function ReviewEditor({ item, studios, performers, onSaved, onCancel }) {
  const [studioId, setStudioId] = useState(item.studioId || "");
  const [picked, setPicked] = useState(item.performerRefs || []);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (performers || [])
      .filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) && !picked.includes(p._id),
      )
      .slice(0, 8);
  }, [query, performers, picked]);

  const nameOf = (pid) =>
    (performers || []).find((p) => String(p._id) === String(pid))?.name || pid;

  const adoptSuggestion = (name) => {
    const hit = (performers || []).find(
      (p) => (p.name || "").toLowerCase() === String(name).toLowerCase(),
    );
    if (hit && !picked.includes(hit._id))
      setPicked((prev) => [...prev, hit._id]);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.updateScene(item.sceneId, {
        studio_id: studioId || null,
        performer_ids: picked,
      });
      onSaved();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        {/* Studio Selector */}
        <label className="flex-1 min-w-[220px] flex flex-col gap-1.5">
          <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-zinc-400">
            Canonical Studio
          </span>
          <select
            value={studioId}
            onChange={(e) => setStudioId(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-accent/80 focus:ring-1 focus:ring-accent/40 transition-all font-mono cursor-pointer"
          >
            <option value="">— None (Unassigned) —</option>
            {(studios || []).map((s) => (
              <option key={s._id} value={s._id} className="bg-zinc-950">
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {/* Performers Multi-Tag Input */}
        <div className="flex-[2] min-w-[280px] flex flex-col gap-1.5">
          <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-zinc-400">
            Assigned Performers ({picked.length})
          </span>
          <div className="flex flex-wrap items-center gap-1.5 min-h-[38px] bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1.5 focus-within:border-accent/80 transition-all">
            {picked.map((pid) => (
              <span
                key={pid}
                className="inline-flex items-center gap-1.5 bg-accent/15 border border-accent/30 text-zinc-200 text-xs rounded-lg px-2.5 py-1 font-medium shadow-sm"
              >
                <span>{nameOf(pid)}</span>
                <button
                  type="button"
                  onClick={() =>
                    setPicked((prev) => prev.filter((x) => x !== pid))
                  }
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer text-xs"
                >
                  ✕
                </button>
              </span>
            ))}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={picked.length ? "" : "Search catalog performers…"}
              className="flex-1 min-w-[150px] bg-transparent text-xs text-white outline-none placeholder:text-zinc-600 font-mono"
            />
          </div>

          {/* Autocomplete Dropdown */}
          {matches.length > 0 && (
            <div className="bg-zinc-950/95 border border-white/10 rounded-xl overflow-hidden shadow-2xl mt-1 divide-y divide-white/5">
              {matches.map((p) => (
                <button
                  type="button"
                  key={p._id}
                  onClick={() => {
                    setPicked((prev) => [...prev, p._id]);
                    setQuery("");
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-zinc-200 hover:bg-accent hover:text-zinc-950 transition-colors font-medium flex items-center justify-between cursor-pointer"
                >
                  <span>{p.name}</span>
                  <span className="text-[10px] opacity-60 font-mono">
                    Select
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Suggestion Chips */}
      {(item.suggestions || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
          <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-zinc-500">
            Detected Name Hints:
          </span>
          {item.suggestions.map((s, i) => (
            <button
              type="button"
              key={i}
              onClick={() => adoptSuggestion(s)}
              title="Click to assign canonical match"
              className="text-xs text-zinc-300 hover:text-white bg-zinc-900/80 hover:bg-accent/20 border border-dashed border-white/20 hover:border-accent rounded-lg px-2.5 py-1 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="text-xs text-rose-400 font-mono bg-rose-950/30 border border-rose-500/20 px-3 py-2 rounded-lg">
          Save failed: {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-accent hover:brightness-110 disabled:opacity-50 text-zinc-950 text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-xl transition-all shadow-md shadow-accent/20 cursor-pointer active:scale-95"
        >
          {saving ? "Saving Changes…" : "Commit Metadata"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-zinc-400 hover:text-white uppercase font-bold tracking-wider px-4 py-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
