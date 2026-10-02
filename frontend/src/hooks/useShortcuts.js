import { useEffect, useState } from "react";
import { api } from "../api/apiClient";
import { DEFAULT_BINDINGS } from "../constants/shortcuts";

let cache = null;

export async function loadBindings() {
  if (!cache) {
    cache = (async () => {
      const s = await api.settings().catch(() => null);
      const stored = (s && s.keybindings) || {};
      return { ...DEFAULT_BINDINGS, ...stored };
    })();
  }
  return cache;
}

export function clearBindingsCache() {
  cache = null;
}

export function useBindings() {
  const [bindings, setBindings] = useState(DEFAULT_BINDINGS);
  useEffect(() => {
    loadBindings().then(setBindings);
  }, []);
  return bindings;
}
