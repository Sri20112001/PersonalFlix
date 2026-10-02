import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import VideoCard from "../../components/VideoCard";
import Spinner from "../../components/Spinner";
import { useStudioScenes } from "../../hooks/useStudioScenes";
import { api } from "../../api/apiClient";
import { performerImage } from "../../utilities/media";
import { formatBytes } from "../../utilities/formatters";
import { ROUTES } from "../../constants/routes";

export default function StudioPage() {
  const { studio, setStudio, detail, scenes, loading, logoOk, setLogoOk } = useStudioScenes();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [styleDraft, setStyleDraft] = useState("");
  const [sigDraft, setSigDraft] = useState([]);
  const [allCats, setAllCats] = useState([]);
  const [catFilter, setCatFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [rosterOpen, setRosterOpen] = useState(false);

  const catName = useMemo(() => {
    const m = {};
    (allCats || []).forEach((c) => {
      m[c._id] = c.name;
    });
    return m;
  }, [allCats]);

  useEffect(() => {
    api.categories().then(setAllCats).catch(() => {});
  }, []);

  const startEdit = () => {
    setStyleDraft(studio?.style || "");
    setSigDraft(studio?.signature_categories || []);
    setSaveMsg("");
    setEditing(true);
  };

  const toggleSig = (id) => {
    setSigDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await api.updateStudio(studio._id, {
        style: styleDraft,
        signature_categories: sigDraft,
      });
      setStudio((prev) => ({ ...prev, ...updated }));
      setEditing(false);
      const n = updated.propagated ?? 0;
      setSaveMsg(
        n > 0
          ? `Saved — signature applied to ${n} scene${n === 1 ? "" : "s"}.`
          : "Saved — no scenes needed updating."
      );
      setTimeout(() => setSaveMsg(""), 5000);
    } catch (e) {
      setSaveMsg("Save failed: " + (e.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  const filteredCats = useMemo(() => {
    const q = catFilter.trim().toLowerCase();
    if (!q) return allCats;
    return allCats.filter(
      (c) => (c.name || "").toLowerCase().includes(q) || (c._id || "").includes(q)
    );
  }, [allCats, catFilter]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const sig = studio?.signature_categories || [];
  const stats = detail?.stats || { scenes: scenes.length, performers: 0, favorites: 0, bytes: 0 };
  const roster = detail?.performers || [];
  const favs = detail?.favorites || [];
  const topCats = detail?.top_categories || [];
  const rosterShown = rosterOpen ? roster : roster.slice(0, 12);

  return (
    <div className="h-full flex flex-col bg-background pt-6 pb-12 px-10">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          {studio?.logo && logoOk && (
            <img
              src={studio.logo}
              alt={`${studio.name} logo`}
              className="h-12 max-w-[220px] object-contain rounded bg-surface px-3 py-1.5"
              onError={() => setLogoOk(false)}
            />
          )}
          <h1 className="font-display uppercase tracking-widest text-3xl truncate">
            {studio ? studio.name : "Studio"}
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-textMuted uppercase tracking-widest">{scenes.length} scenes</span>
          {studio && !editing && (
            <button
              type="button"
              onClick={startEdit}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs font-mono cursor-pointer"
            >
              Edit style
            </button>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 flex-shrink-0">
        {[
          { label: "Scenes", value: stats.scenes },
          { label: "Performers", value: stats.performers },
          { label: "Favorited", value: `★ ${stats.favorites}` },
          { label: "Footage", value: formatBytes(stats.bytes) },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-zinc-950/70 border border-white/10 px-4 py-3">
            <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 font-mono">
              {s.label}
            </div>
            <div className="text-xl font-mono font-black text-white">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6">
        {/* House style + signature categories */}
        {studio && (
          <div className="rounded-2xl bg-zinc-950/70 border border-white/10 p-5">
            {!editing ? (
              <>
                {studio.style ? (
                  <p className="text-sm text-zinc-300 leading-relaxed max-w-3xl">{studio.style}</p>
                ) : (
                  <p className="text-xs font-mono text-zinc-600">No style notes yet — click Edit style.</p>
                )}
                {(sig.length > 0 || topCats.length > 0) && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-3">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mr-1">
                      Auto-tags:
                    </span>
                    {(sig.length > 0 ? sig : topCats.map((c) => c._id)).map((id) => (
                      <span
                        key={id}
                        className="px-2 py-0.5 rounded-lg bg-accent/10 border border-accent/25 text-[11px] font-mono text-accent"
                      >
                        {catName[id] || topCats.find((c) => c._id === id)?.name || id}
                      </span>
                    ))}
                  </div>
                )}
                {saveMsg && <div className="mt-3 text-xs font-mono text-emerald-300">{saveMsg}</div>}
              </>
            ) : (
              <>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">
                  House style (famous for)
                </label>
                <textarea
                  value={styleDraft}
                  onChange={(e) => setStyleDraft(e.target.value)}
                  rows={3}
                  className="w-full max-w-3xl bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-accent/60 resize-y"
                />
                <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-4 mb-1.5">
                  Signature categories — auto-added to this studio's scenes (existing tags kept)
                </label>
                <input
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  placeholder="Filter 191 categories…"
                  className="w-full max-w-3xl bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-accent/60 font-mono mb-2"
                />
                <div className="flex items-start gap-1.5 flex-wrap max-h-40 overflow-y-auto custom-scrollbar max-w-3xl">
                  {filteredCats.map((c) => {
                    const on = sigDraft.includes(c._id);
                    return (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => toggleSig(c._id)}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-mono border transition-colors cursor-pointer ${
                          on
                            ? "bg-accent text-zinc-950 border-accent font-bold"
                            : "bg-white/5 text-zinc-400 border-white/10 hover:text-white"
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-1.5 rounded-xl bg-accent text-zinc-950 text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Saving…" : "Save & apply to scenes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                {saveMsg && <div className="mt-3 text-xs font-mono text-rose-300">{saveMsg}</div>}
              </>
            )}
          </div>
        )}

        {/* Favorite videos of this studio */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono">
              ★ Favorite videos
            </h2>
            <span className="text-[10px] font-mono text-zinc-600">{favs.length} starred</span>
          </div>
          {favs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center">
              <span className="text-xs font-mono text-zinc-500">
                No starred scenes here yet — open a scene and hit ★ to pin it to this shelf.
              </span>
            </div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {favs.map((s) => (
                <VideoCard key={s._id} scene={s} width="100%" height={150} />
              ))}
            </div>
          )}
        </section>

        {/* Performer roster */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono">
              Performers ({roster.length})
            </h2>
            {roster.length > 12 && (
              <button
                type="button"
                onClick={() => setRosterOpen((v) => !v)}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                {rosterOpen ? "Show less ▲" : `Show all ${roster.length} ▼`}
              </button>
            )}
          </div>
          {roster.length === 0 ? (
            <div className="text-xs font-mono text-zinc-600">No linked performers yet.</div>
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {rosterShown.map((p) => {
                const img = performerImage(p.image_url);
                return (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => navigate(ROUTES.performer(p._id))}
                    className="group flex items-center gap-2.5 p-2 rounded-xl bg-zinc-950/70 border border-white/10 hover:border-accent/50 transition-all cursor-pointer text-left"
                    title={`${p.name} — ${p.scene_count} scene${p.scene_count === 1 ? "" : "s"} here`}
                  >
                    <span className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 border border-white/10 flex-shrink-0 flex items-center justify-center text-xs font-bold text-zinc-300">
                      {img ? (
                        <img
                          src={img}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                      ) : (
                        (p.name || "?")[0]
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-zinc-200 group-hover:text-white truncate">
                        {p.name}
                      </span>
                      <span className="block text-[10px] font-mono text-zinc-500">
                        {p.scene_count} scene{p.scene_count === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* All scenes */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono">
            All scenes ({scenes.length})
          </h2>
          {scenes.length === 0 ? (
            <div className="text-textMuted text-sm">No scenes in this studio.</div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {scenes.map((s) => (
                <VideoCard key={s._id} scene={s} width="100%" height={150} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
