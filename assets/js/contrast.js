(() => {
  "use strict";
  const root = document.documentElement;
  const key = "portfolio-contrast";
  const valid = (value) => ["system", "normal", "high"].includes(value) ? value : "system";
  let preference = "system";
  try { preference = valid(localStorage.getItem(key)); } catch { /* optional storage */ }
  const lang = root.lang.toLowerCase();
  const labels = lang.startsWith("es") ? ["Contraste", "Sistema", "Normal", "Alto contraste"] :
    lang.startsWith("en") ? ["Contrast", "System", "Normal", "High contrast"] :
    ["Contraste", "Sistema", "Normal", "Alto contraste"];
  const select = document.createElement("select");
  select.id = "contrast-preference";
  const wrapper = document.createElement("div");
  wrapper.className = "contrast-preference";
  const label = document.createElement("label");
  label.htmlFor = select.id;
  label.textContent = labels[0];
  ["system", "normal", "high"].forEach((value, index) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labels[index + 1];
    select.append(option);
  });
  wrapper.append(label, select);
  const apply = (value) => {
    preference = valid(value);
    root.dataset.contrast = preference;
    select.value = preference;
  };
  apply(preference);
  select.addEventListener("change", () => {
    apply(select.value);
    try { localStorage.setItem(key, preference); } catch { /* retain current page choice */ }
  });
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
  const target = document.querySelector(".footer-inner, .resume-footer, main[data-pwa-offline]") || document.body;
  target.append(wrapper);
})();
