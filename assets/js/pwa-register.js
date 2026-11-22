/* Installability stays optional: unsupported browsers behave like the regular site. */
(() => {
  "use strict";
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none"
    }).catch(() => {
      // Never interfere with the portfolio when service workers are unavailable.
    });
  }, { once: true });
})();
