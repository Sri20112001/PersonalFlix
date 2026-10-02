import React from "react";

export default function MediaLibraryCard({
  libraryPath,
  setLibraryPath,
  handleSave,
  saving,
  savedMsg,
}) {
  return (
    <div className="bg-zinc-950/70 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6 shadow-xl">
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-200">
          Media Library Root
        </h2>
      </div>
      <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
        Specify the master root folder containing your scene video files, performer
        stills, and local metadata databases.
      </p>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="relative">
          <input
            type="text"
            value={libraryPath}
            onChange={(e) => setLibraryPath(e.target.value)}
            placeholder="e.g. D:\Media\PersonalFlix"
            className="w-full bg-zinc-900/90 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-accent/80 focus:ring-1 focus:ring-accent/40 transition-all font-mono"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent hover:brightness-110 disabled:opacity-50 text-zinc-950 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-accent/20 cursor-pointer active:scale-95"
          >
            {saving ? "Updating..." : "Save Changes"}
          </button>

          {savedMsg && (
            <span className="text-xs text-emerald-400 font-mono font-medium">
              {savedMsg}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
