import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/apiClient";
import { SMART_PRESETS } from "./usePlaylists";
import { useNavQueueStore } from "../stores/navQueueStore";
import { ROUTES } from "../constants/routes";

export function usePlaylist() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [q, setQ] = useState("");
  const [searchRes, setSearchRes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const dragFrom = useRef(null);

  const load = () =>
    api.playlist(id).then(setPlaylist).catch(console.error).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!q.trim()) {
      setSearchRes([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.search(q.trim(), 1, 8);
        setSearchRes(res.scenes || []);
      } catch (e) {
        console.error(e);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const remove = async (sceneId) => {
    await api.removeFromPlaylist(id, sceneId);
    load();
  };

  const add = async (sceneId) => {
    await api.addToPlaylist(id, sceneId);
    setQ("");
    setSearchRes([]);
    load();
  };

  const del = async () => {
    await api.deletePlaylist(id);
    navigate(ROUTES.PLAYLISTS);
  };

  const scenes = playlist?.scenes || [];

  useEffect(() => {
    if (scenes && scenes.length > 0) {
      const ids = scenes.map((s) => s._id);
      useNavQueueStore.getState().setQueue(ids);
    }
  }, [playlist]);

  const persistOrder = async (ordered) => {
    try {
      await api.reorderPlaylist(id, ordered.map((s) => s._id));
    } catch (e) {
      console.error(e);
      load();
    }
  };

  const onDropOn = (to) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragIdx(null);
    setDropIdx(null);
    if (from == null || to == null || from === to) return;
    const ordered = [...scenes];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setPlaylist((p) => ({ ...p, scenes: ordered }));
    persistOrder(ordered);
  };

  const smartPresetId = playlist?.description?.match(/\[Smart:([^\]]+)\]/)?.[1];
  const smartPreset = SMART_PRESETS?.find ? SMART_PRESETS.find((p) => p.id === smartPresetId) : null;
  const isSmart = Boolean(smartPresetId);
  const cleanDescription = playlist?.description?.replace(/^\[Smart:[^\]]+\]\s*/, "");

  const handleSyncSmart = async () => {
    if (!smartPreset || syncing) return;
    setSyncing(true);
    setSyncMsg("Evaluating smart rules against library...");
    try {
      const matchingScenes = await smartPreset.query();
      const existingIds = new Set(scenes.map((s) => s._id));
      const newScenes = matchingScenes.filter((s) => !existingIds.has(s._id));
      if (newScenes.length > 0) {
        await Promise.all(newScenes.map((s) => api.addToPlaylist(id, s._id)));
        setSyncMsg(`Synced! Added ${newScenes.length} new matching scenes.`);
      } else {
        setSyncMsg("Playlist is fully up to date!");
      }
      await load();
      setTimeout(() => setSyncMsg(null), 3000);
    } catch (e) {
      console.error("Smart sync error:", e);
      setSyncMsg("Sync failed");
      setTimeout(() => setSyncMsg(null), 2500);
    } finally {
      setSyncing(false);
    }
  };

  const playAll = () => {
    if (scenes.length > 0) {
      navigate(ROUTES.scene(scenes[0]._id), {
        state: { sceneList: scenes.map((s) => s._id) },
        replace: true,
      });
    }
  };

  const shuffle = () => {
    if (scenes.length > 0) {
      const pick = scenes[Math.floor(Math.random() * scenes.length)];
      navigate(ROUTES.scene(pick._id), {
        state: { sceneList: scenes.map((s) => s._id) },
        replace: true,
      });
    }
  };

  return {
    playlist,
    loading,
    q,
    setQ,
    searchRes,
    scenes,
    dragIdx,
    setDragIdx,
    dropIdx,
    setDropIdx,
    dragFrom,
    syncing,
    syncMsg,
    smartPreset,
    isSmart,
    cleanDescription,
    remove,
    add,
    del,
    onDropOn,
    handleSyncSmart,
    playAll,
    shuffle,
  };
}
