import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api/apiClient";
import { performerImage } from "../../utilities/media";

const GENDERS = ["female", "male", "trans", "non-binary", "other"];

const ATTR_FIELDS = [
  { key: "hair_color", label: "Hair" },
  { key: "eye_color", label: "Eyes" },
  { key: "height", label: "Height" },
  { key: "weight", label: "Weight" },
  { key: "measurements", label: "Measurements" },
  { key: "ethnicity", label: "Ethnicity" },
  { key: "birthdate", label: "Birthdate" },
];

const inputCls =
  "w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-accent transition-colors";
const labelCls =
  "block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5";

function str(v) {
  return v === null || v === undefined ? "" : String(v);
}

export default function PerformerEditModal({ performer, onClose, onSaved }) {
  const [name, setName] = useState(str(performer?.name));
  const [country, setCountry] = useState(str(performer?.country));
  const [gender, setGender] = useState(str(performer?.gender) || "female");
  const [views, setViews] = useState(str(performer?.views));
  const [modelId, setModelId] = useState(
    performer?.model_id === null || performer?.model_id === undefined
      ? ""
      : String(performer.model_id)
  );
  const [slug, setSlug] = useState(str(performer?.slug));
  const [sourceUrl, setSourceUrl] = useState(str(performer?.source_url));
  const [imageUrl, setImageUrl] = useState(str(performer?.image_url));

  const baseAttrs =
    typeof performer?.attributes === "object" && performer?.attributes !== null
      ? performer.attributes
      : {};
  const [attrs, setAttrs] = useState(() => {
    const init = {};
    for (const { key } of ATTR_FIELDS) init[key] = str(baseAttrs[key]);
    return init;
  });
  const [aliases, setAliases] = useState(() =>
    Array.isArray(baseAttrs.aliases) ? baseAttrs.aliases.join(", ") : ""
  );

  const [allCategories, setAllCategories] = useState([]);
  const [catIds, setCatIds] = useState(() =>
    Array.isArray(performer?.category_ids)
      ? performer.category_ids.map(String)
      : []
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    api.categories().then((c) => setAllCategories(Array.isArray(c) ? c : [])).catch(() => {});
  }, []);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const genderOptions = useMemo(() => {
    const opts = [...GENDERS];
    if (gender && !opts.includes(gender)) opts.push(gender);
    return opts;
  }, [gender]);

  const toggleCat = (id) => {
    const sid = String(id);
    setCatIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
    );
  };

  const setAttr = (key, value) => setAttrs((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Merge attribute edits over untouched keys; blank inputs drop the key.
      const merged = { ...baseAttrs };
      for (const { key } of ATTR_FIELDS) {
        const v = (attrs[key] || "").trim();
        if (v) merged[key] = v;
        else delete merged[key];
      }
      const aliasList = aliases.split(",").map((a) => a.trim()).filter(Boolean);
      if (aliasList.length > 0) merged.aliases = aliasList;
      else delete merged.aliases;

      const modelInt = modelId.trim() === "" ? null : parseInt(modelId.trim(), 10);
      const body = {
        name: cleanName,
        country: country.trim() || null,
        gender: gender || null,
        views: views.trim() || null,
        model_id: Number.isNaN(modelInt) ? null : modelInt,
        slug: slug.trim() || null,
        source_url: sourceUrl.trim() || null,
        image_url: imageUrl.trim() || null,
        attributes: merged,
        category_ids: catIds,
      };
      const updated = await api.updatePerformer(performer._id || performer.id, body);
      onSaved(updated?.performer || updated);
    } catch (e) {
      console.error("Update performer failed", e);
      setError("Save failed. The server rejected the update.");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-zinc-950 border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="font-display uppercase tracking-wider text-lg text-white font-bold">
              Edit Performer
            </h2>
            <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
              ID: {performer._id || performer.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5 custom-scrollbar">
          {/* Identity */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-accent mb-3">
              Identity
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Performer name" />
              </div>
              <div>
                <label className={labelCls}>Country</label>
                <input value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} placeholder="e.g. US" />
              </div>
              <div>
                <label className={labelCls}>Gender</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className={`${inputCls} cursor-pointer`}>
                  {genderOptions.map((g) => (
                    <option key={g} value={g} className="bg-zinc-900">{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Views</label>
                <input value={views} onChange={(e) => setViews(e.target.value)} className={inputCls} placeholder="e.g. 123456" />
              </div>
              <div>
                <label className={labelCls}>Model ID</label>
                <input value={modelId} onChange={(e) => setModelId(e.target.value)} inputMode="numeric" className={inputCls} placeholder="numeric" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Slug</label>
                <input value={slug} onChange={(e) => setSlug(e.target.value)} className={inputCls} placeholder="url-slug" />
              </div>
            </div>
          </section>

          {/* Photo & source */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-accent mb-3">
              Photo & Source
            </h3>
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-zinc-900 border border-white/10 flex-shrink-0 flex items-center justify-center">
                {!imgErr && imageUrl ? (
                  <img
                    src={performerImage(imageUrl)}
                    alt=""
                    onError={() => setImgErr(true)}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <span className="font-display text-2xl text-white/30">
                    {(name || "?")[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 flex flex-col gap-3 min-w-0">
                <div>
                  <label className={labelCls}>Image URL (performers/xxx.jpg)</label>
                  <input
                    value={imageUrl}
                    onChange={(e) => { setImageUrl(e.target.value); setImgErr(false); }}
                    className={`${inputCls} font-mono text-xs`}
                    placeholder="performers/xxx.jpg"
                  />
                </div>
                <div>
                  <label className={labelCls}>Source URL</label>
                  <input
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    className={`${inputCls} font-mono text-xs`}
                    placeholder="https://…"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Categories */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-accent mb-3">
              Categories ({catIds.length})
            </h3>
            {allCategories.length === 0 ? (
              <p className="text-xs text-zinc-500">No categories found.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-0.5">
                {allCategories.map((c) => {
                  const cid = String(c._id || c.id);
                  const active = catIds.includes(cid);
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => toggleCat(cid)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                        active
                          ? "bg-accent text-zinc-950 border-accent"
                          : "bg-white/[0.04] text-zinc-400 border-white/10 hover:text-white hover:border-white/30"
                      }`}
                    >
                      {c.name || cid}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Attributes */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-accent mb-3">
              Attributes
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ATTR_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className={labelCls}>{label}</label>
                  <input
                    value={attrs[key] || ""}
                    onChange={(e) => setAttr(key, e.target.value)}
                    className={inputCls}
                    placeholder="—"
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <label className={labelCls}>Aliases (comma separated)</label>
                <input
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  className={inputCls}
                  placeholder="Alias One, Alias Two"
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="text-xs font-bold text-red-300 bg-red-950/60 border border-red-500/40 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-white/10 flex-shrink-0 bg-zinc-900/50">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/10 transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider text-zinc-950 bg-accent hover:brightness-110 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
