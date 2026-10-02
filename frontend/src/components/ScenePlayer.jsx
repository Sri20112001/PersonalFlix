import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlayPauseButton from "./PlayPauseButton";
import UpNextOverlay from "./UpNextOverlay";
import { api } from "../api/apiClient";
import { videoUrl, subtitleUrl } from "../utilities/media";
import { formatTime } from "../utilities/formatters";
import { chapterColor } from "../constants/theme";
import { useBindings } from "../hooks/useShortcuts";
import { matchBinding, displayBinding } from "../utilities/shortcuts";
import { ROUTES } from "../constants/routes";

export function buildChapters(timestamps, duration) {
  if (!timestamps || timestamps.length === 0) return [];
  const sorted = [...timestamps].sort((a, b) => a.seconds - b.seconds);
  return sorted.map((t, i) => {
    const start = Math.max(0, t.seconds);
    const end =
      t.end_seconds && t.end_seconds > start
        ? t.end_seconds
        : i + 1 < sorted.length
        ? Math.max(start, sorted[i + 1].seconds)
        : duration > 0
        ? duration
        : start + 10;
    return { ...t, start, end };
  });
}

export function buildTimelineSegments(timestamps, duration) {
  const dur = Math.max(1, duration || 0);
  if (!timestamps || timestamps.length === 0) {
    return [
      {
        _id: "default",
        start: 0,
        end: dur,
        duration: dur,
        label: "Full Video",
        category: "main",
        isChapter: false,
        index: 0,
      },
    ];
  }

  const sorted = [...timestamps].sort((a, b) => a.seconds - b.seconds);
  const segments = [];
  let curTime = 0;

  sorted.forEach((t, i) => {
    const start = Math.max(0, t.seconds);
    const end =
      t.end_seconds && t.end_seconds > start
        ? Math.min(dur, t.end_seconds)
        : i + 1 < sorted.length
        ? Math.max(start, Math.min(dur, sorted[i + 1].seconds))
        : dur;

    if (start > curTime) {
      segments.push({
        _id: `gap-${i}`,
        start: curTime,
        end: start,
        duration: start - curTime,
        label: curTime === 0 ? "Intro" : "Interlude",
        category: "intro",
        isChapter: false,
        index: -1,
      });
    }

    const segDur = Math.max(0.1, end - start);
    segments.push({
      _id: t._id || `ch-${i}`,
      start,
      end,
      duration: segDur,
      label: t.label || t.category || `Chapter ${i + 1}`,
      category: t.category || "main",
      isChapter: true,
      index: i,
    });

    curTime = end;
  });

  if (curTime < dur) {
    segments.push({
      _id: "outro",
      start: curTime,
      end: dur,
      duration: dur - curTime,
      label: "Outro",
      category: "ending",
      isChapter: false,
      index: -1,
    });
  }

  return segments;
}

export default function ScenePlayer({
  sceneId,
  timestamps,
  recs = [],
  onNext,
  onPrev,
  onRandom,
  onInfo,
  onStatusKey,
  seekRequest,
  initialTime,
  autoResume,
  onProgress,
  onBack,
}) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const hideTimer = useRef(null);

  const loadPrefs = () => {
    try {
      return JSON.parse(localStorage.getItem("pfx-player") || "{}");
    } catch {
      return {};
    }
  };
  const prefs = useRef(loadPrefs()).current;
  const persistPrefs = (patch) => {
    try {
      localStorage.setItem("pfx-player", JSON.stringify({ ...loadPrefs(), ...patch }));
    } catch {}
  };

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(prefs.muted === true);
  const [volume, setVolume] = useState(typeof prefs.volume === "number" ? prefs.volume : 0.9);
  const [rate, setRate] = useState(typeof prefs.rate === "number" ? prefs.rate : 1);
  const [rateOpen, setRateOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [loopOpen, setLoopOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [resumedToast, setResumedToast] = useState(false);
  const hasAutoResumed = useRef(false);
  const [pipActive, setPipActive] = useState(false);
  const [hasSubs, setHasSubs] = useState(false);
  const [subsOn, setSubsOn] = useState(() => prefs.subs !== false);
  // Bumped when the transcript editor rewrites the sidecar on disk so the
  // <track> element reloads fresh cues instead of serving a stale copy.
  const [subsRev, setSubsRev] = useState(0);
  const [ccJob, setCcJob] = useState(null);
  const ccPoll = useRef(null);
  const [errorState, setErrorState] = useState(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [autoplay, setAutoplay] = useState(() => {
    return localStorage.getItem("pfx-autoplay") !== "false";
  });
  const [countdown, setCountdown] = useState(null);
  const [chapterToast, setChapterToast] = useState(null);
  const countdownTimer = useRef(null);
  // YouTube-style recommendations: auto-show at video end, toggle any time.
  const [upNextOpen, setUpNextOpen] = useState(false);
  const [upNextAuto, setUpNextAuto] = useState(() => {
    return localStorage.getItem("pfx-upnext-auto") !== "false";
  });
  const lastReport = useRef(0);
  // Watch-session log: exact wall-clock time (play/pause/seek/ended + heartbeat).
  const wasPlayingForLog = useRef(false);
  // Deep-link seeks (tagged chapters) may arrive before metadata is ready.
  const pendingSeekRef = useRef(null);
  const logWatch = (event) => {
    const v = videoRef.current;
    api
      .logWatchEvent(
        sceneId,
        event,
        v ? v.currentTime || 0 : current || 0,
        (v && v.duration) || duration || 0
      )
      .catch(() => {});
  };
  const bindings = useBindings();
  const navigate = useNavigate();

  // 1. Live Frame Hover Scrubbing & Timeline State
  const previewVideoRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const timelineRef = useRef(null);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverX, setHoverX] = useState(0);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);

  // 2. A-B Segment Looping
  const [loopA, setLoopA] = useState(null);
  const [loopB, setLoopB] = useState(null);
  const [loopActive, setLoopActive] = useState(false);

  // 3. Hold-to-2x Speed
  const [isHolding2x, setIsHolding2x] = useState(false);
  const hold2xTimer = useRef(null);
  const prevRateBefore2x = useRef(1);
  const didTriggerHold2x = useRef(false);

  // 4. Web Audio API
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const compressorRef = useRef(null);
  const [nightMode, setNightMode] = useState(() => {
    return localStorage.getItem("pfx-night-mode") === "true";
  });

  const initAudioNodes = () => {
    if (audioCtxRef.current || !videoRef.current) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaElementSource(videoRef.current);
      const gain = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();

      comp.threshold.value = nightMode ? -24 : 0;
      comp.knee.value = 30;
      comp.ratio.value = 12;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;

      gain.gain.value = volume > 1 ? volume : 1;

      source.connect(comp);
      comp.connect(gain);
      gain.connect(ctx.destination);

      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
      compressorRef.current = comp;
    } catch (e) {
      console.warn("Web Audio setup:", e);
    }
  };

  const toggleNightMode = () => {
    initAudioNodes();
    setNightMode((prev) => {
      const next = !prev;
      localStorage.setItem("pfx-night-mode", String(next));
      if (compressorRef.current) {
        compressorRef.current.threshold.value = next ? -24 : 0;
      }
      setChapterToast(next ? "🌙 Night Mode (Dialogue Boost)" : "☀️ Night Mode Off");
      setTimeout(() => setChapterToast(null), 2000);
      return next;
    });
  };

  const setPointA = () => {
    const cur = videoRef.current ? videoRef.current.currentTime : current;
    setLoopA(cur);
    if (loopB !== null && cur >= loopB) {
      setLoopB(null);
      setLoopActive(false);
    } else if (loopB !== null) {
      setLoopActive(true);
    }
    setChapterToast(`Loop A set: ${formatTime(cur)}`);
    setTimeout(() => setChapterToast(null), 2000);
  };

  const setPointB = () => {
    const cur = videoRef.current ? videoRef.current.currentTime : current;
    if (loopA !== null && cur <= loopA) {
      setLoopA(cur);
      setChapterToast(`Reset loop A: ${formatTime(cur)}`);
      setTimeout(() => setChapterToast(null), 2000);
      return;
    }
    setLoopB(cur);
    setLoopActive(true);
    setChapterToast(`Loop active: ${formatTime(loopA || 0)} → ${formatTime(cur)}`);
    setTimeout(() => setChapterToast(null), 2500);
  };

  const toggleClearLoop = () => {
    if (loopA !== null || loopB !== null) {
      setLoopA(null);
      setLoopB(null);
      setLoopActive(false);
      setLoopOpen(false);
      setChapterToast("Loop cleared");
      setTimeout(() => setChapterToast(null), 1800);
    } else {
      setPointA();
    }
  };

  const exportLoopClip = () => {
    if (loopA === null || loopB === null) return;
    window.dispatchEvent(
      new CustomEvent("pfx-export-clip", {
        detail: {
          start: loopA,
          end: loopB,
          label: "Loop_A-B",
        },
      })
    );
    if (onInfo) {
      onInfo();
    }
    setLoopOpen(false);
  };

  useEffect(() => {
    if (hoverTime === null) return;
    const pv = previewVideoRef.current;
    if (!pv) return;
    const timer = setTimeout(() => {
      try {
        pv.currentTime = Math.min(Math.max(0, hoverTime), duration || 1000);
      } catch (e) {}
    }, 50);
    return () => clearTimeout(timer);
  }, [hoverTime, duration]);

  const onPreviewSeeked = () => {
    const pv = previewVideoRef.current;
    const cv = previewCanvasRef.current;
    if (!pv || !cv) return;
    try {
      const ctx = cv.getContext("2d");
      if (ctx) {
        ctx.drawImage(pv, 0, 0, cv.width, cv.height);
      }
    } catch (e) {}
  };

  const handlePlayerMouseDown = (e) => {
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".group\\/timeline")) return;
    if (e.button !== 0) return;
    didTriggerHold2x.current = false;
    hold2xTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) {
        didTriggerHold2x.current = true;
        prevRateBefore2x.current = v.playbackRate;
        v.playbackRate = 2.0;
        setIsHolding2x(true);
      }
    }, 280);
  };

  const handlePlayerMouseUp = () => {
    if (hold2xTimer.current) clearTimeout(hold2xTimer.current);
    if (isHolding2x) {
      const v = videoRef.current;
      if (v) v.playbackRate = prevRateBefore2x.current || rate || 1;
      setIsHolding2x(false);
    }
  };

  const heatmapPath = useMemo(() => {
    if (!duration || duration <= 0) return "";
    const BUCKETS = 60;
    const bucketDur = duration / BUCKETS;
    const density = new Array(BUCKETS).fill(0.1);

    (timestamps || []).forEach((t) => {
      const b = Math.min(BUCKETS - 1, Math.max(0, Math.floor(t.seconds / bucketDur)));
      density[b] += 1.0;
      if (b > 0) density[b - 1] += 0.45;
      if (b < BUCKETS - 1) density[b + 1] += 0.45;
      if (b > 1) density[b - 2] += 0.2;
      if (b < BUCKETS - 2) density[b + 2] += 0.2;
    });

    density[0] += 0.3;
    density[1] += 0.15;

    const maxVal = Math.max(...density);
    const normalized = density.map((d) => (d / maxVal) * 16);

    let d = `M 0,18 L 0,${18 - normalized[0]}`;
    for (let i = 1; i < BUCKETS; i++) {
      const prevX = ((i - 1) / (BUCKETS - 1)) * 100;
      const prevY = 18 - normalized[i - 1];
      const curX = (i / (BUCKETS - 1)) * 100;
      const curY = 18 - normalized[i];
      const cpX1 = prevX + (curX - prevX) / 2;
      const cpX2 = cpX1;
      d += ` C ${cpX1},${prevY} ${cpX2},${curY} ${curX},${curY}`;
    }
    d += ` L 100,18 Z`;
    return d;
  }, [timestamps, duration]);

  const handleCaptureChapter = () => {
    const v = videoRef.current;
    const time = (v && v.currentTime) || current || 0;
    setChapterToast(`⏱️ Chapter captured · ${formatTime(time)}`);
    setTimeout(() => setChapterToast(null), 2500);
    if (onInfo) onInfo(true);
    window.dispatchEvent(
      new CustomEvent("pfx-capture-chapter", {
        detail: { time },
      })
    );
  };

  const chapters = buildChapters(timestamps, duration);
  const activeChapter = chapters.find((c) => current >= c.start && current < c.end);
  const activeChapterIdx = chapters.findIndex((c) => current >= c.start && current < c.end);

  const segments = buildTimelineSegments(timestamps, duration);
  const hoveredSegment =
    hoverTime !== null
      ? segments.find((s) => hoverTime >= s.start && hoverTime <= s.end) || segments[segments.length - 1]
      : null;

  const calculateTimelineFraction = (clientX) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  };

  const handleTimelineSeek = (clientX) => {
    if (!duration) return;
    const frac = calculateTimelineFraction(clientX);
    seekTo(frac * duration);
  };

  const handleTimelineMouseDown = (e) => {
    e.preventDefault();
    setIsDraggingTimeline(true);
    handleTimelineSeek(e.clientX);
  };

  const handleTimelineMouseMove = (e) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    setHoverX(x);
    setHoverTime((x / rect.width) * duration);
    if (isDraggingTimeline) {
      handleTimelineSeek(e.clientX);
    }
  };

  const handleTimelineMouseLeave = () => {
    if (!isDraggingTimeline) {
      setHoverTime(null);
    }
  };

  useEffect(() => {
    if (!isDraggingTimeline) return;
    const onMove = (e) => {
      handleTimelineSeek(e.clientX);
      if (timelineRef.current && duration) {
        const rect = timelineRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        setHoverX(x);
        setHoverTime((x / rect.width) * duration);
      }
    };
    const onUp = () => {
      setIsDraggingTimeline(false);
      setHoverTime(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDraggingTimeline, duration]);

  useEffect(() => {
    hasAutoResumed.current = false;
    pendingSeekRef.current = null;
    setResumedToast(false);
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    setCurrent(0);
    setPlaying(false);
    setErrorState(null);
    setCountdown(null);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
  }, [sceneId]);

  useEffect(() => {
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, []);

  // Probe for a sidecar caption file; the CC button only appears when one exists.
  useEffect(() => {
    let cancelled = false;
    setHasSubs(false);
    fetch(subtitleUrl(sceneId))
      .then((res) => {
        if (!cancelled) setHasSubs(res.ok);
      })
      .catch(() => {
        if (!cancelled) setHasSubs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  const applySubsMode = () => {
    const track = videoRef.current?.textTracks?.[0];
    if (track) track.mode = subsOn ? "showing" : "disabled";
  };

  useEffect(() => {
    applySubsMode();
  }, [subsOn, hasSubs, sceneId]);

  const toggleSubs = () => {
    setSubsOn((prev) => {
      persistPrefs({ subs: !prev });
      return !prev;
    });
  };

  // Whisper transcription: generate a sidecar .en.vtt, then enable the track.
  const refreshSubs = () => {
    fetch(subtitleUrl(sceneId))
      .then((res) => {
        if (res.ok) {
          setHasSubs(true);
          setCcJob(null);
          if (ccPoll.current) clearInterval(ccPoll.current);
        }
      })
      .catch(() => {});
  };
  const startTranscribe = (force = false) => {
    api
      .transcribeScene(sceneId, force)
      .then((res) => {
        const job = res?.job || res;
        setCcJob(job);
        if (job?.state === "done" && job?.has_sidecar) {
          refreshSubs();
          return;
        }
        if (ccPoll.current) clearInterval(ccPoll.current);
        ccPoll.current = setInterval(() => {
          api
            .transcribeJob(sceneId)
            .then((j) => {
              setCcJob(j);
              if (j?.state === "done" || j?.state === "error") {
                clearInterval(ccPoll.current);
                if (j?.state === "done" && (j?.has_sidecar || j?.has_sidecar === undefined)) refreshSubs();
                else if (j?.has_sidecar) refreshSubs();
              }
            })
            .catch(() => clearInterval(ccPoll.current));
        }, 3000);
      })
      .catch(() => setCcJob({ state: "error", message: "request failed" }));
  };
  useEffect(() => () => ccPoll.current && clearInterval(ccPoll.current), [sceneId]);

  // Transcript edits rewrite the sidecar files; force <track> to reload.
  useEffect(() => {
    setSubsRev(0);
    const onSubsChanged = (e) => {
      if (e?.detail?.sceneId === sceneId) {
        setSubsRev((r) => r + 1);
        refreshSubs();
      }
    };
    window.addEventListener("pfx-subs-changed", onSubsChanged);
    return () => window.removeEventListener("pfx-subs-changed", onSubsChanged);
  }, [sceneId]);

  const toggleAutoplay = () => {
    setAutoplay((prev) => {
      const next = !prev;
      localStorage.setItem("pfx-autoplay", String(next));
      return next;
    });
  };

  // Recommendations overlay: manual toggle + persisted auto-show preference.
  const toggleUpNext = () => {
    if (!recs || recs.length === 0) return;
    setUpNextOpen((v) => {
      if (!v) setVisible(true);
      return !v;
    });
  };
  const toggleUpNextAuto = () => {
    setUpNextAuto((prev) => {
      const next = !prev;
      localStorage.setItem("pfx-upnext-auto", String(next));
      return next;
    });
  };
  const replayUpNext = () => {
    setUpNextOpen(false);
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    setCurrent(0);
    v.play().catch(() => {});
    setPlaying(true);
  };

  // New scene: dismiss the end screen.
  useEffect(() => {
    setUpNextOpen(false);
  }, [sceneId]);

  // Heartbeat extends the open play segment so crashes/sleeps stay bounded.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => logWatch("heartbeat"), 15000);
    return () => clearInterval(t);
  }, [playing, sceneId]);

  // Close the open segment when leaving the scene while playing.
  useEffect(() => {
    return () => {
      if (wasPlayingForLog.current) {
        wasPlayingForLog.current = false;
        const v = videoRef.current;
        api
          .logWatchEvent(
            sceneId,
            "pause",
            v ? v.currentTime || 0 : 0,
            (v && v.duration) || 0
          )
          .catch(() => {});
      }
    };
  }, [sceneId]);

  const handleEnded = () => {
    setPlaying(false);
    wasPlayingForLog.current = false;
    logWatch("ended");
    const v = videoRef.current;
    const dur = (v && v.duration) || duration || 0;
    api.saveProgress(sceneId, dur, dur).catch(() => {});
    // End screen: ranked recommendations, like YouTube (sits under the
    // autoplay countdown modal when autoplay is on).
    if (upNextAuto && recs && recs.length > 0) {
      setUpNextOpen(true);
      setVisible(true);
    }

    if (autoplay && onNext) {
      setCountdown(5);
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      countdownTimer.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(countdownTimer.current);
            onNext();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  useEffect(() => {
    if (seekRequest != null) {
      pendingSeekRef.current = seekRequest;
      seekTo(seekRequest);
    }
  }, [seekRequest]);

  const showControls = () => {
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !rateOpen && !volumeOpen && !loopOpen) {
        setVisible(false);
      }
    }, 3200);
  };

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    const onPipLeave = () => setPipActive(false);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("leavepictureinpicture", onPipLeave);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("leavepictureinpicture", onPipLeave);
      clearTimeout(hideTimer.current);
    };
  }, []);

  const togglePlay = () => {
    if (didTriggerHold2x.current) {
      didTriggerHold2x.current = false;
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    initAudioNodes();
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
      setVisible(true);
    }
  };

  const seekBy = (delta) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  };

  const seekTo = (t) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapRef.current?.requestFullscreen?.();
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    persistPrefs({ muted: v.muted });
  };

  const applyRate = (r) => {
    const v = videoRef.current;
    setRate(r);
    if (v) v.playbackRate = r;
    persistPrefs({ rate: r });
    setRateOpen(false);
  };

  const prevChapter = () => {
    if (chapters.length === 0) return;
    const i = activeChapterIdx;
    if (i < 0) {
      seekTo(chapters[0].start);
      return;
    }
    if (current - chapters[i].start > 3 && i > 0) seekTo(chapters[i].start);
    else if (i > 0) seekTo(chapters[i - 1].start);
    else seekTo(chapters[0].start);
  };

  const nextChapter = () => {
    if (chapters.length === 0) return;
    const i = activeChapterIdx;
    const target = i < 0 ? chapters.find((c) => c.start > current) : chapters[i + 1];
    if (target) seekTo(target.start);
  };

  const skipChapter = () => {
    if (activeChapter) seekTo(activeChapter.end);
  };

  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPipActive(false);
      } else if (document.pictureInPictureEnabled && v.requestPictureInPicture) {
        await v.requestPictureInPicture();
        setPipActive(true);
      }
    } catch (e) {
      console.error("pip failed", e);
    }
  };

  const onError = () => {
    const v = videoRef.current;
    if (!v) return;
    setErrorState({
      code: v.error && v.error.code,
      message: v.error && v.error.message ? v.error.message : "The video could not be played.",
    });
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    if (onProgress) onProgress(v.currentTime);

    if (loopActive && loopA !== null && loopB !== null && loopB > loopA) {
      if (v.currentTime >= loopB || v.currentTime < loopA - 0.5) {
        v.currentTime = loopA;
        setCurrent(loopA);
      }
    }

    const now = Date.now();
    if (now - lastReport.current > 4000) {
      lastReport.current = now;
      api.saveProgress(sceneId, v.currentTime, v.duration || 0).catch(() => {});
    }
  };

  const onLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;
    applySubsMode();
    // Deep-link (tagged chapter) wins over saved resume position.
    if (pendingSeekRef.current != null) {
      const t = pendingSeekRef.current;
      pendingSeekRef.current = null;
      hasAutoResumed.current = true;
      v.currentTime = Math.max(0, Math.min(v.duration || t, t));
      setCurrent(v.currentTime);
      v.play().catch(() => {});
      setPlaying(true);
      return;
    }
    // Automatic resume: always seek to the saved position, no prompt.
    if (initialTime && initialTime > 5 && initialTime < (v.duration || Infinity) - 5) {
      hasAutoResumed.current = true;
      v.currentTime = initialTime;
      setCurrent(initialTime);
      v.play().catch(() => {});
      setPlaying(true);
      setResumedToast(true);
      setTimeout(() => setResumedToast(false), 3000);
    } else {
      v.play().catch(() => {});
      setPlaying(true);
    }
  };

  // Covers the case where tracking arrives after metadata is already loaded.
  useEffect(() => {
    if (hasAutoResumed.current) return;
    const v = videoRef.current;
    if (!v || !initialTime || initialTime <= 5) return;
    if (v.duration && initialTime >= v.duration - 5) return;

    hasAutoResumed.current = true;
    v.currentTime = initialTime;
    setCurrent(initialTime);
    v.play().catch(() => {});
    setPlaying(true);
    setResumedToast(true);
    const timer = setTimeout(() => setResumedToast(false), 3000);
    return () => clearTimeout(timer);
  }, [initialTime, sceneId]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (errorState) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          setErrorState(null);
          setRetryNonce((n) => n + 1);
        }
        return;
      }
      if ((e.key === "Escape" || e.key === "Backspace") && !document.fullscreenElement) {
        e.preventDefault();
        if (onBack) onBack();
        else navigate(ROUTES.LIBRARY);
        return;
      }
      if (e.key === "Enter") {
        onRandom && onRandom();
      }
      const k = matchBinding.bind(null, e, bindings);
      if (e.shiftKey && e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(30);
      } else if (e.shiftKey && e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(-30);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "ArrowRight") {
        e.preventDefault();
        nextChapter();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "ArrowLeft") {
        e.preventDefault();
        prevChapter();
      } else if (k("playPause")) {
        e.preventDefault();
        togglePlay();
      } else if (k("seekFwd")) {
        e.preventDefault();
        seekBy(10);
      } else if (k("seekBack")) {
        e.preventDefault();
        seekBy(-10);
      } else if (k("fullscreen")) {
        toggleFullscreen();
      } else if (k("mute")) {
        toggleMute();
      } else if (k("pip")) {
        togglePip();
      } else if (k("subtitles")) {
        e.preventDefault();
        if (hasSubs) toggleSubs();
      } else if (k("info")) {
        onInfo && onInfo();
      } else if (k("bookmarkChapter") || (e.key === "c" && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        handleCaptureChapter();
      } else if (k("loopA") || e.key === "[") {
        e.preventDefault();
        setPointA();
      } else if (k("loopB") || e.key === "]") {
        e.preventDefault();
        setPointB();
      } else if (k("clearLoop") || e.key === "\\") {
        e.preventDefault();
        toggleClearLoop();
      } else if (k("speedUp") || (e.shiftKey && e.key === ">") || e.key === ".") {
        e.preventDefault();
        const newRate = Math.min(4, Math.round((rate + 0.25) * 100) / 100);
        applyRate(newRate);
        setChapterToast(`⚡ ${newRate}×`);
        setTimeout(() => setChapterToast(null), 1400);
      } else if (k("speedDown") || (e.shiftKey && e.key === "<") || e.key === ",") {
        e.preventDefault();
        const newRate = Math.max(0.25, Math.round((rate - 0.25) * 100) / 100);
        applyRate(newRate);
        setChapterToast(`⚡ ${newRate}×`);
        setTimeout(() => setChapterToast(null), 1400);
      } else if (
        k("randomScene") ||
        ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.altKey && !e.metaKey)
      ) {
        e.preventDefault();
        onRandom && onRandom();
      } else if (k("next")) {
        e.preventDefault();
        onNext && onNext();
      } else if (k("prev")) {
        e.preventDefault();
        onPrev && onPrev();
      } else if (k("upNext")) {
        e.preventDefault();
        toggleUpNext();
      } else if (
        ["1", "2", "3", "4"].includes(e.key) &&
        !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
      ) {
        // Watch-status shortcuts (mirrors the panel's 1-4 kbd chips).
        e.preventDefault();
        const statusMap = { 1: "want-to-watch", 2: "watching", 3: "watched", 4: "skip" };
        onStatusKey && onStatusKey(statusMap[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sceneId, onNext, onPrev, onRandom, onInfo, onBack, onStatusKey, errorState, bindings, rate, loopA, loopB, loopActive, hasSubs]);

  const onVolume = (val) => {
    const v = videoRef.current;
    setVolume(val);
    persistPrefs({ volume: Math.min(1, val) });
    initAudioNodes();
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    if (v) {
      v.volume = Math.min(1, Math.max(0, val));
      if (val > 0 && v.muted) {
        v.muted = false;
        setMuted(false);
        persistPrefs({ muted: false });
      }
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = val > 1 ? val : 1;
    }
  };

  const chapterDisplayColor = activeChapter
    ? chapterColor(activeChapter.category, Math.max(0, activeChapterIdx))
    : "#94a3b8";

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full bg-black overflow-hidden select-none font-sans text-zinc-100"
      onMouseMove={showControls}
      onMouseDown={handlePlayerMouseDown}
      onMouseUp={handlePlayerMouseUp}
      onMouseLeave={() => {
        handlePlayerMouseUp();
        if (playing && !rateOpen && !volumeOpen && !loopOpen) setVisible(false);
      }}
    >
      <video
        ref={videoRef}
        src={retryNonce ? `${videoUrl(sceneId)}?r=${retryNonce}` : videoUrl(sceneId)}
        className="w-full h-full object-contain"
        onPlay={() => {
          setPlaying(true);
          wasPlayingForLog.current = true;
          initAudioNodes();
          logWatch("play");
        }}
        onPause={() => {
          setPlaying(false);
          if (wasPlayingForLog.current) {
            wasPlayingForLog.current = false;
            logWatch("pause");
          }
        }}
        onSeeked={() => logWatch("seek")}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoaded}
        onEnded={handleEnded}
        onError={onError}
        onClick={togglePlay}
      >
        {hasSubs && (
          <track
            key={`${sceneId}-${subsRev}`}
            kind="subtitles"
            src={subsRev ? `${subtitleUrl(sceneId)}?v=${subsRev}` : subtitleUrl(sceneId)}
            srcLang="en"
            label="English"
          />
        )}
      </video>

      <video
        ref={previewVideoRef}
        src={videoUrl(sceneId)}
        preload="auto"
        muted
        className="hidden pointer-events-none"
        onSeeked={onPreviewSeeked}
      />

      {/* 2X Speed HUD */}
      {isHolding2x && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-950/85 border border-white/15 text-accent text-xs font-mono font-bold tracking-wider backdrop-blur-md shadow-lg pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
          <span>2.0× SPEED</span>
        </div>
      )}

      {!visible && (
        <div className="absolute inset-0 cursor-none" onClick={togglePlay} />
      )}

      {/* Standardized Modal Dialogs */}
      {countdown !== null && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-zinc-950/90 border border-white/10 shadow-2xl max-w-xs text-center">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500">
              Autoplay
            </span>
            <div className="text-3xl font-mono font-bold text-accent">
              {countdown}s
            </div>
            <div className="text-xs text-zinc-300">
              Playing next scene automatically
            </div>
            <div className="flex items-center gap-2 mt-1 w-full">
              <button
                onClick={() => {
                  if (countdownTimer.current) clearInterval(countdownTimer.current);
                  setCountdown(null);
                  onNext && onNext();
                }}
                className="flex-1 bg-accent text-zinc-950 py-1.5 rounded-xl font-mono text-xs font-bold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
              >
                Play Now
              </button>
              <button
                onClick={() => {
                  if (countdownTimer.current) clearInterval(countdownTimer.current);
                  setCountdown(null);
                }}
                className="flex-1 bg-white/5 hover:bg-white/10 text-zinc-300 py-1.5 rounded-xl font-mono text-xs border border-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations end screen (auto-shows at video end) */}
      {upNextOpen && recs && recs.length > 0 && (
        <UpNextOverlay
          recs={recs}
          onClose={() => setUpNextOpen(false)}
          onReplay={replayUpNext}
          autoShow={upNextAuto}
          onToggleAutoShow={toggleUpNextAuto}
        />
      )}

      {errorState && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-zinc-950/90 border border-white/10 shadow-2xl max-w-sm text-center">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500">
              Playback Interrupted
            </span>
            <div className="text-xs text-zinc-300 leading-relaxed">
              {errorState.message}
            </div>
            <button
              onClick={() => {
                setErrorState(null);
                setRetryNonce((n) => n + 1);
              }}
              className="mt-2 w-full bg-accent text-zinc-950 py-2 rounded-xl font-mono text-xs font-bold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
            >
              Retry
            </button>
            <span className="text-[10px] text-zinc-500 font-mono">Press Enter to retry</span>
          </div>
        </div>
      )}

      {/* Standardized Transient HUD Pill */}
      {(resumedToast || chapterToast) && (
        <div
          className="absolute top-14 left-1/2 -translate-x-1/2 z-40 bg-zinc-950/85 border border-white/15 px-3.5 py-1.5 rounded-full backdrop-blur-md shadow-xl flex items-center gap-2 text-xs font-mono text-zinc-200 pointer-events-none"
          onClick={(e) => e.stopPropagation()}
        >
          {resumedToast ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
              <span>Resumed at {formatTime(initialTime || current)}</span>
            </>
          ) : (
            <span>{chapterToast}</span>
          )}
        </div>
      )}

      {/* 1. Top Minimal Header */}
      <header
        className={`absolute top-0 left-0 right-0 px-4 sm:px-6 py-3.5 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/30 to-transparent transition-opacity duration-300 z-30 ${
          visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onBack) onBack();
              else navigate(-1);
            }}
            className="h-8 px-2.5 rounded-xl bg-zinc-950/50 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer backdrop-blur-md"
            title="Back (Esc / Backspace)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </button>

          {onRandom && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRandom();
              }}
              className="h-8 w-8 rounded-xl bg-zinc-950/50 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 transition-colors inline-flex items-center justify-center cursor-pointer backdrop-blur-md"
              title={`Surprise Me (${displayBinding(bindings.randomScene || "Shift+R")})`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                <circle cx="16" cy="16" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              </svg>
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(
                new CustomEvent("pfx-dock-miniplayer", {
                  detail: { sceneId, currentTime: current },
                })
              );
              if (onBack) onBack();
              else navigate(ROUTES.LIBRARY);
            }}
            className="h-8 px-2.5 rounded-xl bg-zinc-950/50 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 text-xs font-mono transition-colors inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-md"
            title="Dock to Floating Mini Player"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <rect x="12" y="10" width="8" height="5" rx="1" fill="currentColor" />
            </svg>
            <span className="hidden md:inline">Mini Player</span>
          </button>

          {activeChapter && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-xl bg-zinc-950/40 border border-white/10 backdrop-blur-md text-xs">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: chapterDisplayColor }}
              />
              <span className="text-zinc-200 truncate max-w-xs font-medium">
                {activeChapter.label}
              </span>
              {activeChapter.category && activeChapter.category !== "main" && (
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-400">
                  {activeChapter.category}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-xl bg-zinc-950/50 border border-white/10 backdrop-blur-md font-mono text-xs text-zinc-400">
            <span className="text-zinc-200">{formatTime(current)}</span>
            <span className="text-zinc-600 mx-1">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </header>

      {/* Skip Chapter Minimal Badge */}
      {visible && activeChapter && activeChapter.category !== "main" && activeChapter.end - current > 5 && (
        <button
          onClick={skipChapter}
          className="absolute bottom-32 right-6 sm:right-8 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950/80 hover:bg-zinc-900 border border-white/15 backdrop-blur-md text-xs font-mono text-zinc-300 hover:text-white shadow-xl transition-all active:scale-95 cursor-pointer"
        >
          <span>Skip {activeChapter.category}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* 2. Bottom Floating Island Dock */}
      <footer
        className={`absolute bottom-5 left-1/2 -translate-x-1/2 w-[94%] max-w-4xl z-30 transition-all duration-300 ${
          visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-3 pointer-events-none"
        }`}
      >
        <div className="p-3 rounded-2xl bg-zinc-950/85 backdrop-blur-xl border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.8)] flex flex-col gap-2.5">
          {/* Chapter Overview & Remaining Time Row */}
          <div className="flex items-center justify-between text-xs px-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {activeChapter ? (
                <>
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: chapterDisplayColor }}
                  />
                  <span className="text-xs font-semibold text-zinc-200 truncate max-w-[200px] sm:max-w-md">
                    {activeChapter.label || "Chapter"}
                  </span>
                  {activeChapterIdx >= 0 && chapters.length > 1 && (
                    <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
                      {activeChapterIdx + 1} of {chapters.length}
                    </span>
                  )}
                  {activeChapter.category && activeChapter.category !== "main" && (
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-zinc-400 hidden sm:inline">
                      {activeChapter.category}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-zinc-400 font-mono">PersonalFlix Player</span>
              )}
            </div>

            <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 flex-shrink-0">
              <span className="text-zinc-200 font-semibold">{formatTime(current)}</span>
              <span className="text-zinc-600">/</span>
              <span>{formatTime(duration)}</span>
              {activeChapter && activeChapter.end > current && (
                <span className="text-zinc-500 text-[10px] hidden md:inline ml-1">
                  · {formatTime(activeChapter.end - current)} left
                </span>
              )}
            </div>
          </div>

          {/* Attention Heatmap & Refined Timeline */}
          <div
            ref={timelineRef}
            onMouseDown={handleTimelineMouseDown}
            onMouseMove={handleTimelineMouseMove}
            onMouseLeave={handleTimelineMouseLeave}
            className="relative flex flex-col justify-end pt-2 pb-1 cursor-pointer group/timeline select-none w-full"
          >
            {/* Live Hover Scrubbing Preview */}
            {hoverTime !== null && (
              <div
                className="pointer-events-none absolute bottom-9 z-40 flex flex-col items-center -translate-x-1/2 transition-transform duration-75"
                style={{
                  left: `${Math.max(
                    110,
                    Math.min((timelineRef.current?.clientWidth || 400) - 110, hoverX)
                  )}px`,
                }}
              >
                <div className="relative w-52 aspect-video rounded-xl overflow-hidden bg-zinc-950 shadow-2xl border border-white/15 flex flex-col justify-between">
                  <canvas
                    ref={previewCanvasRef}
                    width={320}
                    height={180}
                    className="absolute inset-0 w-full h-full object-cover"
                  />

                  <div className="relative z-10 p-2 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between gap-1 text-[10px]">
                    {hoveredSegment?.label ? (
                      <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-zinc-200 truncate max-w-full font-medium">
                        {hoveredSegment.label}
                      </span>
                    ) : (
                      <span className="text-zinc-400 font-mono">Preview</span>
                    )}
                  </div>

                  <div className="relative z-10 p-2 bg-gradient-to-t from-black/90 to-transparent flex items-end justify-between text-[10px] font-mono">
                    <span className="text-accent font-bold bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded">
                      {formatTime(hoverTime)}
                    </span>
                    {hoveredSegment && (
                      <span className="text-zinc-400">
                        {formatTime(hoveredSegment.start)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-2 h-2 bg-zinc-950 border-r border-b border-white/20 rotate-45 -mt-1" />
              </div>
            )}

            {/* Hover Vertical Line */}
            {hoverTime !== null && (
              <div
                className="pointer-events-none absolute top-0 bottom-1 w-[1.5px] bg-white/40 z-20"
                style={{ left: `${hoverX}px` }}
              />
            )}

            {/* Subdued Heatmap */}
            {heatmapPath && (
              <div className="w-full h-3.5 mb-0.5 overflow-hidden pointer-events-none opacity-30 group-hover/timeline:opacity-65 transition-opacity">
                <svg viewBox="0 0 100 18" preserveAspectRatio="none" className="w-full h-full">
                  <defs>
                    <linearGradient id="pfxHeatmapGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d4d4d8" stopOpacity="0.7" />
                      <stop offset="100%" stopColor="#d4d4d8" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={heatmapPath} fill="url(#pfxHeatmapGrad)" />
                </svg>
              </div>
            )}

            {/* Continuous Track with A-B overlays & Chapter Ticks */}
            <div className="relative w-full flex items-center py-1">
              {/* Loop A marker */}
              {duration > 0 && loopA !== null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-accent z-30 pointer-events-none"
                  style={{ left: `${(loopA / duration) * 100}%` }}
                >
                  <span className="absolute -top-3 -translate-x-1/2 text-[9px] font-mono font-bold text-accent bg-zinc-950 px-1 rounded border border-accent/40">
                    A
                  </span>
                </div>
              )}

              {/* Loop B marker */}
              {duration > 0 && loopB !== null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-accent z-30 pointer-events-none"
                  style={{ left: `${(loopB / duration) * 100}%` }}
                >
                  <span className="absolute -top-3 -translate-x-1/2 text-[9px] font-mono font-bold text-accent bg-zinc-950 px-1 rounded border border-accent/40">
                    B
                  </span>
                </div>
              )}

              {/* Loop shaded range */}
              {duration > 0 && loopA !== null && loopB !== null && loopB > loopA && (
                <div
                  className="absolute inset-y-1 bg-accent/20 border-y border-dashed border-accent/50 z-20 pointer-events-none"
                  style={{
                    left: `${(loopA / duration) * 100}%`,
                    width: `${((loopB - loopA) / duration) * 100}%`,
                  }}
                />
              )}

              {/* Track Bar */}
              <div className="relative w-full h-1.5 group-hover/timeline:h-2 transition-all duration-150 rounded-full overflow-hidden bg-white/15">
                {/* Hover preview fill */}
                {hoverTime !== null && duration > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 bg-white/15 pointer-events-none"
                    style={{ width: `${Math.min(100, Math.max(0, (hoverTime / duration) * 100))}%` }}
                  />
                )}

                {/* Progress fill */}
                <div
                  className="h-full bg-accent transition-all duration-75 rounded-r-sm"
                  style={{
                    width: `${Math.min(100, Math.max(0, duration > 0 ? (current / duration) * 100 : 0))}%`,
                  }}
                />

                {/* Chapter dividers */}
                {duration > 0 && chapters.map((c, i) => {
                  const left = (c.start / duration) * 100;
                  const width = ((c.end - c.start) / duration) * 100;
                  const color = chapterColor(c.category, i);
                  return (
                    <React.Fragment key={c._id || i}>
                      <div
                        className="absolute bottom-0 h-[1.5px] pointer-events-none opacity-60"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          backgroundColor: color,
                        }}
                      />
                      {i > 0 && (
                        <div
                          className="absolute inset-y-0 w-[1.5px] bg-zinc-950 pointer-events-none z-10"
                          style={{ left: `${left}%` }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Minimal Playhead Knob */}
              <div
                className={`pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white ring-2 ring-accent transition-transform duration-100 z-30 ${
                  isDraggingTimeline
                    ? "scale-125"
                    : "scale-0 group-hover/timeline:scale-100"
                }`}
                style={{
                  left: `${Math.min(
                    100,
                    Math.max(0, (current / (duration || 1)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Unified Controls Dock Row */}
          <div className="flex items-center justify-between pt-0.5">
            {/* Left: Primary Transport Row */}
            <div className="flex items-center gap-1 sm:gap-2">
              {onPrev && (
                <button
                  onClick={onPrev}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title={`Previous scene (${displayBinding(bindings.prev)})`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 5h2.5v14H6zM19 5v14L9.5 12z" />
                  </svg>
                </button>
              )}

              {chapters.length > 0 && (
                <button
                  onClick={prevChapter}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Previous chapter"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 5h2v14H6zM20 5v14L9 12z" />
                  </svg>
                </button>
              )}

              <button
                onClick={() => seekBy(-30)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors text-[11px] font-mono font-semibold cursor-pointer"
                title="Back 30s"
              >
                -30s
              </button>

              <div className="px-1">
                <PlayPauseButton playing={playing} onToggle={togglePlay} size={38} />
              </div>

              <button
                onClick={() => seekBy(30)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors text-[11px] font-mono font-semibold cursor-pointer"
                title="Forward 30s"
              >
                +30s
              </button>

              {chapters.length > 0 && (
                <button
                  onClick={nextChapter}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Next chapter"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
                  </svg>
                </button>
              )}

              {onNext && (
                <button
                  onClick={onNext}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title={`Next scene (${displayBinding(bindings.next)})`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.5 5H18v14h-2.5zM5 5v14l9.5-7z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Right: Secondary Compact Controls */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* Bookmark Chapter */}
              <button
                onClick={handleCaptureChapter}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-accent hover:bg-white/10 transition-colors cursor-pointer"
                title={`Bookmark Chapter at current time (${displayBinding(bindings.bookmarkChapter || "c")})`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  <line x1="12" y1="7" x2="12" y2="13" />
                  <line x1="9" y1="10" x2="15" y2="10" />
                </svg>
              </button>

              {/* A-B Loop Popover Button */}
              <div className="relative">
                <button
                  onClick={() => {
                    if (loopA === null) {
                      setPointA();
                    } else if (loopB === null) {
                      setPointB();
                    } else {
                      setLoopOpen((v) => !v);
                    }
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-mono transition-colors cursor-pointer border ${
                    loopActive
                      ? "bg-accent/15 text-accent border-accent/40 font-bold"
                      : loopA !== null
                      ? "bg-white/10 text-accent border-accent/30"
                      : "text-zinc-400 hover:text-white hover:bg-white/10 border-transparent"
                  }`}
                  title={
                    loopActive
                      ? `Loop: ${formatTime(loopA)} → ${formatTime(loopB)} (Click for loop options)`
                      : loopA !== null
                      ? `Loop A set at ${formatTime(loopA)}. Click to set B`
                      : "Set A-B Loop"
                  }
                >
                  {loopActive ? (
                    <span className="flex items-center gap-1">
                      <span>A⇄B</span>
                      <span className="text-[9px] opacity-70">▾</span>
                    </span>
                  ) : loopA !== null ? (
                    `A ${formatTime(loopA)}`
                  ) : (
                    "A/B"
                  )}
                </button>

                {loopOpen && loopActive && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setLoopOpen(false)} />
                    <div className="absolute bottom-full right-0 mb-2 w-48 bg-zinc-950/95 border border-white/10 rounded-xl shadow-2xl z-50 p-2.5 backdrop-blur-xl flex flex-col gap-2 font-mono text-xs">
                      <div className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">
                        A-B Loop Range
                      </div>
                      <div className="flex items-center justify-between text-zinc-300 bg-white/5 px-2 py-1 rounded border border-white/5">
                        <span>A: {formatTime(loopA)}</span>
                        <span>B: {formatTime(loopB)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={exportLoopClip}
                          className="flex-1 bg-white/10 hover:bg-white/20 text-accent py-1 rounded text-center transition-colors cursor-pointer"
                        >
                          Export Clip
                        </button>
                        <button
                          type="button"
                          onClick={toggleClearLoop}
                          className="flex-1 bg-white/5 hover:bg-rose-500/20 text-zinc-300 hover:text-rose-300 py-1 rounded text-center transition-colors cursor-pointer"
                        >
                          Clear Loop
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Volume & Night Mode Popover */}
              <div className="relative">
                <button
                  onClick={() => setVolumeOpen((v) => !v)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Volume & Audio Settings"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    {muted || volume === 0 ? (
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.9-2.9-1.4-1.4-2.9 2.9-2.9-2.9-1.4 1.4 2.9 2.9-2.9 2.9 1.4 1.4 2.9-2.9 2.9 2.9 1.4-1.4-2.9-2.9z" />
                    ) : (
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zm-2.5 7.2v2.1A7 7 0 0 0 20.5 12 7 7 0 0 0 14 5.7v2.1a5 5 0 0 1 0 8.4z" />
                    )}
                  </svg>
                </button>

                {volumeOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setVolumeOpen(false)} />
                    <div className="absolute bottom-full right-0 mb-2 w-48 bg-zinc-950/95 border border-white/10 rounded-xl shadow-2xl z-50 p-3 backdrop-blur-xl flex flex-col gap-2.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <button
                          onClick={toggleMute}
                          className="text-zinc-400 hover:text-white cursor-pointer"
                        >
                          {muted ? "Unmute" : "Mute"}
                        </button>
                        <span className={`font-bold ${volume > 1 ? "text-amber-400" : "text-zinc-200"}`}>
                          {Math.round(volume * 100)}%
                        </span>
                      </div>

                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={volume}
                        onChange={(e) => onVolume(parseFloat(e.target.value))}
                        className="w-full accent-accent h-1.5 bg-white/10 rounded cursor-pointer"
                      />

                      <div className="flex items-center justify-between pt-1 border-t border-white/10 text-xs">
                        <span className="text-zinc-400 text-[11px]">Night Mode</span>
                        <button
                          onClick={toggleNightMode}
                          className={`px-2 py-0.5 rounded text-xs font-mono transition-colors cursor-pointer border ${
                            nightMode
                              ? "bg-amber-400/20 text-amber-300 border-amber-400/30"
                              : "bg-white/5 text-zinc-400 border-white/10 hover:text-white"
                          }`}
                        >
                          {nightMode ? "ON" : "OFF"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Recommendations / Up-Next Toggle (YouTube-style) */}
              <button
                onClick={toggleUpNext}
                disabled={!recs || recs.length === 0}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default ${
                  upNextOpen
                    ? "text-accent bg-accent/10 border border-accent/30"
                    : "text-zinc-400 hover:text-white hover:bg-white/10 border border-transparent"
                }`}
                title={`Recommendations (U)${upNextAuto ? " — auto-show at end ON" : ""}`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="13" height="16" rx="2" />
                  <line x1="18" y1="8" x2="21" y2="8" strokeLinecap="round" />
                  <line x1="18" y1="12" x2="21" y2="12" strokeLinecap="round" />
                  <line x1="18" y1="16" x2="19.5" y2="16" strokeLinecap="round" />
                </svg>
              </button>

              {/* Autoplay Status Toggle */}
              <button
                onClick={toggleAutoplay}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono transition-colors cursor-pointer flex items-center gap-1.5 ${
                  autoplay
                    ? "text-accent bg-accent/10 border border-accent/30"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent"
                }`}
                title={`Autoplay: ${autoplay ? "ON" : "OFF"}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${autoplay ? "bg-accent" : "bg-zinc-600"}`} />
                <span className="hidden sm:inline font-semibold">AUTO</span>
              </button>

              {/* Playback Rate Popover */}
              <div className="relative">
                <button
                  onClick={() => setRateOpen((v) => !v)}
                  className="px-2 py-1 rounded-lg text-xs font-mono font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Playback Speed"
                >
                  {rate}×
                </button>
                {rateOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setRateOpen(false)} />
                    <div className="absolute bottom-full right-0 mb-2 w-24 bg-zinc-950/95 border border-white/10 rounded-xl shadow-2xl z-50 py-1 backdrop-blur-xl">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                        <button
                          key={r}
                          onClick={() => applyRate(r)}
                          className={`w-full text-center px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer ${
                            rate === r
                              ? "text-accent font-bold bg-accent/10"
                              : "text-zinc-400 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          {r}×
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Subtitles */}
              {hasSubs && (
                <button
                  onClick={toggleSubs}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    subsOn ? "text-accent bg-accent/10" : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                  title={`Subtitles (${displayBinding(bindings.subtitles || "t")})`}
                >
                  <svg width="17" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M10 10.5a2.5 2.5 0 0 0-4 2 2.5 2.5 0 0 0 4 2M17 10.5a2.5 2.5 0 0 0-4 2 2.5 2.5 0 0 0 4 2" strokeLinecap="round" />
                  </svg>
                </button>
              )}

              {/* Whisper captions: generate when no sidecar exists */}
              {!hasSubs && (
                <button
                  onClick={() => startTranscribe(false)}
                  disabled={ccJob && ["queued", "extracting", "transcribing"].includes(ccJob.state)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-mono ${
                    ccJob?.state === "error"
                      ? "text-rose-400 hover:text-rose-300 hover:bg-white/10"
                      : "text-zinc-400 hover:text-white hover:bg-white/10"
                  } disabled:opacity-60 disabled:cursor-wait`}
                  title={
                    ccJob && ["queued", "extracting", "transcribing"].includes(ccJob.state)
                      ? `Whisper: ${ccJob.state}${ccJob.message ? ` — ${ccJob.message}` : ""}`
                      : ccJob?.state === "error"
                      ? `Whisper failed: ${ccJob.message || "unknown"} (click to retry)`
                      : "Generate captions with local Whisper"
                  }
                >
                  <svg width="17" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M10 10.5a2.5 2.5 0 0 0-4 2 2.5 2.5 0 0 0 4 2M17 10.5a2.5 2.5 0 0 0-4 2 2.5 2.5 0 0 0 4 2" strokeLinecap="round" />
                  </svg>
                  {ccJob && ["queued", "extracting", "transcribing"].includes(ccJob.state) ? (
                    <span className="animate-pulse">{ccJob.state === "queued" ? "Queued…" : ccJob.state === "extracting" ? "Audio…" : "Whisper…"}</span>
                  ) : (
                    <span className="hidden sm:inline">+CC</span>
                  )}
                </button>
              )}

              {/* Whisper captions: re-generate when the transcript skips dialogue */}
              {hasSubs && (
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Re-generate captions with Whisper? This replaces the current transcript and can take several minutes."
                      )
                    )
                      startTranscribe(true);
                  }}
                  disabled={ccJob && ["queued", "extracting", "transcribing"].includes(ccJob.state)}
                  className="p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-white hover:bg-white/10 disabled:opacity-60 disabled:cursor-wait"
                  title={
                    ccJob && ["queued", "extracting", "transcribing"].includes(ccJob.state)
                      ? `Whisper: ${ccJob.state}${ccJob.message ? ` — ${ccJob.message}` : ""}`
                      : "Re-generate captions with local Whisper (uses Settings model)"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M10 10.5a2.5 2.5 0 0 0-4 2 2.5 2.5 0 0 0 4 2M17 10.5a2.5 2.5 0 0 0-4 2 2.5 2.5 0 0 0 4 2" strokeLinecap="round" />
                    <path d="M20 3v4h-4" strokeLinecap="round" />
                  </svg>
                  {ccJob && ["queued", "extracting", "transcribing"].includes(ccJob.state) ? (
                    <span className="animate-pulse">Whisper…</span>
                  ) : (
                    <span className="hidden sm:inline">CC↻</span>
                  )}
                </button>
              )}

              {/* PiP */}
              <button
                onClick={togglePip}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  pipActive ? "text-accent bg-accent/10" : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
                title="Picture-in-Picture"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <rect x="13" y="10" width="7" height="6" rx="1" fill="currentColor" stroke="none" />
                </svg>
              </button>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Fullscreen (F)"
              >
                {fullscreen ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}