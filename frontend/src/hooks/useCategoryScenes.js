import { useEffect, useState } from "react";
import { api } from "../api/apiClient";
import { useNavQueueStore } from "../stores/navQueueStore";

export function useCategoryScenes(id) {
  const [category, setCategory] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const setQueue = useNavQueueStore((s) => s.setQueue);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const all = await api.categories();
        setCategory(all.find((c) => String(c._id) === String(id)) || null);
        const res = await api.scenes({ category: id, limit: 100 });
        const list = res.scenes || [];
        setScenes(list);
        if (list.length > 0) {
          setQueue(list.map((s) => s._id));
        }
      } catch (e) {
        console.error("Failed to load category scenes", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, setQueue]);

  return { category, scenes, loading };
}
