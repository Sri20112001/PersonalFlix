import { create } from "zustand";

export const useMultiviewStore = create((set) => ({
  layout: "2x2",
  slots: [],
  audioSlot: null,

  setLayout: (layout) => set({ layout }),

  setSlots: (slots) => set({ slots }),

  setSlotScene: (index, scene) =>
    set((state) => {
      const next = [...state.slots];
      next[index] = scene;
      return { slots: next };
    }),

  setAudioSlot: (updater) =>
    set((state) => {
      const next = typeof updater === "function" ? updater(state.audioSlot) : updater;
      return { audioSlot: next };
    }),
}));
