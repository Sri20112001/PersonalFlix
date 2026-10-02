import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/apiClient";
import { ROUTES } from "../constants/routes";

/**
 * Multi-performer tag picker with search.
 * Props: selected (id array), onChange(ids), compact?
 * Resolves selected ids to names via the performers list endpoint.
 */
export default function PerformerTagPicker({ selected = [], onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [names, setNames] = useState({});
  const boxRef = useRef(null);
  const timer = useRef(null);

  // Resolve names for already-selected ids.
  useEffect(() => {
    const missing = (selected || []).filter((id) => !names[id]);
    if (missing.length === 0) return;
    api
      .performers({})
      .then((res) => {
        const list = Array.isArray(res) ? res : res.performers || [];
        const m = {};
        list.forEach((p) => {
          if (missing.includes(String(p._id))) m[String(p._id)] = p.name || String(p._id);
        });
        if (Object.keys(m).length > 0) setNames((prev) => ({ ...prev, ...m }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join(",")]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const search = (val) => {
    setQ(val);
    setOpen(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await api.performers(val.trim() ? { search: val.trim() } : { limit: 20 });
        const list = Array.isArray(res) ? res : res.performers || [];
        setResults(list.slice(0, 8));
      } catch {
        setResults([]);
      }
    }, 180);
  };

  const toggle = (id) => {
    const sid = String(id);
    const cur = selected || [];
    onChange(cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid]);
  };

  return (
    <div ref={boxRef} className="relative">
      {(selected || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {(selected || []).map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 border border-accent/40 text-accent text-[10px] font-mono"
            >
              @{names[id] || id}
              <button
                type="button"
                onClick={() => onChange((selected || []).filter((x) => x !== id))}
                className="hover:text-white cursor-pointer font-bold"
                title="Remove tag"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={q}
        onChange={(e) => search(e.target.value)}
        onFocus={() => {
          setOpen(true);
          if (results.length === 0) search(q);
        }}
        placeholder="Tag performers… (search name)"
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent placeholder:text-zinc-600 font-mono"
      />
      {open && results.length > 0 && (
        <div className="absolute z-40 left-0 right-0 mt-1 rounded-lg bg-zinc-900 border border-white/10 shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
          {results.map((p) => {
            const active = (selected || []).includes(String(p._id));
            return (
              <button
                key={p._id}
                type="button"
                onClick={() => toggle(p._id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                  active ? "bg-accent/15 text-accent" : "text-zinc-200 hover:bg-white/5"
                }`}
              >
                <span className="flex-1 truncate">
                  {p.name || p._id}
                  <span className="text-zinc-500 font-mono"> @{p._id}</span>
                </span>
                {active && <span className="font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Read-only chips linking tagged performers to their pages. */
export function PerformerChips({ performers = [], performerIds = [] }) {
  const navigate = useNavigate();
  const list = (performers || []).filter(Boolean);
  const fallback = list.length === 0 ? (performerIds || []) : [];
  if (list.length === 0 && fallback.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {list.map((p) => (
        <button
          key={p._id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(ROUTES.performer(p._id));
          }}
          className="px-1.5 py-px rounded-full bg-accent/15 border border-accent/40 text-accent text-[10px] font-mono hover:bg-accent/25 transition-colors cursor-pointer"
          title={p.name || p._id}
        >
          @{p.name || p._id}
        </button>
      ))}
      {list.length === 0 &&
        fallback.map((id) => (
          <button
            key={id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(ROUTES.performer(id));
            }}
            className="px-1.5 py-px rounded-full bg-white/5 border border-white/10 text-zinc-400 text-[10px] font-mono hover:text-white transition-colors cursor-pointer"
          >
            @{id}
          </button>
        ))}
    </span>
  );
}

/**
 * Render text with @mentions linkified against known performers
 * (matched by slug id or name, case-insensitive).
 */
export function MentionText({ text = "", performers = [] }) {
  const navigate = useNavigate();
  const pool = [...(performers || [])];
  const parts = String(text).split(/(@[A-Za-z0-9_.-]+)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (!part.startsWith("@")) return <span key={i}>{part}</span>;
        const key = part.slice(1).toLowerCase();
        const hit = pool.find(
          (p) =>
            String(p._id || "").toLowerCase() === key ||
            String(p.name || "").toLowerCase().replace(/\s+/g, "") === key ||
            String(p.name || "").toLowerCase() === key
        );
        if (!hit) return <span key={i}>{part}</span>;
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(ROUTES.performer(hit._id));
            }}
            className="text-accent hover:underline font-medium cursor-pointer"
          >
            {part}
          </button>
        );
      })}
    </span>
  );
}
