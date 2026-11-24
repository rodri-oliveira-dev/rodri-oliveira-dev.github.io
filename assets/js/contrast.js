(() => {
  "use strict";
  const root = document.documentElement;
  const key = "portfolio-contrast";
  const values = ["system", "normal", "high"];
  const valid = (value) => values.includes(value) ? value : "system";
  let preference = "system";
  try { preference = valid(localStorage.getItem(key)); } catch { /* optional storage */ }
  const lang = root.lang.toLowerCase();
  const labels = lang.startsWith("es") ? {
    title: "Contraste", legend: "Preferencia de contraste",
    options: ["Automático", "Normal", "Alto contraste"],
    descriptions: ["Sigue la preferencia de contraste del dispositivo.", "Usa la presentación habitual del sitio.", "Aumenta el contraste de los elementos visuales."]
  } : lang.startsWith("en") ? {
    title: "Contrast", legend: "Contrast preference",
    options: ["Automatic", "Normal", "High contrast"],
    descriptions: ["Follows your device's contrast preference.", "Uses the site's default appearance.", "Increases the contrast of visual elements."]
  } : {
    title: "Contraste", legend: "Preferência de contraste",
    options: ["Automático", "Normal", "Alto contraste"],
    descriptions: ["Segue a preferência de contraste do dispositivo.", "Usa a apresentação padrão do site.", "Amplia o contraste dos elementos visuais."]
  };

  const wrapper = document.createElement("details");
  wrapper.className = "contrast-preference";
  const summary = document.createElement("summary");
  const status = document.createElement("span");
  summary.append(status);
  const group = document.createElement("fieldset");
  group.id = "contrast-preference";
  const legend = document.createElement("legend");
  legend.textContent = labels.legend;
  const options = document.createElement("div");
  options.className = "contrast-options";
  const description = document.createElement("p");
  description.className = "contrast-description";
  const icons = [
    "M3 4h18v12H3z M8 20h8 M12 16v4",
    "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z",
    "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z"
  ];
  const icon = (index) => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", icons[index]);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    if (index === 2) {
      const half = document.createElementNS(ns, "path");
      half.setAttribute("d", "M12 3a9 9 0 0 0 0 18z");
      half.setAttribute("fill", "currentColor");
      svg.append(half);
    }
    return svg;
  };
  const radios = values.map((value, index) => {
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "portfolio-contrast";
    radio.value = value;
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = labels.options[index];
    label.append(radio, icon(index), text);
    options.append(label);
    return radio;
  });
  group.append(legend, options, description);
  wrapper.append(summary, group);
  const apply = (value) => {
    preference = valid(value);
    root.dataset.contrast = preference;
    radios.forEach(radio => { radio.checked = radio.value === preference; });
    const index = values.indexOf(preference);
    status.textContent = labels.title + ": " + labels.options[index];
    description.textContent = labels.descriptions[index];
  };
  apply(preference);
  group.addEventListener("change", (event) => {
    if (!radios.includes(event.target) || !event.target.checked) return;
    apply(event.target.value);
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
  // Keep the disclosure near navigation, outside the sticky header so opening
  // it does not obscure content or increase the sticky header's height.
  const header = document.querySelector(".site-header, .topbar");
  const offline = document.querySelector("main[data-pwa-offline]");
  if (header) {
    if (header.matches(".topbar")) wrapper.classList.add("contrast-preference-light");
    header.after(wrapper);
  } else if (offline) {
    offline.append(wrapper);
  } else {
    (document.querySelector(".footer-inner, .resume-footer") || document.body).append(wrapper);
  }
})();
