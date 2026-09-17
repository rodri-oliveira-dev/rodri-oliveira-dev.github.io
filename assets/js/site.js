(() => {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const mobileViewport = window.matchMedia("(max-width: 900px)");
  const siteHeader = document.querySelector(".site-header");
  const headerInner = document.querySelector(".header-inner");
  const desktopNav = document.querySelector(".nav");
  const languageSwitcher = document.querySelector(".language-switcher");

  if (!siteHeader || !headerInner || !desktopNav || !languageSwitcher) return;

  const isPortuguese = document.documentElement.lang.toLowerCase().startsWith("pt");
  const openLabel = isPortuguese ? "Abrir navegação" : "Open navigation";
  const closeLabel = isPortuguese ? "Fechar navegação" : "Close navigation";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "mobile-nav-toggle";
  toggle.setAttribute("aria-label", openLabel);
  toggle.setAttribute("aria-controls", "mobile-navigation");
  toggle.setAttribute("aria-expanded", "false");

  for (let index = 0; index < 3; index += 1) {
    const line = document.createElement("span");
    line.className = "mobile-nav-toggle-line";
    line.setAttribute("aria-hidden", "true");
    toggle.appendChild(line);
  }

  const mobileNav = document.createElement("nav");
  mobileNav.id = "mobile-navigation";
  mobileNav.className = "mobile-nav-panel";
  mobileNav.setAttribute("aria-hidden", "true");
  mobileNav.setAttribute(
    "aria-label",
    desktopNav.getAttribute("aria-label") || (isPortuguese ? "Navegação principal" : "Primary navigation"),
  );

  desktopNav.querySelectorAll("a").forEach((link) => {
    mobileNav.appendChild(link.cloneNode(true));
  });

  headerInner.insertBefore(toggle, headerInner.firstChild);
  headerInner.insertBefore(mobileNav, languageSwitcher);
  document.documentElement.classList.add("mobile-nav-ready");

  const firstMenuLink = mobileNav.querySelector("a");

  const setMenuOpen = (open, { focusFirst = false, restoreToggle = false } = {}) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? closeLabel : openLabel);
    mobileNav.setAttribute("aria-hidden", String(!open));
    mobileNav.classList.toggle("is-open", open);

    if (open && focusFirst && firstMenuLink) {
      window.requestAnimationFrame(() => firstMenuLink.focus());
    } else if (!open && restoreToggle) {
      toggle.focus();
    }
  };

  toggle.addEventListener("click", () => {
    const shouldOpen = toggle.getAttribute("aria-expanded") !== "true";
    setMenuOpen(shouldOpen, { focusFirst: shouldOpen });
  });

  mobileNav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenuOpen(false);
  });

  mobileNav.addEventListener("focusout", (event) => {
    if (
      toggle.getAttribute("aria-expanded") === "true" &&
      !mobileNav.contains(event.relatedTarget) &&
      event.relatedTarget !== toggle
    ) {
      setMenuOpen(false);
    }
  });

  toggle.addEventListener("focusout", (event) => {
    if (
      toggle.getAttribute("aria-expanded") === "true" &&
      !mobileNav.contains(event.relatedTarget)
    ) {
      setMenuOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (toggle.getAttribute("aria-expanded") === "true" && !siteHeader.contains(event.target)) {
      setMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setMenuOpen(false, { restoreToggle: true });
    }
  });

  const closeMenuOnDesktop = (event) => {
    if (!event.matches) setMenuOpen(false);
  };

  if (typeof mobileViewport.addEventListener === "function") {
    mobileViewport.addEventListener("change", closeMenuOnDesktop);
  } else if (typeof mobileViewport.addListener === "function") {
    mobileViewport.addListener(closeMenuOnDesktop);
  }
})();
