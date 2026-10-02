import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "../constants/navigation";
import { ROUTES } from "../constants/routes";
import {
  ArrowBackIcon,
  CloseIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  WindowMinimizeIcon,
  WindowMaximizeIcon,
  WindowRestoreIcon,
  WindowCloseIcon,
} from "../utilities/icons";

async function getAppWindow() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export default function TitleBar({
  onSearch,
  isScene,
  tabs = [],
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onBack,
}) {
  const [maximized, setMaximized] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const win = await getAppWindow();
      if (!win || !mounted) return;
      try {
        setMaximized(await win.isMaximized());
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const run = async (fn) => {
    const win = await getAppWindow();
    if (!win) return;
    try {
      await fn(win);
      try {
        setMaximized(await win.isMaximized());
      } catch {
        /* ignore */
      }
    } catch (e) {
      console.warn("titlebar action failed", e);
    }
  };

  const minimize = () => run((w) => w.minimize());
  const toggleMax = () => {
    setMaximized((m) => !m);
    run((w) => w.toggleMaximize());
  };
  const close = () => run((w) => w.close());

  const navIsActive = (to) =>
    to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={toggleMax}
      className="h-11 w-full flex-shrink-0 flex items-center justify-between px-3 bg-[#0a0a0b]/95 backdrop-blur-xl border-b border-white/[0.07] select-none z-50 overflow-hidden gap-3"
    >
      {/* Left: Brand, Contextual Back, & Workspace Tabs */}
      <div className="flex items-center gap-1.5 no-drag min-w-0 flex-shrink">
        {/* Brand */}
        <Link
          to={ROUTES.HOME}
          className="group flex items-center px-1 py-0.5 rounded transition-opacity hover:opacity-90 flex-shrink-0"
        >
          <span className="font-display text-base font-semibold tracking-wide uppercase text-accent">
            PersonalFlix
          </span>
        </Link>

        {/* Single Contextual Back Control */}
        <button
          onClick={onBack}
          className={`h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.07] active:scale-95 transition-all cursor-pointer flex-shrink-0 ${
            isScene ? "px-2 gap-1.5 text-xs font-medium" : "w-7"
          }`}
          title={
            isScene
              ? "Exit Player (Esc / Backspace)"
              : "Back to Previous Screen (Alt+Left / Backspace)"
          }
        >
          <ArrowBackIcon size={14} />
          {isScene && <span>Exit Player</span>}
        </button>

        {/* Vertical Divider */}
        <div className="w-[1px] h-3.5 bg-white/[0.08] mx-0.5 flex-shrink-0" />

        {/* Tab Strip */}
        <div className="flex items-center gap-0.5 overflow-x-auto max-w-xs md:max-w-sm lg:max-w-md no-scrollbar py-0.5">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => onSelectTab && onSelectTab(tab.id)}
                className={`group relative flex items-center gap-1.5 pl-2.5 pr-1.5 h-7 rounded-md text-xs transition-colors cursor-pointer select-none max-w-[140px] flex-shrink-0 ${
                  isActive
                    ? "bg-white/[0.07] text-zinc-100 font-medium"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                }`}
                title={tab.title}
              >
                <span className="truncate flex-1 text-[11px]">
                  {tab.title || "Tab"}
                </span>

                {tabs.length > 1 && (
                  <button
                    onClick={(e) => onCloseTab && onCloseTab(tab.id, e)}
                    className="w-3.5 h-3.5 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/15 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                    title="Close Tab (Ctrl+W)"
                  >
                    <CloseIcon size={8} strokeWidth={2.5} />
                  </button>
                )}

                {/* Subtle active accent indicator line */}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[1.5px] bg-accent rounded-full pointer-events-none" />
                )}
              </div>
            );
          })}

          <button
            onClick={onNewTab}
            className="w-6 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] active:scale-95 transition-all cursor-pointer flex-shrink-0"
            title="New Tab (Ctrl+T)"
          >
            <PlusIcon size={12} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Center: Integrated Inline Navigation (Hidden in scene mode) */}
      {!isScene && (
        <nav
          aria-label="Main Navigation"
          className="no-drag hidden md:flex items-center gap-0.5"
        >
          {NAV_ITEMS.map((n) => {
            const active = navIsActive(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-label={n.label}
                className={`relative flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs transition-colors ${
                  active
                    ? "bg-white/[0.08] text-white font-medium"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]"
                }`}
              >
                {React.isValidElement(n.icon) ? n.icon : <n.icon size={13} />}
                <span className="hidden lg:inline text-[11px]">{n.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-2 right-2 h-[1.5px] bg-accent/80 rounded-full pointer-events-none" />
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Right: Quick Tools & Window Controls */}
      <div className="flex items-center gap-1.5 no-drag flex-shrink-0">
        {/* Search */}
        {onSearch && (
          <button
            onClick={onSearch}
            className="h-7 px-2 rounded-md flex items-center gap-1.5 text-zinc-400 hover:text-white hover:bg-white/[0.07] active:scale-95 transition-all cursor-pointer group"
            title="Search (Ctrl+K)"
          >
            <SearchIcon
              size={13}
              strokeWidth={2}
              className="group-hover:text-accent transition-colors"
            />
            <kbd className="hidden sm:inline text-[9px] px-1 py-0.2 rounded bg-white/[0.06] text-zinc-400 font-mono border border-white/[0.06]">
              Ctrl K
            </kbd>
          </button>
        )}

        {/* Settings */}
        <Link
          to={ROUTES.SETTINGS}
          className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.07] active:scale-95 transition-all group"
          title="Settings"
        >
          <SettingsIcon
            size={13}
            strokeWidth={2}
            className="transition-transform duration-300 group-hover:rotate-45 group-hover:text-accent"
          />
        </Link>

        {/* Vertical Divider */}
        <div className="w-[1px] h-3.5 bg-white/[0.08] mx-0.5" />

        {/* Window Controls: Flat Chrome Dots with Reveal States */}
        <div className="flex items-center gap-1.5 px-1 py-0.5 group/controls">
          {/* Minimize */}
          <button
            onClick={minimize}
            title="Minimize"
            className="w-3 h-3 rounded-full bg-white/[0.12] hover:bg-amber-400 flex items-center justify-center transition-colors cursor-pointer"
          >
            <WindowMinimizeIcon
              size={6}
              className="opacity-0 group-hover/controls:opacity-100 text-zinc-950 transition-opacity"
            />
          </button>

          {/* Maximize / Restore */}
          <button
            onClick={toggleMax}
            title={maximized ? "Restore" : "Maximize"}
            className="w-3 h-3 rounded-full bg-white/[0.12] hover:bg-emerald-400 flex items-center justify-center transition-colors cursor-pointer"
          >
            {maximized ? (
              <WindowRestoreIcon
                size={6}
                className="opacity-0 group-hover/controls:opacity-100 text-zinc-950 transition-opacity"
              />
            ) : (
              <WindowMaximizeIcon
                size={6}
                className="opacity-0 group-hover/controls:opacity-100 text-zinc-950 transition-opacity"
              />
            )}
          </button>

          {/* Close */}
          <button
            onClick={close}
            title="Close"
            className="w-3 h-3 rounded-full bg-white/[0.12] hover:bg-rose-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <WindowCloseIcon
              size={6}
              className="opacity-0 group-hover/controls:opacity-100 text-zinc-950 transition-opacity"
            />
          </button>
        </div>
      </div>
    </header>
  );
}