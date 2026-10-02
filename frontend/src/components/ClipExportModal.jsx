import React, { useState, useRef, useEffect } from "react";
import { videoUrl } from "../utilities/media";
import { formatTime } from "../utilities/formatters";

export default function ClipExportModal({
  isOpen,
  onClose,
  sceneId,
  sceneTitle = "Scene",
  defaultStart = 0,
  defaultEnd = 15,
  chapterLabel = "",
}) {
  if (!isOpen) return null;

  const [startTime, setStartTime] = useState(Math.max(0, Math.floor(defaultStart)));
  const [endTime, setEndTime] = useState(
    Math.max(Math.floor(defaultStart) + 5, Math.floor(defaultEnd || defaultStart + 15))
  );
  const [previewPos, setPreviewPos] = useState(defaultStart);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const duration = Math.max(1, endTime - startTime);

  useEffect(() => {
    setStartTime(Math.max(0, Math.floor(defaultStart)));
    setEndTime(Math.max(Math.floor(defaultStart) + 5, Math.floor(defaultEnd || defaultStart + 15)));
    setPreviewPos(defaultStart);
  }, [defaultStart, defaultEnd, isOpen]);

  // Handle preview time update
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setPreviewPos(cur);

    if (isRecording) {
      const elapsed = cur - startTime;
      setRecordProgress(Math.min(100, Math.max(0, (elapsed / duration) * 100)));
      if (cur >= endTime) {
        stopRecording();
      }
    } else if (cur >= endTime) {
      videoRef.current.currentTime = startTime;
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const togglePreviewPlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.currentTime < startTime || videoRef.current.currentTime >= endTime) {
        videoRef.current.currentTime = startTime;
      }
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (time) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setPreviewPos(time);
  };

  // Capture Still Frame as HQ PNG
  const captureSnapshot = () => {
    if (!videoRef.current) return;
    try {
      const v = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth || 1920;
      canvas.height = v.videoHeight || 1080;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cleanName = (sceneTitle || "Scene")
          .replace(/[\\/:*?"<>|]/g, "_")
          .trim()
          .slice(0, 40);
        a.download = `${cleanName}_snapshot_${Math.floor(previewPos)}s.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatusMsg("Snapshot saved as PNG!");
        setTimeout(() => setStatusMsg(null), 3000);
      }, "image/png");
    } catch (e) {
      console.error("Snapshot error:", e);
      setStatusMsg("Could not capture frame");
      setTimeout(() => setStatusMsg(null), 2500);
    }
  };

  // Start Client-Side Media Recording
  const startRecording = async () => {
    if (!videoRef.current || isRecording) return;
    const v = videoRef.current;

    try {
      setIsRecording(true);
      setStatusMsg(`Recording snippet (${duration}s)...`);
      chunksRef.current = [];

      // Get video stream
      const stream = v.captureStream ? v.captureStream() : v.mozCaptureStream ? v.mozCaptureStream() : null;
      if (!stream) {
        throw new Error("captureStream not supported in this browser");
      }

      // Determine supported mime type
      const mimeTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
      const selectedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || "";

      const recorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "video/webm";
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cleanName = (sceneTitle || "Scene")
          .replace(/[\\/:*?"<>|]/g, "_")
          .trim()
          .slice(0, 40);
        const labelPart = chapterLabel ? `_${chapterLabel.replace(/\s+/g, "_")}` : "";
        a.download = `${cleanName}${labelPart}_clip_${startTime}s-${endTime}s.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setIsRecording(false);
        setStatusMsg("✅ Clip exported & downloaded!");
        setTimeout(() => setStatusMsg(null), 4000);
      };

      // Seek to start and begin recording
      v.currentTime = startTime;
      v.muted = true; // Mute during automated high-speed clip capture
      v.playbackRate = 1.0;

      // When seek completes, start recorder and play
      const onSeeked = () => {
        v.removeEventListener("seeked", onSeeked);
        recorder.start(100);
        v.play();
        setIsPlaying(true);
      };
      v.addEventListener("seeked", onSeeked);
    } catch (e) {
      console.error("Clip recording error:", e);
      setIsRecording(false);
      setStatusMsg("Clip recording error: " + (e.message || e));
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.muted = false;
      setIsPlaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-white/15 rounded-3xl p-6 shadow-2xl flex flex-col gap-5 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
            <h2 className="font-display uppercase tracking-widest text-base font-bold text-white">
              Highlight Snippet & Clip Generator
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Video Preview Frame */}
        <div className="relative aspect-video rounded-2xl bg-zinc-900 overflow-hidden border border-white/10 shadow-inner group">
          <video
            ref={videoRef}
            src={videoUrl(sceneId)}
            crossOrigin="anonymous"
            onTimeUpdate={handleTimeUpdate}
            className="w-full h-full object-contain"
          />

          {/* Overlay Status or Progress */}
          {isRecording && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-3">
              <div className="flex items-center gap-2 text-accent font-bold text-sm tracking-wider uppercase font-mono">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                <span>Recording Highlight Clip ({Math.round(recordProgress)}%)</span>
              </div>
              <div className="w-64 h-2 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-200 rounded-full"
                  style={{ width: `${recordProgress}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400 font-mono">
                {formatTime(previewPos)} / {formatTime(endTime)}
              </span>
            </div>
          )}

          {/* Preview Play/Pause button */}
          {!isRecording && (
            <button
              onClick={togglePreviewPlay}
              className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full bg-accent/90 text-zinc-950 flex items-center justify-center shadow-2xl hover:scale-105 transition-transform">
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </div>
            </button>
          )}

          {/* Current Position Pill */}
          <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px] font-mono text-zinc-300 border border-white/10">
            {formatTime(previewPos)}
          </div>
        </div>

        {/* Time Cut Controls */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-4">
            {/* Start Time */}
            <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-zinc-900/60 border border-white/5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">Start Cut</span>
                <span className="text-accent font-bold">{formatTime(startTime)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={endTime - 1}
                value={startTime}
                disabled={isRecording}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setStartTime(val);
                  handleSeek(val);
                }}
                className="w-full accent-accent cursor-pointer"
              />
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                <button
                  type="button"
                  onClick={() => setStartTime((t) => Math.max(0, t - 5))}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10"
                >
                  -5s
                </button>
                <button
                  type="button"
                  onClick={() => setStartTime((t) => Math.min(endTime - 1, t + 5))}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10"
                >
                  +5s
                </button>
                <button
                  type="button"
                  onClick={() => setStartTime(Math.floor(previewPos))}
                  className="ml-auto px-2 py-0.5 rounded bg-accent/20 text-accent font-bold hover:bg-accent hover:text-zinc-950"
                >
                  Snap Current
                </button>
              </div>
            </div>

            {/* End Time */}
            <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-zinc-900/60 border border-white/5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">End Cut</span>
                <span className="text-accent font-bold">{formatTime(endTime)}</span>
              </div>
              <input
                type="range"
                min={startTime + 1}
                max={startTime + 120}
                value={endTime}
                disabled={isRecording}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setEndTime(val);
                  handleSeek(val);
                }}
                className="w-full accent-accent cursor-pointer"
              />
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                <button
                  type="button"
                  onClick={() => setEndTime((t) => Math.max(startTime + 1, t - 5))}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10"
                >
                  -5s
                </button>
                <button
                  type="button"
                  onClick={() => setEndTime((t) => t + 5)}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10"
                >
                  +5s
                </button>
                <button
                  type="button"
                  onClick={() => setEndTime(Math.max(startTime + 1, Math.floor(previewPos)))}
                  className="ml-auto px-2 py-0.5 rounded bg-accent/20 text-accent font-bold hover:bg-accent hover:text-zinc-950"
                >
                  Snap Current
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-2 text-xs font-mono text-zinc-400">
            <span>Snippet Duration: <strong className="text-white">{duration}s</strong></span>
            <span>File: <span className="text-zinc-300 truncate max-w-xs">{sceneTitle}</span></span>
          </div>
        </div>

        {statusMsg && (
          <div className="p-3 rounded-xl bg-accent/15 border border-accent/40 text-accent text-xs font-mono flex items-center gap-2 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Export Actions Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10 flex-wrap gap-3">
          <button
            type="button"
            onClick={captureSnapshot}
            disabled={isRecording}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-200 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="Export high-resolution uncompressed PNG still frame"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>Grab Frame PNG</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isRecording}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xl ${
                isRecording
                  ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse"
                  : "bg-accent hover:brightness-110 text-zinc-950 shadow-accent/20"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" />
              </svg>
              <span>{isRecording ? "Stop & Save Clip" : "Export Video Snippet"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
