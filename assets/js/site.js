(() => {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const mobileStyles = document.createElement("link");
  mobileStyles.rel = "stylesheet";
  mobileStyles.href = "/assets/css/mobile-enhancements.css";
  document.head.appendChild(mobileStyles);

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && !viewport.content.includes("viewport-fit=cover")) {
    viewport.content = `${viewport.content}, viewport-fit=cover`;
  }

  const themeColor = document.querySelector('meta[name="theme-color"]');
  const mobileViewport = window.matchMedia("(max-width: 900px)");

  const syncThemeColor = () => {
    if (themeColor) {
      themeColor.content = mobileViewport.matches ? "#000000" : "#070b14";
    }
  };

  syncThemeColor();
  if (typeof mobileViewport.addEventListener === "function") {
    mobileViewport.addEventListener("change", syncThemeColor);
  } else if (typeof mobileViewport.addListener === "function") {
    mobileViewport.addListener(syncThemeColor);
  }

  const siteHeader = document.querySelector(".site-header");
  const headerInner = document.querySelector(".header-inner");
  const desktopNav = document.querySelector(".nav");

  if (!siteHeader || !headerInner || !desktopNav) return;

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
  mobileNav.setAttribute(
    "aria-label",
    desktopNav.getAttribute("aria-label") || (isPortuguese ? "Navegação principal" : "Primary navigation"),
  );

  desktopNav.querySelectorAll("a").forEach((link) => {
    mobileNav.appendChild(link.cloneNode(true));
  });

  headerInner.insertBefore(toggle, headerInner.firstChild);
  siteHeader.appendChild(mobileNav);
  document.documentElement.classList.add("mobile-nav-ready");

  const setMenuOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? closeLabel : openLabel);
    mobileNav.classList.toggle("is-open", open);
  };

  toggle.addEventListener("click", () => {
    setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  mobileNav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenuOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (toggle.getAttribute("aria-expanded") === "true" && !siteHeader.contains(event.target)) {
      setMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setMenuOpen(false);
      toggle.focus();
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
