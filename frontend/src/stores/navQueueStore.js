import { create } from "zustand";

const STORAGE_KEY = "pfx-nav-scenes";

function loadInitialQueue() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    }
  } catch (e) {
    console.error("Failed to load nav queue from storage", e);
  }
  return [];
}

export const useNavQueueStore = create((set, get) => ({
  sceneIds: loadInitialQueue(),

  setQueue: (ids) => {
    const list = Array.isArray(ids) ? ids.map(String) : [];
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
    set({ sceneIds: list });
  },

  addScene: (id) => {
    const sId = String(id);
    const { sceneIds } = get();
    if (sceneIds.includes(sId)) return;
    const updated = [...sceneIds, sId];
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {}
    set({ sceneIds: updated });
  },

  getNextId: (currentId) => {
    const { sceneIds } = get();
    if (!sceneIds || sceneIds.length === 0) return null;
    const idx = sceneIds.findIndex((x) => String(x) === String(currentId));
    if (idx >= 0) {
      return sceneIds[(idx + 1) % sceneIds.length];
    }
    return sceneIds[0];
  },

  getPrevId: (currentId) => {
    const { sceneIds } = get();
    if (!sceneIds || sceneIds.length === 0) return null;
    const idx = sceneIds.findIndex((x) => String(x) === String(currentId));
    if (idx >= 0) {
      return sceneIds[(idx - 1 + sceneIds.length) % sceneIds.length];
    }
    return sceneIds[sceneIds.length - 1];
  },
}));
