import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getTitleForPath } from "../constants/navigation";
import { getInitialTabs, getInitialActiveTabId, saveTabs, saveActiveTabId } from "../stores/tabStore";
import { ROUTES } from "../constants/routes";

export function useTabs() {
  const navigate = useNavigate();
  const loc = useLocation();

  const [tabs, setTabs] = useState(getInitialTabs);
  const [activeTabId, setActiveTabId] = useState(getInitialActiveTabId);

  // Sync active tab path & title on route change
  useEffect(() => {
    const currentPath = loc.pathname + loc.search;
    const title = getTitleForPath(loc.pathname);

    // Track last visited browse/catalog path
    if (!loc.pathname.startsWith(ROUTES.SCENE.replace(":id", ""))) {
      try {
        sessionStorage.setItem("pfx-last-browse-path", currentPath);
      } catch {}
    }

    setTabs((prevTabs) => {
      const exists = prevTabs.some((t) => t.id === activeTabId);
      let updated;
      if (exists) {
        updated = prevTabs.map((t) =>
          t.id === activeTabId ? { ...t, path: currentPath, title } : t
        );
      } else {
        updated = [...prevTabs, { id: activeTabId, path: currentPath, title }];
      }
      saveTabs(updated);
      saveActiveTabId(activeTabId);
      return updated;
    });
  }, [loc.pathname, loc.search, activeTabId]);

  const handleSelectTab = useCallback(
    (tabId) => {
      const target = tabs.find((t) => t.id === tabId);
      if (!target) return;
      setActiveTabId(tabId);
      saveActiveTabId(tabId);
      navigate(target.path);
    },
    [tabs, navigate]
  );

  const handleNewTab = useCallback(() => {
    const newId = `tab-${Date.now()}`;
    const newTab = { id: newId, title: "Home", path: "/" };
    setTabs((prev) => {
      const next = [...prev, newTab];
      saveTabs(next);
      saveActiveTabId(newId);
      return next;
    });
    setActiveTabId(newId);
    navigate(ROUTES.HOME);
  }, [navigate]);

  const handleOpenInNewTab = useCallback(
    (path, title = "New Tab") => {
      const newId = `tab-${Date.now()}`;
      const newTab = { id: newId, title, path };
      setTabs((prev) => {
        const next = [...prev, newTab];
        saveTabs(next);
        saveActiveTabId(newId);
        return next;
      });
      setActiveTabId(newId);
      navigate(path);
    },
    [navigate]
  );

  useEffect(() => {
    const onOpenTab = (e) => {
      if (e.detail && e.detail.path) {
        handleOpenInNewTab(e.detail.path, e.detail.title || "New Tab");
      }
    };
    window.addEventListener("pfx-open-tab", onOpenTab);
    return () => window.removeEventListener("pfx-open-tab", onOpenTab);
  }, [handleOpenInNewTab]);

  const handleCloseTab = useCallback(
    (tabId, e) => {
      if (e) e.stopPropagation();
      if (tabs.length <= 1) {
        navigate(ROUTES.HOME);
        return;
      }
      const idx = tabs.findIndex((t) => t.id === tabId);
      const nextTabs = tabs.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        const nextActiveIdx = Math.max(0, idx - 1);
        const nextActive = nextTabs[nextActiveIdx];
        setActiveTabId(nextActive.id);
        saveActiveTabId(nextActive.id);
        saveTabs(nextTabs);
        navigate(nextActive.path);
      } else {
        saveTabs(nextTabs);
      }
      setTabs(nextTabs);
    },
    [tabs, activeTabId, navigate]
  );

  return {
    tabs,
    activeTabId,
    handleSelectTab,
    handleNewTab,
    handleOpenInNewTab,
    handleCloseTab,
  };
}
