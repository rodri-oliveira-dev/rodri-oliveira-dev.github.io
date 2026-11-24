const isAppleMobileDevice = ({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) =>
  /iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);

// Device detection identifies where the guide may help; it cannot prove that
// an embedded browser exposes Add to Home Screen. The guide includes a Safari fallback.
const shouldOfferHomeScreenInstall = ({ device = {}, standalone = false, displayModeStandalone = false } = {}) =>
  isAppleMobileDevice(device) && !standalone && !displayModeStandalone;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isAppleMobileDevice, shouldOfferHomeScreenInstall };
}

if (typeof document !== "undefined" && typeof window !== "undefined") (() => {
  const prompt = document.getElementById("home-screen-install");
  if (!prompt) return;

  const device = window.navigator;
  const installed = typeof window.matchMedia === "function"
    && window.matchMedia("(display-mode: standalone)").matches;

  if (!shouldOfferHomeScreenInstall({
    device: {
      userAgent: device.userAgent,
      platform: device.platform,
      maxTouchPoints: device.maxTouchPoints,
    },
    standalone: device.standalone === true,
    displayModeStandalone: installed,
  })) return;

  const storageKey = "home-screen-install-dismissed";
  let dismissedOnThisPage = false;
  const isDismissed = () => {
    if (dismissedOnThisPage) return true;
    try {
      return window.sessionStorage.getItem(storageKey) === "true";
    } catch {
      // The guide still works when private browsing blocks storage.
      return false;
    }
  };

  const close = prompt.querySelector(".home-screen-install-dismiss");
  const toggle = prompt.querySelector(".home-screen-install-toggle");
  const steps = prompt.querySelector(".home-screen-install-steps");
  if (!close || !toggle || !steps) return;

  const syncVisibility = () => {
    const hidden = isDismissed();
    // Move focus before hiding a focused descendant (including BFCache restores).
    if (hidden && prompt.contains(document.activeElement)) {
      const footer = document.querySelector("footer.site-footer");
      if (footer) {
        footer.setAttribute("tabindex", "-1");
        footer.focus();
      }
    }
    prompt.hidden = hidden;
  };
  syncVisibility();
  // BFCache restores the old DOM without re-running this script. Recheck the
  // dismissal shared by the three localized pages whenever it reappears.
  window.addEventListener("pageshow", syncVisibility);

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(expanded));
    steps.hidden = !expanded;
    toggle.textContent = expanded ? toggle.dataset.closeLabel : toggle.dataset.openLabel;
  });

  close.addEventListener("click", () => {
    dismissedOnThisPage = true;
    syncVisibility();
    try {
      window.sessionStorage.setItem(storageKey, "true");
    } catch {
      // Dismissal works for this page even when storage is unavailable.
    }
  });
})();
