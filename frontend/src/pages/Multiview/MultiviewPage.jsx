import React from "react";
import { useNavigate } from "react-router-dom";
import { videoUrl, thumbUrl } from "../../utilities/media";
import Spinner from "../../components/Spinner";
import {
  ShuffleIcon,
  MuteIcon,
  ExternalTabIcon,
  CloseIcon,
  PlusIcon,
} from "../../utilities/icons";
import { useMultiview } from "../../hooks/useMultiview";
import { ROUTES } from "../../constants/routes";

export default function MultiviewPage() {
  const navigate = useNavigate();
  const {
    layout,
    setLayout,
    slotCount,
    activeSlots,
    gridClass,
    loading,
    audioSlot,
    pickerSlot,
    setPickerSlot,
    searchQ,
    setSearchQ,
    searchResults,
    scenes,
    videoRefs,
    handlePickScene,
    randomizeSlot,
    randomizeAll,
    toggleAudio,
  } = useMultiview();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#070708]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#070708] pt-20 px-8 pb-6 select-none overflow-hidden">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
            <span className="absolute w-4 h-4 rounded-full bg-accent/25 -z-10" />
          </div>
          <div>
            <h1 className="font-display uppercase tracking-[0.2em] text-xl font-black text-white">
              Multiview
            </h1>
            <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono">
              {slotCount} Concurrent Streams
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Segmented Layout Selector */}
          <div className="flex items-center bg-zinc-950/80 backdrop-blur-md border border-white/10 rounded-xl p-1 gap-1 shadow-lg">
            {["1x2", "2x2", "3x3"].map((l) => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                className={`text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  layout === l
                    ? "bg-accent text-zinc-950 font-black shadow-md shadow-accent/20"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Randomize All Button */}
          <button
            onClick={randomizeAll}
            className="bg-zinc-900/80 hover:bg-zinc-800/90 border border-white/10 hover:border-white/20 text-zinc-100 hover:text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer group"
          >
            <ShuffleIcon size={14} className="transition-transform group-hover:rotate-45" />
            <span>Randomize All</span>
          </button>
        </div>
      </div>

      {/* Video Grid */}
      <div className={`flex-1 grid ${gridClass} gap-3 min-h-0 min-w-0`}>
        {activeSlots.map((scene, idx) => {
          const isAudioActive = audioSlot === idx;
          return (
            <div
              key={idx}
              className={`relative bg-zinc-950/90 rounded-2xl overflow-hidden group border transition-all duration-300 flex items-center justify-center shadow-xl ${
                isAudioActive
                  ? "border-accent ring-2 ring-accent/40 shadow-accent/15"
                  : "border-white/10 hover:border-white/25"
              }`}
            >
              {scene ? (
                <>
                  <video
                    ref={(el) => (videoRefs.current[idx] = el)}
                    src={videoUrl(scene._id)}
                    muted={!isAudioActive}
                    autoPlay
                    loop
                    playsInline
                    className="w-full h-full object-cover scale-100 group-hover:scale-105 transition-transform duration-500 ease-out"
                  />

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3 pointer-events-none">
                    {/* Top Action Bar */}
                    <div className="flex items-center justify-between pointer-events-auto gap-2">
                      <span className="text-xs font-semibold text-zinc-100 bg-zinc-950/70 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-lg truncate max-w-[70%] shadow-sm">
                        {scene.title || scene.file_name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {/* Audio Toggle Pill */}
                        <button
                          onClick={() => toggleAudio(idx)}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer backdrop-blur-md active:scale-90 ${
                            isAudioActive
                              ? "bg-accent text-zinc-950 shadow-md shadow-accent/30 font-bold"
                              : "bg-black/50 text-zinc-300 hover:text-white hover:bg-black/70 border border-white/10"
                          }`}
                          title={isAudioActive ? "Mute stream" : "Listen to this stream"}
                        >
                          {isAudioActive ? (
                            <div className="flex items-end gap-[2px] h-3">
                              <span className="w-[3px] bg-zinc-950 animate-[bounce_0.6s_infinite_alternate] h-3 rounded-full" />
                              <span className="w-[3px] bg-zinc-950 animate-[bounce_0.8s_infinite_alternate] h-2 rounded-full" />
                              <span className="w-[3px] bg-zinc-950 animate-[bounce_0.5s_infinite_alternate] h-3.5 rounded-full" />
                            </div>
                          ) : (
                            <MuteIcon size={14} />
                          )}
                        </button>

                        {/* Expand to Scene Button */}
                        <button
                          onClick={() => navigate(ROUTES.scene(scene._id), { replace: true })}
                          className="w-8 h-8 rounded-xl bg-black/50 hover:bg-accent hover:text-zinc-950 text-zinc-300 border border-white/10 flex items-center justify-center transition-all cursor-pointer backdrop-blur-md active:scale-90"
                          title="Open full scene"
                        >
                          <ExternalTabIcon size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Bottom Controls Dock */}
                    <div className="flex items-center justify-between pointer-events-auto gap-2 bg-zinc-950/60 backdrop-blur-md p-1.5 rounded-xl border border-white/10">
                      <span className="text-[10px] text-zinc-400 font-mono pl-1.5 truncate">
                        {scene.resolution || "HD"} {scene.studio ? `Â· ${scene.studio}` : ""}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => randomizeSlot(idx)}
                          className="text-[10px] uppercase font-bold tracking-wider bg-white/10 hover:bg-white/20 text-zinc-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          Swap
                        </button>
                        <button
                          onClick={() => setPickerSlot(idx)}
                          className="text-[10px] uppercase font-bold tracking-wider bg-accent text-zinc-950 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-sm shadow-accent/20"
                        >
                          Pick
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Active Audio Tag */}
                  {isAudioActive && (
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-accent/90 text-zinc-950 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md z-10">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-ping" />
                      Live Audio
                    </div>
                  )}
                </>
              ) : (
                /* Empty Slot Target */
                <div className="flex flex-col items-center gap-3 p-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900/60 border border-dashed border-white/15 flex items-center justify-center text-zinc-600">
                    <PlusIcon size={20} />
                  </div>
                  <span className="text-xs text-zinc-500 uppercase tracking-widest font-mono font-medium">
                    Slot {idx + 1} Available
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPickerSlot(idx)}
                      className="bg-accent hover:brightness-110 text-zinc-950 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-xl transition-all shadow-md shadow-accent/20 cursor-pointer active:scale-95"
                    >
                      + Pick Scene
                    </button>
                    <button
                      onClick={() => randomizeSlot(idx)}
                      className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all cursor-pointer active:scale-95"
                    >
                      Random
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scene Picker Modal */}
      {pickerSlot !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
          onClick={() => setPickerSlot(null)}
        >
          <div
            className="w-[520px] max-w-full bg-zinc-950/90 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[75vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent" />
                <span className="font-display uppercase tracking-widest text-xs font-bold text-white">
                  Assign Slot {pickerSlot + 1}
                </span>
              </div>
              <button
                onClick={() => setPickerSlot(null)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <CloseIcon size={14} />
              </button>
            </div>

            <div className="p-3 border-b border-white/10 bg-zinc-900/40">
              <input
                autoFocus
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search scene title or studio..."
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-accent/80 focus:ring-1 focus:ring-accent/40 transition-all placeholder:text-zinc-600 font-mono"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 custom-scrollbar">
              {(searchQ.trim() ? searchResults : scenes).slice(0, 25).map((s) => (
                <button
                  key={s._id}
                  onClick={() => handlePickScene(pickerSlot, s)}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left transition-all group border border-transparent hover:border-white/5 cursor-pointer"
                >
                  <div
                    className="w-14 h-9 rounded-lg bg-cover bg-center flex-shrink-0 bg-zinc-900 border border-white/10 group-hover:border-accent/40 transition-colors"
                    style={{ backgroundImage: `url(${thumbUrl(s._id)})` }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-zinc-200 group-hover:text-white truncate font-medium">
                      {s.title || s.file_name}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                      {s.studio || "Unknown Studio"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
