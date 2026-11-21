const isAppleMobileDevice = ({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) =>
  /iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);

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
  try {
    if (window.sessionStorage.getItem(storageKey) === "true") return;
  } catch {
    // The guide still works when private browsing blocks storage.
  }

  const close = prompt.querySelector(".home-screen-install-dismiss");
  const toggle = prompt.querySelector(".home-screen-install-toggle");
  const steps = prompt.querySelector(".home-screen-install-steps");
  if (!close || !toggle || !steps) return;

  prompt.hidden = false;

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(expanded));
    steps.hidden = !expanded;
    toggle.textContent = expanded ? toggle.dataset.closeLabel : toggle.dataset.openLabel;
  });

  close.addEventListener("click", () => {
    prompt.hidden = true;
    try {
      window.sessionStorage.setItem(storageKey, "true");
    } catch {
      // Dismissal works for this page even when storage is unavailable.
    }
  });
})();
