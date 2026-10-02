import { useState, useEffect } from "react";
import { api } from "../api/apiClient";

export const SMART_PRESETS = [
  {
    id: "unwatched_hd",
    title: "💎 Unwatched 1080p+",
    badge: "1080p+ Unwatched",
    desc: "Auto-synced unwatched scenes in Full HD (1080p) or 4K",
    query: async () => {
      const res = await api.scenes({ status: "unwatched", limit: 80 });
      return (res.scenes || []).filter((s) => {
        const r = (s.resolution || "").toLowerCase();
        return r.includes("1080") || r.includes("4k") || r.includes("2160") || (s.width && s.width >= 1920);
      });
    },
  },
  {
    id: "favorites_top",
    title: "⭐ Favorites & Best",
    badge: "Top Rated",
    desc: "All bookmarked favorite scenes and highest rated gems",
    query: async () => {
      const favs = await api.favorites("scene").catch(() => []);
      const favIds = new Set((favs || []).map((f) => f.target_id || f._id || f));
      const res = await api.scenes({ limit: 80 });
      return (res.scenes || []).filter((s) => favIds.has(s._id) || (s.rating && s.rating >= 4));
    },
  },
  {
    id: "long_marathons",
    title: "⏱️ Feature Length (30m+)",
    badge: "30+ Minutes",
    desc: "Long-duration scenes over 30 minutes for deep sessions",
    query: async () => {
      const res = await api.scenes({ limit: 100 });
      return (res.scenes || []).filter((s) => (s.duration || 0) >= 1800);
    },
  },
  {
    id: "quick_bites",
    title: "⚡ Quick Bites (< 10m)",
    badge: "< 10 Min Clips",
    desc: "Short teaser scenes and fast clips under 10 minutes",
    query: async () => {
      const res = await api.scenes({ limit: 100 });
      return (res.scenes || []).filter((s) => (s.duration || 0) > 0 && (s.duration || 0) <= 600);
    },
  },
  {
    id: "fresh_arrivals",
    title: "🔥 Recent Additions",
    badge: "Newest 30",
    desc: "The newest additions recently scanned into your library",
    query: async () => {
      const res = await api.scenes({ sort: "recent", limit: 30 });
      return res.scenes || [];
    },
  },
];

export function usePlaylists() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busyPreset, setBusyPreset] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  const load = () =>
    api
      .playlists()
      .then(setList)
      .catch(console.error)
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    await api.createPlaylist(name.trim(), desc.trim());
    setName("");
    setDesc("");
    load();
  };

  const createSmartPlaylist = async (preset) => {
    if (busyPreset) return;
    setBusyPreset(preset.id);
    setStatusMsg(`Generating "${preset.title}" smart playlist...`);
    try {
      const newPl = await api.createPlaylist(
        preset.title,
        `[Smart:${preset.id}] ${preset.desc}`
      );
      if (newPl?._id || newPl?.id) {
        const plId = newPl._id || newPl.id;
        const matchingScenes = await preset.query();
        if (matchingScenes.length > 0) {
          setStatusMsg(`Adding ${matchingScenes.length} matching scenes...`);
          await Promise.all(
            matchingScenes.map((s) => api.addToPlaylist(plId, s._id))
          );
        }
        setStatusMsg(`Smart playlist "${preset.title}" created with ${matchingScenes.length} scenes!`);
        setTimeout(() => setStatusMsg(null), 3500);
        await load();
      }
    } catch (e) {
      console.error("Smart playlist creation error:", e);
      setStatusMsg("Failed to create smart playlist");
      setTimeout(() => setStatusMsg(null), 3000);
    } finally {
      setBusyPreset(null);
    }
  };

  const handleDeletePlaylist = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this playlist?")) return;
    try {
      await api.deletePlaylist(id);
      load();
    } catch (e) {
      console.error("Delete playlist error:", e);
    }
  };

  return {
    list,
    loading,
    name,
    setName,
    desc,
    setDesc,
    busyPreset,
    statusMsg,
    create,
    createSmartPlaylist,
    handleDeletePlaylist,
  };
}
