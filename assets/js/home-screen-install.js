const isAppleMobileDevice = ({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) =>
  /iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);

const isAndroidDevice = ({ userAgent = "", userAgentData } = {}) =>
  /Android/i.test(userAgent) || userAgentData?.platform === "Android";

// Device detection selects the manual guide, not installation eligibility.
// Only a browser-provided beforeinstallprompt event enables the native action.
const shouldOfferHomeScreenInstall = ({ device = {}, standalone = false, displayModeStandalone = false } = {}) =>
  (isAppleMobileDevice(device) || isAndroidDevice(device)) && !standalone && !displayModeStandalone;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isAppleMobileDevice, isAndroidDevice, shouldOfferHomeScreenInstall };
}

if (typeof document !== "undefined" && typeof window !== "undefined") (() => {
  const prompt = document.getElementById("home-screen-install");
  if (!prompt) return;

  const device = window.navigator;
  const standaloneMedia = typeof window.matchMedia === "function"
    ? window.matchMedia("(display-mode: standalone)") : null;
  const isStandalone = () => device.standalone === true || standaloneMedia?.matches === true;
  const android = isAndroidDevice(device);

  if (!shouldOfferHomeScreenInstall({
    device: {
      userAgent: device.userAgent,
      platform: device.platform,
      maxTouchPoints: device.maxTouchPoints,
      userAgentData: device.userAgentData,
    },
    standalone: isStandalone(),
  })) return;

  const storageKey = "home-screen-install-dismissed";
  let dismissedOnThisPage = false;
  let installedOnThisPage = false;
  let pendingInstall = null;
  let installing = false;
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
  const steps = android
    ? prompt.querySelector("#home-screen-install-android-steps")
    : prompt.querySelector(".home-screen-install-steps");
  const nativeButton = prompt.querySelector(".home-screen-install-native");
  if (!close || !toggle || !steps || !nativeButton) return;
  if (android) toggle.setAttribute("aria-controls", "home-screen-install-android-steps");

  const syncVisibility = () => {
    const hidden = isDismissed() || installedOnThisPage || isStandalone();
    if (hidden) pendingInstall = null;
    // Move focus before hiding a focused descendant (including BFCache restores).
    if (hidden && prompt.contains(document.activeElement)) {
      const footer = document.querySelector("footer.site-footer");
      if (footer) {
        footer.setAttribute("tabindex", "-1");
        footer.focus();
      }
    }
    const hideNative = hidden || (!pendingInstall && !installing);
    if (!hidden && hideNative && document.activeElement === nativeButton) toggle.focus();
    nativeButton.hidden = hideNative;
    prompt.hidden = hidden;
  };
  syncVisibility();
  // BFCache restores the old DOM without re-running this script. Recheck the
  // dismissal shared by the three localized pages whenever it reappears.
  window.addEventListener("pageshow", syncVisibility);
  standaloneMedia?.addEventListener?.("change", syncVisibility);

  if (android) {
    window.addEventListener("beforeinstallprompt", (event) => {
      // Do not suppress the browser's own UI when the visitor dismissed ours.
      if (isDismissed() || installedOnThisPage || isStandalone() || installing || typeof event.prompt !== "function") return;
      event.preventDefault();
      pendingInstall = event;
      syncVisibility();
    });
    window.addEventListener("appinstalled", () => {
      installedOnThisPage = true;
      pendingInstall = null;
      syncVisibility();
    });
    nativeButton.addEventListener("click", async () => {
      if (!pendingInstall || installing || isDismissed() || isStandalone() || installedOnThisPage) return;
      const event = pendingInstall;
      pendingInstall = null; // The browser event is single-use.
      installing = true;
      nativeButton.setAttribute("aria-disabled", "true");
      try {
        // Call prompt synchronously inside the user gesture, before awaiting.
        await event.prompt();
        const choice = await event.userChoice;
        if (choice?.outcome === "accepted") dismissedOnThisPage = true;
      } catch {
        // An unavailable or rejected native prompt leaves manual help usable.
      } finally {
        installing = false;
        nativeButton.removeAttribute("aria-disabled");
        syncVisibility();
      }
    });
  }

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
