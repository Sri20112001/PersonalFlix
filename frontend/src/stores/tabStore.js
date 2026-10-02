import { ROUTES } from "../constants/routes";

const TABS_KEY = "pfx-tabs";
const ACTIVE_TAB_KEY = "pfx-active-tab";

export function getInitialTabs() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TABS_KEY) || "null");
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch {}
  return [{ id: "tab-1", title: "Home", path: ROUTES.HOME }];
}

export function getInitialActiveTabId() {
  try {
    return sessionStorage.getItem(ACTIVE_TAB_KEY) || "tab-1";
  } catch {
    return "tab-1";
  }
}

export function saveTabs(tabs) {
  try {
    sessionStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  } catch {}
}

export function saveActiveTabId(tabId) {
  try {
    sessionStorage.setItem(ACTIVE_TAB_KEY, tabId);
  } catch {}
}
