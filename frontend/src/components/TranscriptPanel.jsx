import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/apiClient";
import { formatTime } from "../utilities/formatters";

// Clickable transcript: rows seek the player, hover pencil edits cue text
// (saved to the .vtt + .srt sidecars on disk). Mirrors the chapters UX.
export default function TranscriptPanel({ sceneId, currentTime = 0, onSeek }) {
  const [cues, setCues] = useState(null); // null = loading, [] = none
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("pfx-transcript-open") !== "0";
    } catch (e) {
      return true;
    }
  });
  const [query, setQuery] = useState("");
  const [editingIdx, setEditingIdx] = useState(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const rowRefs = useRef({});

  const toggleOpen = () => {
    setOpen((v) => {
      try {
        localStorage.setItem("pfx-transcript-open", v ? "0" : "1");
      } catch (e) {}
      return !v;
    });
  };

  useEffect(() => {
    let cancelled = false;
    setCues(null);
    setMissing(false);
    setEditingIdx(null);
    setError(null);
    api
      .subtitleCues(sceneId)
      .then((res) => {
        if (cancelled) return;
        setCues(Array.isArray(res?.cues) ? res.cues : []);
      })
      .catch(() => {
        if (cancelled) return;
        setCues([]);
        setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  const filtered = useMemo(() => {
    if (!cues) return [];
    const q = query.trim().toLowerCase();
    if (!q) return cues;
    return cues.filter((c) => (c.text || "").toLowerCase().includes(q));
  }, [cues, query]);

  const activeIdx = useMemo(() => {
    if (!cues) return null;
    let active = null;
    for (const c of cues) {
      if (currentTime < c.start) break;
      active = currentTime < c.end || c === cues[cues.length - 1] ? c.index : null;
    }
    return active;
  }, [cues, currentTime]);

  useEffect(() => {
    if (activeIdx == null || editingIdx != null) return;
    const el = rowRefs.current[activeIdx];
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIdx, editingIdx]);

  const startEdit = (c) => {
    setEditingIdx(c.index);
    setDraft(c.text || "");
    setError(null);
  };

  const saveEdit = async () => {
    if (editingIdx == null || saving) return;
    const text = draft.trim();
    if (!text) {
      setError("Caption text cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateSubtitleCue(sceneId, editingIdx, text);
      const updated = res?.cue;
      setCues((prev) =>
        (prev || []).map((c) =>
          c.index === editingIdx ? { ...c, text: updated?.text ?? text } : c
        )
      );
      setEditingIdx(null);
      setDraft("");
      window.dispatchEvent(
        new CustomEvent("pfx-subs-changed", { detail: { sceneId } })
      );
    } catch (e) {
      setError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={toggleOpen}
      >
        <div className="flex items-center gap-2">
          <span className="font-display tracking-wide uppercase font-bold text-sm text-white">
            Transcript &amp; Dialogues
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-zinc-400 font-semibold">
            {cues ? `${cues.length} cues` : "…"}
          </span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <div className="pt-2 space-y-1.5">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter dialogue or speaker..."
              className="w-full h-7 bg-[#141415] border border-white/10 rounded-lg pl-7 pr-2 text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-[#F5B301] font-sans"
            />
            <svg
              className="w-3 h-3 text-zinc-500 absolute left-2.5 top-2 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </div>

          {cues === null && (
            <div className="text-[11px] text-zinc-500 font-mono py-3 text-center">
              Loading captions…
            </div>
          )}
          {cues !== null && cues.length === 0 && (
            <div className="py-4 text-center border border-dashed border-white/10 rounded-xl">
              <span className="text-xs text-zinc-500 font-mono">
                {missing
                  ? "No captions yet — use +CC in the player to generate them."
                  : "Transcript is empty."}
              </span>
            </div>
          )}
          {query.trim() && cues && cues.length > 0 && (
            <div className="text-[10px] font-mono text-zinc-500 px-1">
              {filtered.length}/{cues.length} matching
            </div>
          )}

          {filtered.map((c) => {
            const isActive = activeIdx != null && c.index === activeIdx;
            const isEditing = editingIdx === c.index;
            if (isEditing) {
              return (
                <div
                  key={c.index}
                  className="p-2.5 rounded-xl bg-[#141415] border border-[#F5B301]/60 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <span className="text-[#F5B301] font-bold">{formatTime(c.start)}</span>
                    <span className="text-zinc-400">Editing Dialogue</span>
                  </div>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveEdit();
                      if (e.key === "Escape") {
                        setEditingIdx(null);
                        setError(null);
                      }
                    }}
                    rows={2}
                    autoFocus
                    className="w-full bg-[#0A0A0B] border border-white/15 rounded-lg p-1.5 text-[11px] text-white focus:outline-none focus:border-[#F5B301] resize-none font-sans"
                  />
                  {error && (
                    <div className="text-[11px] font-mono text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
                      {error}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-zinc-500 text-[9px]">Ctrl+Enter Save · Esc Cancel</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIdx(null);
                          setError(null);
                        }}
                        className="px-2 py-0.5 rounded text-zinc-400 hover:text-white text-[10px] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={saving}
                        className="px-2 py-0.5 rounded bg-[#F5B301] hover:bg-[#FFC52F] text-zinc-950 font-bold text-[10px] disabled:opacity-50 cursor-pointer"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={c.index}
                ref={(el) => {
                  if (el) rowRefs.current[c.index] = el;
                  else delete rowRefs.current[c.index];
                }}
                className={`group p-2.5 rounded-xl border text-xs space-y-1 transition-all ${
                  isActive
                    ? "bg-[#141415] border-[#F5B301] border-l-4 shadow-[0_0_10px_rgba(245,179,1,0.15)]"
                    : "bg-[#141415] border-white/5 hover:border-white/15"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => onSeek && onSeek(c.start + 0.01)}
                    title={`Jump to ${formatTime(c.start)}`}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#F5B301] text-zinc-950 font-bold"
                        : "text-[#F5B301] hover:underline font-bold"
                    }`}
                  >
                    <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>{formatTime(c.start)}</span>
                  </button>
                  {isActive ? (
                    <span className="flex items-center gap-2">
                      <span className="px-1 py-0.5 text-[8px] font-black bg-[#F5B301]/20 text-[#F5B301] rounded uppercase animate-pulse">
                        NOW
                      </span>
                      <span className="flex items-center gap-0.5 text-[#F5B301]" aria-hidden="true">
                        <span className="w-0.5 h-2.5 bg-[#F5B301] rounded-full animate-pulse" />
                        <span className="w-0.5 h-4 bg-[#F5B301] rounded-full animate-pulse" />
                        <span className="w-0.5 h-2 bg-[#F5B301] rounded-full animate-pulse" />
                      </span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      title="Edit caption"
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-white transition-opacity p-0.5 cursor-pointer"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                    </button>
                  )}
                </div>
                <p className={`text-[11px] leading-relaxed ${isActive ? "text-white font-medium" : "text-zinc-300"}`}>
                  "{c.text}"
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
