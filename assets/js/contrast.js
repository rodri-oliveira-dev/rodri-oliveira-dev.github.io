(() => {
  "use strict";
  const root = document.documentElement;
  const key = "portfolio-contrast";
  const valid = (value) => value === "normal" || value === "high" ? value : "system";
  let preference = "system";
  try { preference = valid(localStorage.getItem(key)); } catch { /* optional storage */ }
  const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-contrast: more)") : null;
  const lang = root.lang.toLowerCase();
  const label = lang.startsWith("es") ? "Alto contraste" :
    lang.startsWith("en") ? "High contrast" : "Alto contraste";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "contrast-preference";
  toggle.id = "contrast-preference";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
  const track = document.createElement("span");
  track.className = "contrast-switch-track";
  track.setAttribute("aria-hidden", "true");
  const thumb = document.createElement("span");
  thumb.className = "contrast-switch-thumb";
  const ns = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(ns, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("focusable", "false");
  const circle = document.createElementNS(ns, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "9");
  circle.setAttribute("fill", "none");
  circle.setAttribute("stroke", "currentColor");
  circle.setAttribute("stroke-width", "2");
  const half = document.createElementNS(ns, "path");
  half.setAttribute("d", "M12 3a9 9 0 0 0 0 18z");
  half.setAttribute("fill", "currentColor");
  icon.append(circle, half);
  thumb.append(icon);
  track.append(thumb);
  toggle.append(track);

  const high = () => preference === "high" || (preference === "system" && media?.matches === true);
  const apply = (value) => {
    preference = valid(value);
    root.dataset.contrast = preference;
    toggle.setAttribute("aria-checked", String(high()));
  };
  apply(preference);
  toggle.addEventListener("click", () => {
    apply(high() ? "normal" : "high");
    try { localStorage.setItem(key, preference); } catch { /* retain current page choice */ }
  });
  // A missing or legacy "system" value follows the OS until the first explicit choice.
  media?.addEventListener?.("change", () => apply(preference));
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    try {
      if (event.storageArea !== localStorage) return;
      apply(localStorage.getItem(key));
    } catch { /* retain current choice if storage is unavailable */ }
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      try { apply(localStorage.getItem(key)); } catch { /* retain current choice */ }
    }
  });

  const header = document.querySelector(".site-header, .topbar");
  const language = header?.querySelector(".language-switcher, .language-nav");
  const offline = document.querySelector("main[data-pwa-offline]");
  if (header?.matches(".topbar")) toggle.classList.add("contrast-preference-light");
  if (language) {
    language.after(toggle);
  } else if (header) {
    (header.querySelector(".header-inner, .topbar-actions") || header).append(toggle);
  } else if (offline) {
    offline.append(toggle);
  } else {
    (document.querySelector(".footer-inner, .resume-footer") || document.body).append(toggle);
  }
})();
