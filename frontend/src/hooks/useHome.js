import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { api } from "../api/apiClient";

export function useHome() {
  // Content states
  const [continueList, setContinueList] = useState([]);
  const [recent, setRecent] = useState([]);
  const [unwatched, setUnwatched] = useState([]);
  const [favScenes, setFavScenes] = useState([]);
  const [watched, setWatched] = useState([]);
  const [performers, setPerformers] = useState([]);
  const [studios, setStudios] = useState([]);
  const [because, setBecause] = useState({ label: "", studioId: "", scenes: [] });
  const [randomPick, setRandomPick] = useState(null);

  // Hero carousel state
  const [heroIdx, setHeroIdx] = useState(0);
  const [isHeroHovered, setIsHeroHovered] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  // Auto-cycle hero banner
  const heroTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [cw, recentRes, unwRes, favs, watchedRes, rand, perfsRes, studsRes] =
          await Promise.all([
            api.continueWatching().catch(() => []),
            api.scenes({ page: 1, limit: 16, sort: "mtime" }).catch(() => ({ scenes: [] })),
            api.scenes({ page: 1, limit: 16, status: "unwatched" }).catch(() => ({ scenes: [] })),
            api.favorites("scene").catch(() => []),
            api.tracking({ status: "watched" }).catch(() => []),
            api.randomScene().catch(() => null),
            api.performers({ limit: 20 }).catch(() => []),
            api.studios().catch(() => []),
          ]);

        if (cancelled) return;

        const cwList = (cw || []).filter((t) => t.scene);
        const recentScenes = recentRes.scenes || [];
        const unwScenes = unwRes.scenes || [];
        const perfsList = Array.isArray(perfsRes)
          ? perfsRes
          : perfsRes.performers || [];
        const studsList = Array.isArray(studsRes) ? studsRes : [];

        setContinueList(cwList);
        setRecent(recentScenes);
        setUnwatched(unwScenes);
        setWatched(((watchedRes || []).filter((t) => t.scene) || []).slice(0, 16));
        setRandomPick(rand && rand._id ? rand : recentScenes[0] || null);

        // Sort performers by scene_count desc, prioritize those with image
        const sortedPerfs = [...perfsList]
          .sort((a, b) => (b.scene_count || 0) - (a.scene_count || 0))
          .slice(0, 18);
        setPerformers(sortedPerfs);

        setStudios(studsList.slice(0, 14));

        // Favorites details
        const favIds = (favs || []).slice(0, 16).map((f) => f.target_id);
        if (favIds.length > 0) {
          const details = await Promise.all(
            favIds.map((fid) => api.scene(fid).then((r) => r.scene).catch(() => null))
          );
          if (!cancelled) setFavScenes(details.filter(Boolean));
        }

        // Contextual recommendation: Because you watched...
        if (cwList.length > 0) {
          const counts = {};
          cwList.forEach((t) => {
            const sid = t.scene?.studio_id;
            if (sid) counts[sid] = (counts[sid] || 0) + 1;
          });
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          if (top) {
            const [studioId] = top;
            const seen = new Set(cwList.map((t) => String(t.scene._id)));
            const res = await api
              .scenes({ page: 1, limit: 16, studio: studioId })
              .catch(() => ({ scenes: [] }));
            const recs = (res.scenes || []).filter((s) => !seen.has(String(s._id))).slice(0, 14);
            if (recs.length > 0 && !cancelled) {
              setBecause({
                label: recs[0].studio || "Recommended",
                studioId,
                scenes: recs,
              });
            }
          }
        }
      } catch (e) {
        console.error("Home data load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Compute featured items pool for Hero Carousel (combines continue-watching & recent)
  const featuredScenes = useMemo(() => {
    const list = [];
    const seen = new Set();

    // Prioritize top continue watching scenes
    continueList.forEach((t) => {
      if (t.scene && !seen.has(t.scene._id)) {
        list.push({ ...t.scene, _tracking: t });
        seen.add(t.scene._id);
      }
    });

    // Add recent scenes
    recent.forEach((s) => {
      if (s && !seen.has(s._id)) {
        list.push(s);
        seen.add(s._id);
      }
    });

    return list.slice(0, 6);
  }, [continueList, recent]);

  const activeHero = featuredScenes[heroIdx % Math.max(1, featuredScenes.length)] || null;

  // Auto advance hero carousel every 8s when not hovered
  useEffect(() => {
    if (featuredScenes.length <= 1 || isHeroHovered) return;
    heroTimerRef.current = setInterval(() => {
      setHeroIdx((prev) => (prev + 1) % featuredScenes.length);
    }, 8000);

    return () => {
      if (heroTimerRef.current) clearInterval(heroTimerRef.current);
    };
  }, [featuredScenes.length, isHeroHovered]);

  const nextHero = useCallback(() => {
    setHeroIdx((prev) => (prev + 1) % Math.max(1, featuredScenes.length));
  }, [featuredScenes.length]);

  const prevHero = useCallback(() => {
    setHeroIdx((prev) => (prev - 1 + featuredScenes.length) % Math.max(1, featuredScenes.length));
  }, [featuredScenes.length]);

  const progressOf = (sceneId) => {
    const t = continueList.find((c) => c.scene_id === sceneId);
    if (!t || !t.scene) return 0;
    const dur = t.duration || t.scene.duration || 3600;
    return Math.min(100, Math.max(0, ((t.currentTime || 0) / dur) * 100));
  };

  const scrollToSection = (id) => {
    setActiveFilter(id);
    if (id === "all") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const element = document.getElementById(`section-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Active tracking for current hero (if continuing)
  const heroTracking = activeHero?._tracking || continueList.find((c) => c.scene_id === activeHero?._id);
  const heroProgress = activeHero ? progressOf(activeHero._id) : 0;

  return {
    continueList,
    recent,
    unwatched,
    favScenes,
    watched,
    performers,
    studios,
    because,
    randomPick,
    heroIdx,
    setHeroIdx,
    isHeroHovered,
    setIsHeroHovered,
    activeFilter,
    loading,
    featuredScenes,
    activeHero,
    nextHero,
    prevHero,
    progressOf,
    scrollToSection,
    heroTracking,
    heroProgress,
  };
}
