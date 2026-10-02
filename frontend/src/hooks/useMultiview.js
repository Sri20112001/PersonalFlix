import { useEffect, useState, useRef } from "react";
import { api } from "../api/apiClient";
import { useMultiviewStore } from "../stores/multiviewStore";

export function useMultiview() {
  const {
    layout,
    setLayout,
    slots,
    setSlots,
    setSlotScene,
    audioSlot,
    setAudioSlot,
  } = useMultiviewStore();

  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerSlot, setPickerSlot] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const videoRefs = useRef([]);

  const slotCount = layout === "1x2" ? 2 : layout === "3x3" ? 9 : 4;

  useEffect(() => {
    (async () => {
      try {
        const res = await api.scenes({ limit: 60 });
        const list = res.scenes || [];
        setScenes(list);
        if (slots.length === 0) {
          setSlots(list.slice(0, 9));
        }
      } catch (e) {
        console.error("Multiview scene load failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [setSlots, slots.length]);

  useEffect(() => {
    if (searchQ.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.search(searchQ.trim(), 1, 10);
        setSearchResults(res.scenes || []);
      } catch (e) {
        console.error(e);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [searchQ]);

  const handlePickScene = (index, scene) => {
    setSlotScene(index, scene);
    setPickerSlot(null);
    setSearchQ("");
  };

  const randomizeSlot = (index) => {
    if (scenes.length === 0) return;
    const randomScene = scenes[Math.floor(Math.random() * scenes.length)];
    setSlotScene(index, randomScene);
  };

  const randomizeAll = () => {
    if (scenes.length === 0) return;
    const shuffled = [...scenes].sort(() => 0.5 - Math.random());
    setSlots(shuffled.slice(0, slotCount));
  };

  const toggleAudio = (index) => {
    setAudioSlot((cur) => (cur === index ? null : index));
  };

  const activeSlots = Array.from({ length: slotCount }, (_, i) => slots[i] || null);

  const gridClass =
    layout === "1x2"
      ? "grid-cols-2 grid-rows-1"
      : layout === "3x3"
      ? "grid-cols-3 grid-rows-3"
      : "grid-cols-2 grid-rows-2";

  return {
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
  };
}
