// Light-Blocker Overlay (pseudo-element version) helpers.
//
// The overlay itself lives in styles/index.css as `body.light-blocker::after`
// (warm variant: `body.light-blocker.night-shield::after`). These helpers own
// the body classes + localStorage persistence so Settings and the app boot
// stay in sync.

const KEY_ON = "pfx-light-blocker-on";
const KEY_WARM = "pfx-light-shield-warm";

export function isLightBlockerOn() {
  // Default ON: preserves the pre-toggle look (the overlay used to be unconditional).
  return (localStorage.getItem(KEY_ON) ?? "1") === "1";
}

export function isNightShieldOn() {
  return localStorage.getItem(KEY_WARM) === "true";
}

export function applyLightBlocker() {
  document.body.classList.toggle("light-blocker", isLightBlockerOn());
  document.body.classList.toggle("night-shield", isNightShieldOn());
}

export function setLightBlockerOn(on) {
  localStorage.setItem(KEY_ON, on ? "1" : "0");
  applyLightBlocker();
}

export function setNightShieldOn(on) {
  localStorage.setItem(KEY_WARM, String(on));
  applyLightBlocker();
}
