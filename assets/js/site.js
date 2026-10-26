const SITE_LANGUAGE_LABELS = Object.freeze({
  "pt-BR": Object.freeze({
    openNavigation: "Abrir navegação",
    closeNavigation: "Fechar navegação",
    primaryNavigation: "Navegação principal",
  }),
  en: Object.freeze({
    openNavigation: "Open navigation",
    closeNavigation: "Close navigation",
    primaryNavigation: "Primary navigation",
  }),
  "es-419": Object.freeze({
    openNavigation: "Abrir navegación",
    closeNavigation: "Cerrar navegación",
    primaryNavigation: "Navegación principal",
  }),
});

const resolveSiteLanguage = (language = "") => {
  const normalized = language.trim().toLowerCase();
  if (normalized === "es-419" || normalized.startsWith("es-")) return "es-419";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "pt-br" || normalized.startsWith("pt-")) return "pt-BR";
  return "pt-BR";
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SITE_LANGUAGE_LABELS, resolveSiteLanguage };
}

if (typeof document !== "undefined" && typeof window !== "undefined") (() => {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const mobileViewport = window.matchMedia("(max-width: 900px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const siteHeader = document.querySelector(".site-header");
  const headerInner = document.querySelector(".header-inner");
  const desktopNav = document.querySelector(".nav");
  const languageSwitcher = document.querySelector(".language-switcher");

  if (!siteHeader || !headerInner || !desktopNav || !languageSwitcher) return;

  const language = resolveSiteLanguage(document.documentElement.lang);
  const labels = SITE_LANGUAGE_LABELS[language];

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "mobile-nav-toggle";
  toggle.setAttribute("aria-label", labels.openNavigation);
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
    desktopNav.getAttribute("aria-label") || labels.primaryNavigation,
  );

  desktopNav.querySelectorAll("a").forEach((link) => {
    mobileNav.appendChild(link.cloneNode(true));
  });

  headerInner.insertBefore(toggle, headerInner.firstChild);
  headerInner.insertBefore(mobileNav, languageSwitcher);
  document.documentElement.classList.add("mobile-nav-ready");

  const firstMenuLink = mobileNav.querySelector("a");
  let menuFocusTimer;

  const setMenuOpen = (open, { focusFirst = false, restoreToggle = false } = {}) => {
    window.clearTimeout(menuFocusTimer);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? labels.closeNavigation : labels.openNavigation);
    mobileNav.setAttribute("aria-hidden", String(!open));
    mobileNav.classList.toggle("is-open", open);

    if (open && focusFirst && firstMenuLink) {
      menuFocusTimer = window.setTimeout(() => {
        if (toggle.getAttribute("aria-expanded") === "true") {
          firstMenuLink.focus({ preventScroll: true });
        }
      }, 180);
    } else if (!open && restoreToggle) {
      toggle.focus();
    }
  };

  const getSectionContent = (target) => {
    const directContainer = Array.from(target.children).find((child) =>
      child.classList.contains("container"),
    );

    return directContainer || target;
  };

  const navigateToMobileAnchor = (link) => {
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("#") || href.length === 1) return false;

    const target = document.getElementById(href.slice(1));
    if (!target) return false;

    setMenuOpen(false);

    window.requestAnimationFrame(() => {
      const content = getSectionContent(target);
      const headerHeight = siteHeader.getBoundingClientRect().height;
      const contentTop = content.getBoundingClientRect().top + window.scrollY;
      const top = Math.max(0, contentTop - headerHeight - 12);

      window.scrollTo({
        top,
        behavior: reducedMotion.matches ? "auto" : "smooth",
      });

      if (window.location.hash !== href) {
        window.history.pushState(null, "", href);
      }
    });

    return true;
  };

  toggle.addEventListener("click", () => {
    const shouldOpen = toggle.getAttribute("aria-expanded") !== "true";
    setMenuOpen(shouldOpen, { focusFirst: shouldOpen });
  });

  mobileNav.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;

    if (mobileViewport.matches && navigateToMobileAnchor(link)) {
      event.preventDefault();
      return;
    }

    setMenuOpen(false);
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
