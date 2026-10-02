import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api/apiClient";
import { useBindings } from "../hooks/useShortcuts";
import { useTabs } from "../hooks/useTabs";
import { matchBinding } from "../utilities/shortcuts";
import TitleBar from "./TitleBar";
import SplashScreen from "../components/SplashScreen";
import CommandPalette from "../components/CommandPalette";
import MiniPlayer from "../components/MiniPlayer";
import { ROUTES } from "../constants/routes";
import LightBlockerOverlay from "../components/LightBlockerOverlay";
import { applyLightBlocker } from "../utilities/lightBlocker";

export default function Shell({ children }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bootReady, setBootReady] = useState(false);
  const [bootTimed, setBootTimed] = useState(false);
  const [bootStatus, setBootStatus] = useState("Starting server...");
  const handleSplashFinish = useCallback(() => setBootTimed(true), []);
  const navigate = useNavigate();
  const loc = useLocation();
  const isScene = loc.pathname.startsWith(ROUTES.SCENE.replace(":id", ""));
  const bindings = useBindings();

  // Multi-tab state management using hook
  const {
    tabs,
    activeTabId,
    handleSelectTab,
    handleNewTab,
    handleCloseTab,
  } = useTabs();

  // Persistent In-App Mini-Player state
  const [miniPlayerState, setMiniPlayerState] = useState(null);

  useEffect(() => {
    const onDock = (e) => {
      if (e.detail?.sceneId) {
        setMiniPlayerState({
          sceneId: e.detail.sceneId,
          initialTime: e.detail.currentTime || 0,
        });
      }
    };
    window.addEventListener("pfx-dock-miniplayer", onDock);
    return () => window.removeEventListener("pfx-dock-miniplayer", onDock);
  }, []);

  // Apply persisted Light-Blocker pseudo-element overlay on boot.
  useEffect(() => {
    applyLightBlocker();
  }, []);

  const handleGoBack = useCallback(() => {
    if (isScene) {
      const prevBrowse = sessionStorage.getItem("pfx-last-browse-path");
      if (prevBrowse && !prevBrowse.startsWith(ROUTES.SCENE.replace(":id", ""))) {
        navigate(prevBrowse);
        return;
      }
    }
    navigate(-1);
  }, [isScene, navigate]);

  // Mouse back button support (e.g. mouse button 3)
  useEffect(() => {
    const onMouseUp = (e) => {
      if (e.button === 3) {
        e.preventDefault();
        handleGoBack();
      }
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [handleGoBack]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 60 && !cancelled; i++) {
        try {
          await api.health();
          if (cancelled) return;
          setBootReady(true);
          setBootStatus("Loading library...");
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      if (!cancelled) {
        setBootReady(true);
        setBootStatus("Starting offline…");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;

      // Global Tab shortcuts
      if (matchBinding(e, bindings, "newTab") || ((e.ctrlKey || e.metaKey) && (e.key === "t" || e.key === "T"))) {
        e.preventDefault();
        handleNewTab();
        return;
      }
      if (matchBinding(e, bindings, "closeTab") || ((e.ctrlKey || e.metaKey) && (e.key === "w" || e.key === "W"))) {
        e.preventDefault();
        handleCloseTab(activeTabId);
        return;
      }

      // Global Back shortcuts (Alt+Left, Backspace when not in scene or input)
      if (matchBinding(e, bindings, "back") || (e.altKey && e.key === "ArrowLeft") || (e.key === "Backspace" && !isScene)) {
        e.preventDefault();
        handleGoBack();
        return;
      }

      if (matchBinding(e, bindings, "command")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isScene) {
        if (paletteOpen) {
          if (matchBinding(e, bindings, "escape")) setPaletteOpen(false);
          return;
        }
        if (e.key === "Escape" || e.key === "Backspace") {
          if (document.fullscreenElement) return;
          e.preventDefault();
          handleGoBack();
          return;
        }
        if (matchBinding(e, bindings, "home")) {
          navigate(ROUTES.HOME);
          return;
        }
        if (matchBinding(e, bindings, "library")) {
          navigate(ROUTES.LIBRARY);
          return;
        }
        return;
      }
      const nav = {
        home: ROUTES.HOME,
        library: ROUTES.LIBRARY,
        favorites: ROUTES.FAVORITES,
        playlists: ROUTES.PLAYLISTS,
        multiview: ROUTES.MULTIVIEW,
        settings: ROUTES.SETTINGS,
        health: ROUTES.HEALTH,
      };
      for (const [action, path] of Object.entries(nav)) {
        if (matchBinding(e, bindings, action)) {
          navigate(path);
          return;
        }
      }
      if (matchBinding(e, bindings, "escape")) setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, isScene, bindings, paletteOpen, activeTabId, handleNewTab, handleCloseTab, handleGoBack]);

  const resolveOpenPath = (p) => {
    const base = String(p || "").split(/[\\/]/).pop();
    if (!base) return Promise.resolve();
    return api
      .scenes({ file: base })
      .then((res) => {
        const s = res.scenes && res.scenes[0];
        if (s) navigate(ROUTES.scene(s._id), { replace: true });
      })
      .catch((err) => console.error("open-file resolve", err));
  };

  useEffect(() => {
    let unlisten = null;
    (async () => {
      try {
        unlisten = await listen("open-file", (e) => {
          resolveOpenPath(String(e.payload || ""));
        });
      } catch (err) {
        console.warn("open-file IPC listener unavailable:", err);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [navigate]);

  useEffect(() => {
    api
      .pendingOpen()
      .then((res) => {
        if (res && res.file) resolveOpenPath(res.file);
      })
      .catch((err) => console.error("pending-open poll", err));
  }, []);

  return (
    <div className="h-screen w-screen bg-background text-white overflow-hidden select-none flex flex-col">
      {!(bootReady && bootTimed) && (
        <SplashScreen onFinish={handleSplashFinish} statusText={bootStatus} />
      )}
      {/* <LightBlockerOverlay /> */}
      <TitleBar
        onSearch={() => setPaletteOpen(true)}
        isScene={isScene}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onBack={handleGoBack}
      />
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {children}
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          isScene={isScene}
          sceneId={isScene ? loc.pathname.split("/")[2] : null}
        />
        {miniPlayerState && !isScene && (
          <MiniPlayer
            sceneId={miniPlayerState.sceneId}
            initialTime={miniPlayerState.initialTime}
            onClose={() => setMiniPlayerState(null)}
            onExpand={(cur) => {
              const id = miniPlayerState.sceneId;
              setMiniPlayerState(null);
              navigate(ROUTES.scene(id, { t: Math.floor(cur) }), { state: { autoResume: true }, replace: true });
            }}
          />
        )}
      </div>
    </div>
  );
}
