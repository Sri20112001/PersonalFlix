import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatTime } from "../utilities/formatters";
import { chapterColor } from "../constants/theme";
import PerformerTagPicker, { PerformerChips, MentionText } from "./PerformerTagPicker";
import ClipExportModal from "./ClipExportModal";
import TranscriptPanel from "./TranscriptPanel";
import { ROUTES } from "../constants/routes";

export function parseTimeToSeconds(input) {
  if (input === null || input === undefined) return 0;
  const str = String(input).trim();
  if (!str) return 0;
  if (!str.includes(":")) {
    const val = parseFloat(str);
    return isNaN(val) ? 0 : Math.max(0, val);
  }
  const parts = str.split(":").map((p) => parseFloat(p));
  if (parts.some((p) => isNaN(p))) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

const CATEGORIES = [
  "intro",
  "main",
  "orgasm",
  "solo",
  "anal",
  "oral",
  "ending",
  "extra",
];

const STATUS_OPTS = [
  {
    key: "want-to-watch",
    label: "Want",
    kbd: "1",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    ),
  },
  {
    key: "watching",
    label: "Watching",
    kbd: "2",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    ),
  },
  {
    key: "watched",
    label: "Watched",
    kbd: "3",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    key: "skip",
    label: "Skip",
    kbd: "4",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeWidth="2" />
        <path d="M5.5 5.5l13 13" strokeLinecap="round" strokeWidth="2" />
      </svg>
    ),
  },
];

// Effective end of a chapter for overlap math: explicit end, else a 30s lookahead.
function chapterEffEnd(t) {
  return t.end_seconds && t.end_seconds > t.seconds
    ? t.end_seconds
    : t.seconds + 30;
}

// Validate a start/end pair. Returns an error string or null.
function validateRange(startStr, endStr) {
  const secs = parseTimeToSeconds(startStr);
  if (!endStr || !endStr.trim()) return null;
  const endSecs = parseTimeToSeconds(endStr);
  if (endSecs <= secs) return "End must be after start.";
  return null;
}

// Find the first chapter overlapped by [startSecs, endSecs), excluding one id.
function findOverlap(timestamps, startSecs, endSecs, excludeId = null) {
  const end = endSecs != null ? endSecs : startSecs + 30;
  return (
    timestamps.find((t) => {
      if (String(t._id) === String(excludeId)) return false;
      const s = t.seconds || 0;
      const e = chapterEffEnd(t);
      return startSecs < e && end > s;
    }) || null
  );
}

// Start/end field with snap-to-now and ±1s/±5s nudge buttons.
function ChapterTimeField({ label, value, onChange, onSnapNow }) {
  const nudge = (d) => {
    onChange(formatTime(Math.max(0, parseTimeToSeconds(value) + d)));
  };
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
          {label}
        </span>
        <div className="flex items-center gap-0.5">
          {[-5, -1, 1, 5].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => nudge(d)}
              title={`Nudge ${d > 0 ? "+" : ""}${d}s`}
              className="px-1 py-0.5 rounded text-[9px] font-mono text-zinc-500 hover:text-[#F5B301] hover:bg-white/5 transition-colors cursor-pointer"
            >
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center bg-[#0A0A0B] border border-white/10 rounded-lg px-2 py-1 focus-within:border-[#F5B301]">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0:00"
          className="w-full bg-transparent text-white outline-none text-xs font-mono min-w-0"
        />
        <button
          type="button"
          onClick={onSnapNow}
          className="text-[9px] text-zinc-400 hover:text-[#F5B301] font-bold uppercase ml-1 flex-shrink-0 cursor-pointer font-mono"
          title="Set to current player position"
        >
          Now
        </button>
      </div>
    </div>
  );
}

// Amber warning when a draft range overlaps an existing chapter.
function OverlapWarning({ overlap, snapLabel, onSnap }) {
  if (!overlap) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono">
      <span className="text-amber-200/90 truncate">
        Overlaps “{overlap.label || "chapter"}” ({formatTime(overlap.seconds)})
      </span>
      {onSnap && (
        <button
          type="button"
          onClick={onSnap}
          className="flex-shrink-0 text-amber-300 hover:text-zinc-950 hover:bg-amber-400 font-bold uppercase px-2 py-0.5 rounded border border-amber-500/40 transition-colors cursor-pointer"
          title={`Set end to ${snapLabel}`}
        >
          Snap end
        </button>
      )}
    </div>
  );
}

export default function SceneInfoPanel({
  scene,
  performers = [],
  studio = null,
  timestamps = [],
  comments = [],
  status = "",
  onStatusChange,
  favorite = null,
  onToggleFavorite,
  playlists = [],
  onTogglePlaylist,
  onCreatePlaylist,
  plBusy = false,
  onEditScene,
  onBack,
  onClosePanel,
  onSeek,
  currentTime = 0,
  onAddTimestamp,
  onUpdateTimestamp,
  onDeleteTimestamp,
  onAddComment,
  onDeleteComment,
}) {
  const navigate = useNavigate();

  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [copiedName, setCopiedName] = useState(false);
  const copyTimer = useRef(null);

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [addingChapter, setAddingChapter] = useState(false);
  const [newChapterDraft, setNewChapterDraft] = useState({
    label: "",
    seconds: "",
    end_seconds: "",
    category: "main",
    performer_ids: [],
  });

  const [commentText, setCommentText] = useState("");
  const [commentTags, setCommentTags] = useState([]);
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);

  // Chapter section state: validation error, collapsed, row refs for autoscroll
  const [chapterError, setChapterError] = useState(null);
  const [chaptersOpen, setChaptersOpen] = useState(() => {
    try {
      return localStorage.getItem("pfx-chapters-open") !== "0";
    } catch (e) {
      return true;
    }
  });
  const rowRefs = useRef({});

  const toggleChaptersOpen = () => {
    setChaptersOpen((v) => {
      try {
        localStorage.setItem("pfx-chapters-open", v ? "0" : "1");
      } catch (e) {}
      return !v;
    });
  };

  // Clip Export state
  const [clipModalOpen, setClipModalOpen] = useState(false);
  const [clipTarget, setClipTarget] = useState({
    start: 0,
    end: 15,
    label: "",
  });

  // Reset per-scene draft state when navigating between scenes.
  const sceneKey = scene?._id;
  useEffect(() => {
    setCommentTags([]);
    setAddingChapter(false);
    setEditingId(null);
    setEditDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const copyFileName = async () => {
    if (!scene?.file_name) return;
    try {
      await navigator.clipboard.writeText(scene.file_name);
      setCopiedName(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedName(false), 1500);
    } catch (e) {}
  };

  useEffect(() => {
    const onExportClip = (e) => {
      if (e.detail) {
        setClipTarget({
          start: e.detail.start ?? currentTime,
          end: e.detail.end ?? currentTime + 15,
          label: e.detail.label || "Snippet",
        });
        setClipModalOpen(true);
      }
    };
    window.addEventListener("pfx-export-clip", onExportClip);
    return () => window.removeEventListener("pfx-export-clip", onExportClip);
  }, [currentTime]);

  // Listen for programmatic capture requests
  useEffect(() => {
    const onCapture = (e) => {
      const timeVal = e.detail?.time != null ? e.detail.time : currentTime;
      const formatted = formatTime(Math.max(0, Math.floor(timeVal)));
      setNewChapterDraft({
        label: "",
        seconds: formatted,
        end_seconds: "",
        category: "main",
        performer_ids: [],
      });
      setAddingChapter(true);
    };
    window.addEventListener("pfx-capture-chapter", onCapture);
    return () => window.removeEventListener("pfx-capture-chapter", onCapture);
  }, [currentTime]);

  const startEditChapter = (t) => {
    setEditingId(t._id);
    setChapterError(null);
    setEditDraft({
      label: t.label || "",
      seconds: formatTime(t.seconds || 0),
      end_seconds: t.end_seconds != null ? formatTime(t.end_seconds) : "",
      category: t.category || "main",
      performer_ids: Array.isArray(t.performer_ids) ? [...t.performer_ids] : [],
    });
  };

  const saveEditChapter = () => {
    if (!editingId || !editDraft) return;
    const secs = parseTimeToSeconds(editDraft.seconds);
    const endSecs = editDraft.end_seconds
      ? parseTimeToSeconds(editDraft.end_seconds)
      : null;
    const err = validateRange(editDraft.seconds, editDraft.end_seconds);
    if (err) {
      setChapterError(err);
      return;
    }
    setChapterError(null);
    onUpdateTimestamp &&
      onUpdateTimestamp(editingId, {
        label: editDraft.label.trim(),
        seconds: secs,
        end_seconds: endSecs,
        category: editDraft.category,
        performer_ids: editDraft.performer_ids || [],
      });
    setEditingId(null);
    setEditDraft(null);
  };

  const openAddChapter = () => {
    setNewChapterDraft({
      label: "",
      seconds: currentTime > 0 ? formatTime(Math.floor(currentTime)) : "0:00",
      end_seconds: "",
      category: "main",
      performer_ids: [],
    });
    setChapterError(null);
    setAddingChapter(true);
  };

  // Chronological chapter list (shared by timeline, rows, active tracking)
  const sortedTs = useMemo(
    () => [...timestamps].sort((a, b) => a.seconds - b.seconds),
    [timestamps]
  );

  // Chapter currently under the playhead (explicit end wins, else next start)
  const activeId = useMemo(() => {
    let active = null;
    for (const t of sortedTs) {
      if (currentTime < t.seconds) break;
      active =
        t.end_seconds && t.end_seconds > t.seconds && currentTime >= t.end_seconds
          ? null
          : t._id;
    }
    return active;
  }, [sortedTs, currentTime]);

  // Keep the active row visible while playing
  useEffect(() => {
    if (activeId == null) return;
    const el = rowRefs.current[activeId];
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeId]);

  const duplicateChapter = (t) => {
    onAddTimestamp &&
      onAddTimestamp({
        scene_id: scene._id,
        label: `${t.label || "Chapter"} copy`,
        seconds: t.seconds,
        end_seconds: t.end_seconds != null ? t.end_seconds : null,
        category: t.category || "main",
        performer_ids: Array.isArray(t.performer_ids) ? [...t.performer_ids] : [],
      });
  };

  // Snap a draft's end to the next chapter start after `fromSecs`.
  const snapEndToNext = (fromSecs, setDraft) => {
    const next = sortedTs
      .filter((t) => t.seconds > fromSecs)
      .sort((a, b) => a.seconds - b.seconds)[0];
    if (next) setDraft((p) => ({ ...p, end_seconds: formatTime(next.seconds) }));
  };

  const submitAddChapter = () => {
    const secs = parseTimeToSeconds(newChapterDraft.seconds);
    const endSecs = newChapterDraft.end_seconds
      ? parseTimeToSeconds(newChapterDraft.end_seconds)
      : null;
    if (!newChapterDraft.label.trim() || isNaN(secs)) return;
    const err = validateRange(newChapterDraft.seconds, newChapterDraft.end_seconds);
    if (err) {
      setChapterError(err);
      return;
    }
    setChapterError(null);
    onAddTimestamp &&
      onAddTimestamp({
        scene_id: scene._id,
        label: newChapterDraft.label.trim(),
        seconds: secs,
        end_seconds: endSecs,
        category: newChapterDraft.category,
        performer_ids: newChapterDraft.performer_ids || [],
      });
    setNewChapterDraft({
      label: "",
      seconds: "",
      end_seconds: "",
      category: "main",
      performer_ids: [],
    });
    setAddingChapter(false);
  };

  const sceneIdNum = parseInt(scene?._id, 10);
  const inPlaylist = (pl) =>
    Array.isArray(pl?.scene_ids) &&
    pl.scene_ids.some((s) => String(s) === String(sceneIdNum));

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim() || plBusy) return;
    await onCreatePlaylist(newPlaylistName.trim());
    setNewPlaylistName("");
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || commentBusy) return;
    setCommentBusy(true);
    try {
      await onAddComment(commentText.trim(), commentTags);
      setCommentText("");
      setCommentTags([]);
    } finally {
      setCommentBusy(false);
    }
  };

  if (!scene) return null;

  // Timeline reference duration
  const totalTimelineDuration =
    scene.duration ||
    Math.max(...timestamps.map((x) => x.end_seconds || x.seconds + 30), 100);

  const openDetailsTab = () => {
    window.dispatchEvent(
      new CustomEvent("pfx-open-tab", {
        detail: {
          path: ROUTES.sceneDetails(scene._id),
          title: `${scene.title || scene.file_name || "Scene"} - Details`,
        },
      })
    );
  };

  return (
    <aside className="h-full bg-[#0A0A0B] text-zinc-300 border-l border-white/5 flex flex-col z-30 shadow-2xl min-w-0 overflow-hidden select-text font-sans">
      {/* STICKY HEADER (h-11, Pro Keyboard First) */}
      <header className="h-11 px-3 bg-[#0A0A0B]/95 backdrop-blur-md border-b border-white/5 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-all group cursor-pointer"
            title="Back to library (Esc)"
          >
            <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
            <span className="uppercase tracking-wider text-[11px] font-mono font-bold">Back</span>
            <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-white/10 text-zinc-300 rounded border border-white/10">Esc</kbd>
          </button>
          <span className="h-3.5 w-px bg-white/10" />
          <button
            onClick={openDetailsTab}
            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-zinc-300 hover:text-[#F5B301] hover:bg-[#F5B301]/10 rounded-lg transition-all cursor-pointer"
            title="Open full scene page in a new app tab"
          >
            <span className="uppercase tracking-wider text-[11px] font-mono font-bold">Details</span>
            <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline-block mr-1">Inspector</span>
          {onClosePanel && (
            <button
              onClick={onClosePanel}
              className="flex items-center gap-1 p-1 px-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-all cursor-pointer"
              title="Close Inspector Panel (I)"
            >
              <kbd className="px-1 py-0.5 text-[9px] font-mono bg-white/10 text-zinc-300 rounded border border-white/10">I</kbd>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* SCROLLABLE BODY */}
      <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-white/5 p-3 space-y-3 custom-scrollbar min-w-0">
        {/* (b) SCENE IDENTITY CARD */}
        <section className="p-3 bg-[#141415] rounded-xl border border-white/5 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold text-white leading-snug tracking-tight break-words">
                {scene.title || scene.file_name || `Scene #${scene._id}`}
              </h1>
              {scene.original_name && scene.original_name !== scene.title && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[10px] font-mono text-zinc-500 truncate flex-1" title={scene.original_name}>
                    {scene.original_name}
                  </p>
                  {scene.file_name && (
                    <button
                      onClick={copyFileName}
                      className="text-[10px] text-zinc-500 hover:text-[#F5B301] p-0.5 rounded hover:bg-white/5 transition-colors cursor-pointer flex-shrink-0"
                      title={copiedName ? "Copied!" : "Copy file name"}
                    >
                      {copiedName ? (
                        <span className="font-mono font-bold text-[#F5B301]">✓</span>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs pt-0.5">
            {studio && (
              <button
                onClick={() => navigate(ROUTES.studio(studio._id))}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F5B301]/15 text-[#F5B301] border border-[#F5B301]/40 hover:bg-[#F5B301]/25 transition-all font-semibold text-[10px] cursor-pointer"
              >
                {studio.name}
              </button>
            )}
            {scene.resolution && (
              <span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] font-mono font-bold text-white">
                {scene.resolution.toUpperCase()}
              </span>
            )}
            {scene.date && (
              <span className="text-[10px] text-zinc-400 font-mono">
                {new Date(scene.date).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            {scene.duration ? (
              <span className="text-[10px] text-[#F5B301] font-mono font-semibold ml-auto">
                {formatTime(scene.duration)}
              </span>
            ) : null}
          </div>

          {performers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Cast:</span>
              {performers.map((p) => (
                <button
                  key={p._id}
                  onClick={() => navigate(ROUTES.performer(p._id))}
                  className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-300 hover:text-zinc-950 hover:bg-[#F5B301] hover:border-[#F5B301] transition-all text-[11px] font-medium cursor-pointer active:scale-95"
                >
                  <span>{p.name}</span>
                  <kbd className="px-1 py-0.5 text-[8px] font-mono bg-white/10 group-hover:bg-black/20 text-zinc-400 group-hover:text-zinc-900 rounded">
                    {(p.name || "?")[0].toUpperCase()}
                  </kbd>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* (c) ACTION DOCK */}
        <section className="pt-1">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={onToggleFavorite}
              title={favorite ? "Remove from Favorites" : "Add to Favorites"}
              className={`h-8 px-2 rounded-lg border flex items-center justify-center gap-1 text-[11px] font-semibold transition-all cursor-pointer active:scale-95 ${
                favorite
                  ? "bg-[#F5B301]/15 text-[#F5B301] border-[#F5B301]/40 hover:bg-[#F5B301]/25 shadow-sm shadow-[#F5B301]/20"
                  : "bg-[#141415] text-zinc-300 border-white/10 hover:text-white hover:border-white/20"
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span>{favorite ? "FAVORITED" : "FAVORITE"}</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setPlaylistOpen((v) => !v)}
                title="Add to Playlist"
                className="w-full h-8 px-2 rounded-lg border bg-[#141415] text-zinc-300 border-white/10 hover:text-white hover:border-white/20 flex items-center justify-center gap-1 text-[11px] font-medium transition-all cursor-pointer active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                <span>PLAYLISTS</span>
              </button>

              {playlistOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setPlaylistOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 w-60 bg-zinc-950 border border-white/15 rounded-xl shadow-2xl z-40 overflow-hidden backdrop-blur-xl">
                    <div className="max-h-52 overflow-y-auto p-1.5 custom-scrollbar space-y-0.5">
                      {playlists.length === 0 && (
                        <div className="px-2.5 py-2 text-[11px] text-zinc-500 font-mono">
                          No playlists found.
                        </div>
                      )}
                      {playlists.map((pl) => {
                        const added = inPlaylist(pl);
                        return (
                          <button
                            key={pl._id}
                            onClick={() => onTogglePlaylist && onTogglePlaylist(pl)}
                            disabled={plBusy}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-white/5 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                                added ? "bg-[#F5B301] border-[#F5B301] text-zinc-950" : "border-white/20"
                              }`}
                            >
                              {added && (
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1 text-xs text-zinc-200 truncate">{pl.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-1 p-1.5 border-t border-white/10 bg-zinc-900/70">
                      <input
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreatePlaylist()}
                        placeholder="New playlist..."
                        className="flex-1 min-w-0 bg-zinc-950 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none focus:border-[#F5B301] text-white placeholder:text-zinc-600 font-mono"
                      />
                      <button
                        onClick={handleCreatePlaylist}
                        disabled={plBusy || !newPlaylistName.trim()}
                        className="bg-[#F5B301] hover:brightness-110 text-zinc-950 px-2.5 rounded-lg text-xs font-bold uppercase transition-all disabled:opacity-50 cursor-pointer active:scale-95"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {onEditScene ? (
              <button
                onClick={onEditScene}
                title="Edit Scene Metadata"
                className="h-8 px-2 rounded-lg border bg-[#141415] text-zinc-300 border-white/10 hover:text-white hover:border-white/20 flex items-center justify-center gap-1 text-[11px] font-medium transition-all cursor-pointer active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                <span>EDIT</span>
              </button>
            ) : (
              <span className="h-8 rounded-lg border border-transparent" />
            )}
          </div>
        </section>

        {/* (d) WATCH-STATUS SEGMENTED CONTROL (1-4 shortcuts) */}
        <section className="pt-1">
          <div className="grid grid-cols-4 gap-1 p-1 bg-[#141415] border border-white/5 rounded-xl">
            {STATUS_OPTS.map((opt) => {
              const active = status === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  title={`${opt.label} (${opt.kbd})`}
                  onClick={() => onStatusChange && onStatusChange(active ? "" : opt.key)}
                  className={`flex flex-col items-center justify-center py-1 rounded-lg text-[10px] transition-all cursor-pointer select-none active:scale-95 group ${
                    active
                      ? "bg-[#F5B301] text-zinc-950 font-bold shadow-md shadow-[#F5B301]/20"
                      : "text-zinc-400 hover:text-white hover:bg-white/5 font-medium"
                  }`}
                >
                  <span className="flex items-center gap-1 mb-0.5">
                    {opt.icon}
                    <kbd className={`px-1 py-0.5 text-[8px] font-mono rounded ${
                      active ? "bg-black/20 text-zinc-950 font-black" : "bg-white/5 group-hover:bg-white/10 text-zinc-400"
                    }`}>
                      {opt.kbd}
                    </kbd>
                  </span>
                  <span className="uppercase font-mono tracking-wider text-[9px]">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* (e) CHAPTERS & KEY MOMENTS */}
        <section className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleChaptersOpen}
              className="flex items-center gap-2 cursor-pointer group"
              title={chaptersOpen ? "Collapse chapters" : "Expand chapters"}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F5B301] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F5B301]" />
              </span>
              <span className="font-display tracking-wide uppercase font-bold text-sm text-white">
                Chapters &amp; Key Moments
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-[#F5B301] font-semibold">
                {timestamps.length}
              </span>
              <svg
                className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${chaptersOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setClipTarget({
                    start: Math.max(0, currentTime - 5),
                    end: currentTime + 15,
                    label: "Highlight",
                  });
                  setClipModalOpen(true);
                }}
                className="px-2 py-1 text-[10px] font-mono font-medium rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
                title="Open Clip / Snippet Generator"
              >
                Clip
              </button>
              {!addingChapter && (
                <button
                  type="button"
                  onClick={openAddChapter}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono font-bold rounded-lg bg-[#F5B301] hover:bg-[#FFC52F] text-zinc-950 transition-colors shadow-sm shadow-[#F5B301]/20 cursor-pointer active:scale-95"
                  title="Add Chapter Marker (C)"
                >
                  <span>+ Marker</span>
                  <kbd className="px-1 py-0.5 text-[8px] font-mono bg-black/20 text-zinc-950 rounded font-black">C</kbd>
                </button>
              )}
            </div>
          </div>

          {chaptersOpen && (
            <div className="space-y-2.5">
              {/* Mini timeline track */}
              {timestamps.length > 0 && (() => {
                const playedPct = totalTimelineDuration > 0
                  ? Math.min(100, Math.max(0, (currentTime / totalTimelineDuration) * 100))
                  : 0;
                return (
                  <div className="p-2 rounded-xl bg-[#141415] border border-white/5 space-y-1.5">
                    <div className="h-3 w-full bg-black/50 rounded overflow-hidden relative cursor-pointer border border-white/10 flex">
                      {sortedTs.map((t, i) => {
                        const widthPct = Math.max(
                          3,
                          Math.min(
                            100,
                            (((t.end_seconds || t.seconds + 20) - t.seconds) /
                              totalTimelineDuration) *
                              100,
                          ),
                        );
                        return (
                          <button
                            type="button"
                            key={t._id || i}
                            onClick={() => onSeek && onSeek(t.seconds)}
                            title={`${t.label || t.category} (${formatTime(t.seconds)})`}
                            style={{ width: `${widthPct}%`, backgroundColor: chapterColor(t.category, i) }}
                            className="h-full opacity-80 hover:opacity-100 border-r border-black/40 transition-opacity cursor-pointer flex-shrink-0"
                          />
                        );
                      })}
                      <div
                        className="absolute top-0 bottom-0 left-0 bg-white/20 pointer-events-none"
                        style={{ width: `${playedPct}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] z-20 pointer-events-none"
                        style={{ left: `${playedPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 px-0.5">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: chapterColor(sortedTs.find((t) => currentTime >= t.seconds)?.category, 0) }}
                        />
                        <span className="text-[#F5B301] font-semibold">{formatTime(currentTime)}</span>
                      </span>
                      <span>{scene.duration ? formatTime(scene.duration) : "End"}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Add-chapter form */}
              {addingChapter && (
                <div className="rounded-xl bg-[#141415] border border-[#F5B301]/40 p-3 flex flex-col gap-2.5 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#F5B301] font-mono">
                      New Chapter Marker
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewChapterDraft((p) => ({
                          ...p,
                          seconds: formatTime(Math.max(0, Math.floor(currentTime))),
                        }))
                      }
                      className="text-[10px] text-[#F5B301] hover:bg-[#F5B301] hover:text-zinc-950 font-mono font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#F5B301]/40 transition-colors cursor-pointer"
                      title="Capture current player position as start"
                    >
                      <span>Snap Now</span>
                      <span className="font-mono opacity-80">({formatTime(currentTime)})</span>
                    </button>
                  </div>

                  <input
                    value={newChapterDraft.label}
                    onChange={(e) => setNewChapterDraft({ ...newChapterDraft, label: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitAddChapter();
                    }}
                    placeholder="Chapter title..."
                    className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-[#F5B301] font-mono"
                    autoFocus
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <ChapterTimeField
                      label="Start"
                      value={newChapterDraft.seconds}
                      onChange={(v) => setNewChapterDraft({ ...newChapterDraft, seconds: v })}
                      onSnapNow={() =>
                        setNewChapterDraft((p) => ({
                          ...p,
                          seconds: formatTime(Math.max(0, Math.floor(currentTime))),
                        }))
                      }
                    />
                    <ChapterTimeField
                      label="End"
                      value={newChapterDraft.end_seconds}
                      onChange={(v) => setNewChapterDraft({ ...newChapterDraft, end_seconds: v })}
                      onSnapNow={() =>
                        setNewChapterDraft((p) => ({
                          ...p,
                          end_seconds: formatTime(Math.max(0, Math.floor(currentTime))),
                        }))
                      }
                    />
                  </div>

                  {chapterError && addingChapter && (
                    <div className="text-[11px] font-mono text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
                      {chapterError}
                    </div>
                  )}

                  {(() => {
                    if (!newChapterDraft.end_seconds?.trim()) return null;
                    const s = parseTimeToSeconds(newChapterDraft.seconds);
                    const e = parseTimeToSeconds(newChapterDraft.end_seconds);
                    const ov = findOverlap(timestamps, s, e, null);
                    if (!ov) return null;
                    const nextSecs = sortedTs.filter((t) => t.seconds > s).map((t) => t.seconds)[0];
                    return (
                      <OverlapWarning
                        overlap={ov}
                        snapLabel={nextSecs != null ? formatTime(nextSecs) : ""}
                        onSnap={
                          nextSecs != null && nextSecs > s
                            ? () => setNewChapterDraft((p) => ({ ...p, end_seconds: formatTime(nextSecs) }))
                            : null
                        }
                      />
                    );
                  })()}

                  <div className="flex flex-wrap gap-1">
                    {CATEGORIES.map((c) => {
                      const active = newChapterDraft.category === c;
                      return (
                        <button
                          type="button"
                          key={c}
                          onClick={() => setNewChapterDraft({ ...newChapterDraft, category: c })}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono capitalize transition-all cursor-pointer ${
                            active
                              ? "bg-[#F5B301] text-zinc-950 font-bold"
                              : "bg-[#0A0A0B] text-zinc-400 hover:text-zinc-200 border border-white/5"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>

                  <PerformerTagPicker
                    selected={newChapterDraft.performer_ids || []}
                    onChange={(ids) => setNewChapterDraft({ ...newChapterDraft, performer_ids: ids })}
                  />

                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        setAddingChapter(false);
                        setChapterError(null);
                      }}
                      className="px-2.5 py-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitAddChapter}
                      className="bg-[#F5B301] hover:brightness-110 text-zinc-950 px-3 py-1 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                    >
                      Save Marker
                    </button>
                  </div>
                </div>
              )}

              {/* Chapter rows */}
              <div className="space-y-1.5">
                {timestamps.length === 0 && !addingChapter && (
                  <div className="py-6 text-center border border-dashed border-white/10 rounded-xl flex flex-col items-center gap-3">
                    <span className="text-xs text-zinc-500 font-mono">
                      No chapters added yet. Press "C" while playing to capture.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNewChapterDraft({
                          label: "",
                          seconds: "0:00",
                          end_seconds: "",
                          category: "main",
                          performer_ids: [],
                        });
                        setChapterError(null);
                        setAddingChapter(true);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-zinc-950 bg-[#F5B301] hover:brightness-110 transition-all cursor-pointer active:scale-95"
                    >
                      + Add marker at 0:00
                    </button>
                  </div>
                )}

                {sortedTs.map((t, i) => {
                  const color = chapterColor(t.category, i);
                  const isEditing = editingId === t._id;
                  const duration =
                    t.end_seconds && t.end_seconds > t.seconds
                      ? t.end_seconds - t.seconds
                      : null;

                  if (isEditing) {
                    return (
                      <div key={t._id} className="p-3 rounded-xl bg-[#141415] border border-[#F5B301]/40 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#F5B301] font-mono">
                            Edit Chapter
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditDraft((p) => ({
                                ...p,
                                seconds: formatTime(Math.max(0, Math.floor(currentTime))),
                              }))
                            }
                            className="text-[10px] text-[#F5B301] hover:underline font-mono cursor-pointer"
                          >
                            Snap to Now ({formatTime(currentTime)})
                          </button>
                        </div>

                        <input
                          value={editDraft.label}
                          onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEditChapter();
                          }}
                          placeholder="Chapter title"
                          className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#F5B301] font-mono"
                        />

                        <div className="grid grid-cols-2 gap-2">
                          <ChapterTimeField
                            label="Start"
                            value={editDraft.seconds}
                            onChange={(v) => setEditDraft({ ...editDraft, seconds: v })}
                            onSnapNow={() =>
                              setEditDraft((p) => ({
                                ...p,
                                seconds: formatTime(Math.max(0, Math.floor(currentTime))),
                              }))
                            }
                          />
                          <ChapterTimeField
                            label="End"
                            value={editDraft.end_seconds}
                            onChange={(v) => setEditDraft({ ...editDraft, end_seconds: v })}
                            onSnapNow={() =>
                              setEditDraft((p) => ({
                                ...p,
                                end_seconds: formatTime(Math.max(0, Math.floor(currentTime))),
                              }))
                            }
                          />
                        </div>

                        {chapterError && (
                          <div className="text-[11px] font-mono text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
                            {chapterError}
                          </div>
                        )}

                        {(() => {
                          if (!editDraft.end_seconds?.trim()) return null;
                          const s = parseTimeToSeconds(editDraft.seconds);
                          const e = parseTimeToSeconds(editDraft.end_seconds);
                          const ov = findOverlap(timestamps, s, e, t._id);
                          if (!ov) return null;
                          const nextSecs = sortedTs.filter((x) => x.seconds > s).map((x) => x.seconds)[0];
                          return (
                            <OverlapWarning
                              overlap={ov}
                              snapLabel={nextSecs != null ? formatTime(nextSecs) : ""}
                              onSnap={
                                nextSecs != null && nextSecs > s
                                  ? () => setEditDraft((p) => ({ ...p, end_seconds: formatTime(nextSecs) }))
                                  : null
                              }
                            />
                          );
                        })()}

                        <div className="flex flex-wrap gap-1">
                          {CATEGORIES.map((c) => (
                            <button
                              type="button"
                              key={c}
                              onClick={() => setEditDraft({ ...editDraft, category: c })}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono capitalize transition-all cursor-pointer ${
                                editDraft.category === c
                                  ? "bg-[#F5B301] text-zinc-950 font-bold"
                                  : "bg-[#0A0A0B] text-zinc-400 border border-white/5"
                              }`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>

                        <PerformerTagPicker
                          selected={editDraft.performer_ids || []}
                          onChange={(ids) => setEditDraft({ ...editDraft, performer_ids: ids })}
                        />

                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/10">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setChapterError(null);
                            }}
                            className="px-2.5 py-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveEditChapter}
                            className="bg-[#F5B301] text-zinc-950 px-3 py-1 rounded-lg text-xs font-bold font-mono uppercase tracking-wider cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const isActive = activeId != null && String(activeId) === String(t._id);
                  const effEnd = t.end_seconds && t.end_seconds > t.seconds ? t.end_seconds : null;
                  const startPct = totalTimelineDuration > 0
                    ? Math.min(100, Math.max(0, (t.seconds / totalTimelineDuration) * 100))
                    : 0;
                  const spanPct = totalTimelineDuration > 0
                    ? Math.max(4, (((effEnd ?? t.seconds + 30) - t.seconds) / totalTimelineDuration) * 100)
                    : 4;
                  const rangeLabel = t.end_seconds && t.end_seconds > t.seconds
                    ? `${formatTime(t.seconds)}–${formatTime(t.end_seconds)}`
                    : formatTime(t.seconds);

                  return (
                    <div
                      key={t._id}
                      ref={(el) => {
                        if (el) rowRefs.current[t._id] = el;
                        else delete rowRefs.current[t._id];
                      }}
                      className={`group relative p-2 rounded-xl transition-all cursor-pointer border ${
                        isActive
                          ? "bg-[#141415] border-[#F5B301] border-l-4 shadow-[0_0_12px_rgba(245,179,1,0.2)]"
                          : "bg-[#141415] border-white/5 hover:border-white/20 hover:bg-[#141415]/90"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div
                          className="flex items-center gap-2 min-w-0"
                          onClick={() => onSeek && onSeek(t.seconds)}
                        >
                          <span
                            className="w-4 h-4 rounded text-[10px] font-mono font-black flex items-center justify-center shrink-0"
                            style={{ backgroundColor: color, color: "#000" }}
                          >
                            {i + 1}
                          </span>
                          <span className={`text-xs font-semibold truncate transition-colors ${isActive ? "text-[#F5B301] font-bold" : "text-white group-hover:text-[#F5B301]"}`}>
                            {t.label || `Chapter ${i + 1}`}
                          </span>
                          {isActive && (
                            <span className="px-1 py-0.5 rounded bg-[#F5B301] text-zinc-950 text-[9px] font-mono font-black tracking-wider animate-pulse shrink-0">
                              NOW
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onSeek && onSeek(t.seconds)}
                          title={`Jump to ${formatTime(t.seconds)}`}
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 cursor-pointer transition-colors ${
                            isActive
                              ? "text-white bg-[#F5B301]/20 border-[#F5B301]/40 font-bold"
                              : "text-zinc-400 group-hover:text-white bg-white/5 border-white/10 hover:border-[#F5B301]"
                          }`}
                        >
                          {rangeLabel}
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[10px] font-mono">
                        <span className="capitalize font-medium" style={{ color }}>
                          {t.category || "main"}{duration ? ` · ${formatTime(duration)}` : ""}
                        </span>
                        <span className="truncate text-zinc-400">
                          {(t.performers || []).map((p) => p.name || p).join(", ")}
                        </span>
                      </div>
                      <div className="h-1 w-full bg-black/60 rounded-full overflow-hidden mt-1.5 relative">
                        <div
                          className="absolute top-0 bottom-0 rounded-full"
                          style={{ left: `${startPct}%`, width: `${Math.min(100 - startPct, spanPct)}%`, backgroundColor: color }}
                        />
                      </div>

                      {/* Hover action strip */}
                      <div
                        className={`mt-2 pt-1.5 border-t border-white/10 items-center justify-end gap-1 text-[9px] font-mono ${
                          isActive ? "flex" : "hidden group-hover:flex"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => duplicateChapter(t)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                          title="Duplicate marker"
                        >
                          <span>Dup</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setClipTarget({
                              start: t.seconds,
                              end: t.end_seconds && t.end_seconds > t.seconds ? t.end_seconds : t.seconds + 20,
                              label: t.label || `Chapter_${i + 1}`,
                            });
                            setClipModalOpen(true);
                          }}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-[#F5B301]/20 text-zinc-400 hover:text-[#F5B301] transition-colors cursor-pointer"
                          title="Export clip of this chapter"
                        >
                          <span>Clip</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditChapter(t)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                          title="Edit marker"
                        >
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete chapter "${t.label || `Chapter ${i + 1}`}" (${formatTime(t.seconds)})?\n\nThis cannot be undone.`
                              )
                            ) {
                              onDeleteTimestamp && onDeleteTimestamp(t._id);
                            }
                          }}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete marker"
                        >
                          <span>Del</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* (f) TRANSCRIPT */}
        <section className="space-y-2 pt-1">
          <TranscriptPanel
            sceneId={parseInt(scene?._id, 10)}
            currentTime={currentTime}
            onSeek={onSeek}
          />
        </section>

        {/* (g) NOTES */}
        <section className="space-y-2 pt-1 pb-4">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setCommentsOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <span className="font-display tracking-wide uppercase font-bold text-sm text-white">
                Scene Notes
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-[#F5B301] font-semibold">
                {comments.length}
              </span>
            </div>
            <svg
              className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${commentsOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {commentsOpen && (
            <>
              <div className="p-2.5 bg-[#141415] rounded-xl border border-white/5 space-y-2">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  placeholder="Add timestamp note or review... (Enter to post, Shift+Enter newline)"
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg p-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#F5B301] resize-none font-sans"
                  rows={2}
                />
                <div className="flex items-center justify-between text-[11px] font-mono gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="min-w-0">
                      <PerformerTagPicker selected={commentTags} onChange={setCommentTags} />
                    </div>
                    <span className="text-[10px] text-zinc-500 flex-shrink-0">@{formatTime(currentTime)}</span>
                  </div>
                  <button
                    onClick={handleAddComment}
                    disabled={commentBusy || !commentText.trim()}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#F5B301] hover:bg-[#FFC52F] text-zinc-950 font-bold rounded-lg text-xs transition-colors shadow-sm shadow-[#F5B301]/20 disabled:opacity-50 cursor-pointer active:scale-95 flex-shrink-0"
                  >
                    <span>Post Note</span>
                    <kbd className="px-1 py-0.5 text-[8px] font-mono bg-black/20 text-zinc-950 rounded font-black">↵ Enter</kbd>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {comments.map((c) => (
                  <div
                    key={c._id}
                    className="p-2.5 rounded-xl bg-[#141415] border border-white/5 hover:border-white/15 transition-all text-xs space-y-1 group"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span>{new Date(c.created_at).toLocaleDateString()}</span>
                        <PerformerChips performers={c.performers} performerIds={c.performer_ids} />
                      </span>
                      <button
                        onClick={() => onDeleteComment && onDeleteComment(c._id)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-opacity p-0.5 cursor-pointer"
                        title="Delete note"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-zinc-200 text-[11px] leading-normal break-words">
                      <MentionText text={c.text} performers={c.performers} />
                    </p>
                  </div>
                ))}
                {comments.length === 0 && (
                  <div className="text-[11px] text-zinc-600 font-mono text-center py-2">
                    No notes recorded.
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* FOOTER SHORTCUT STRIP */}
      <footer className="px-3 py-1.5 bg-[#0A0A0B] border-t border-white/5 flex items-center justify-between text-[9px] font-mono text-zinc-500 shrink-0 select-none">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-0.5"><kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded text-zinc-300">C</kbd> Mark</span>
          <span className="flex items-center gap-0.5"><kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded text-zinc-300">I</kbd> Toggle</span>
          <span className="flex items-center gap-0.5"><kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded text-zinc-300">Esc</kbd> Back</span>
        </div>
        <span className="text-zinc-600 font-medium">PersonalFlix Inspector</span>
      </footer>

      {/* Clip Modal */}
      <ClipExportModal
        isOpen={clipModalOpen}
        onClose={() => setClipModalOpen(false)}
        sceneId={scene?._id}
        sceneTitle={scene?.title || scene?.file_name}
        defaultStart={clipTarget.start}
        defaultEnd={clipTarget.end}
        chapterLabel={clipTarget.label}
      />
    </aside>
  );
}
