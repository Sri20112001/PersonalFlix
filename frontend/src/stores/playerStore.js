export function dockMiniPlayer(sceneId, currentTime = 0) {
  window.dispatchEvent(
    new CustomEvent("pfx-dock-miniplayer", {
      detail: { sceneId, currentTime },
    })
  );
}

export function openInNewTab(path, title = "New Tab") {
  window.dispatchEvent(
    new CustomEvent("pfx-open-tab", {
      detail: { path, title },
    })
  );
}
