import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/apiClient";
import { useNavQueueStore } from "../stores/navQueueStore";

export function useStudioScenes() {
  const { id } = useParams();
  const [studio, setStudio] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    setLoading(true);
    setLogoOk(true);
    setDetail(null);
    (async () => {
      try {
        const [all, det, res] = await Promise.all([
          api.studios(),
          api.studioDetail(id).catch(() => null),
          api.scenes({ studio: id, limit: 100 }),
        ]);
        setStudio(all.find((s) => String(s._id) === String(id)) || null);
        setDetail(det);
        const list = res.scenes || [];
        setScenes(list);
        if (list.length > 0) {
          useNavQueueStore.getState().setQueue(list.map((s) => s._id));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return {
    id,
    studio,
    setStudio,
    detail,
    scenes,
    loading,
    logoOk,
    setLogoOk,
  };
}
