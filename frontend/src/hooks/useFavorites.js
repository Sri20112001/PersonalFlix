import { useEffect, useState } from "react";
import { api } from "../api/apiClient";
import { useNavQueueStore } from "../stores/navQueueStore";

export function useFavorites() {
  const [favorites, setFavorites] = useState([]);
  const [sceneDetails, setSceneDetails] = useState({});
  const [performerDetails, setPerformerDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const setQueue = useNavQueueStore((s) => s.setQueue);

  useEffect(() => {
    (async () => {
      try {
        const favs = await api.favorites();
        setFavorites(favs || []);
        const sceneFavs = (favs || []).filter((f) => f.type === "scene");

        const [sceneResults, performerList] = await Promise.all([
          sceneFavs.length > 0
            ? Promise.all(
                sceneFavs.map((f) =>
                  api
                    .scene(f.target_id)
                    .then((r) => r.scene || r)
                    .catch(() => null)
                )
              )
            : Promise.resolve([]),
          api.performers().catch(() => []),
        ]);

        const sceneMap = {};
        sceneResults.forEach((s) => {
          if (s && s._id != null) sceneMap[String(s._id)] = s;
        });
        setSceneDetails(sceneMap);
        if (sceneFavs.length > 0) {
          setQueue(sceneFavs.map((f) => f.target_id));
        }

        const pMap = {};
        (Array.isArray(performerList) ? performerList : []).forEach((p) => {
          if (p && p._id != null) pMap[String(p._id)] = p;
        });
        setPerformerDetails(pMap);
      } catch (e) {
        console.error("Failed to load favorites", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [setQueue]);

  const scenes = favorites.filter((f) => f.type === "scene");
  const performers = favorites.filter((f) => f.type === "performer");

  const remove = async (f) => {
    const prev = favorites;
    setFavorites((p) => p.filter((x) => x._id !== f._id));
    try {
      await api.removeFavorite(f.type, f.target_id);
    } catch (e) {
      console.error("Failed to remove favorite", e);
      setFavorites(prev);
    }
  };

  return {
    favorites,
    scenes,
    performers,
    sceneDetails,
    performerDetails,
    loading,
    remove,
  };
}
