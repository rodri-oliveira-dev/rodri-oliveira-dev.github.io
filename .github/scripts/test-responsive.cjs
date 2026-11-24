const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

const ROOT = path.resolve(__dirname, "../..");
const ORIGIN = process.env.SITE_ORIGIN || "http://127.0.0.1:8080";
const keyboardOnly = process.env.RESPONSIVE_KEYBOARD_ONLY === "1";
const navigationOnly = process.env.RESPONSIVE_NAVIGATION_ONLY === "1";
const widths = [320, 360, 390, 768, 1024, 1440];
const roots = ["", "en", "es"];
const servicePaths = ["/servicos/", "/en/services/", "/es/servicios/"];
const resumePaths = ["/curriculo/", "/en/resume/", "/es/curriculo/"];
const mobileProfiles = [
  {
    name: "iPhone viewport",
    viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
  },
  {
    name: "Android viewport",
    viewport: { width: 412, height: 915, deviceScaleFactor: 1 },
  },
];
const urls = roots.flatMap((root) => {
  const prefix = root ? `/${root}` : "";
  const caseRoot = path.join(ROOT, root, "case-studies");
  const slugs = fs.readdirSync(caseRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(caseRoot, entry.name, "index.html")))
    .map((entry) => entry.name)
    .sort();
  return [`${prefix}/`, ...slugs.map((slug) => `${prefix}/case-studies/${slug}/`)];
}).concat(servicePaths, resumePaths);

const launchBrowser = () => puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

const inspectLayout = () => {
  const switcher = document.querySelector(".language-switcher, .language-nav");
  const rect = switcher?.getBoundingClientRect();
  const heroArtwork = document.querySelector(".hero-artwork")?.getBoundingClientRect();
  const heroActions = document.querySelector(".hero-actions")?.getBoundingClientRect();
  const brokenImages = [...document.images]
    .filter((image) => image.complete && image.naturalWidth === 0)
    .map((image) => image.getAttribute("src"));
  const overflowElements = [...document.querySelectorAll("body *")]
    .filter((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.right > window.innerWidth + 1 || bounds.left < -1;
    })
    .slice(0, 8)
    .map((element) => {
      const bounds = element.getBoundingClientRect();
      return `${element.tagName.toLowerCase()}.${element.className || ""} [${Math.round(bounds.left)}, ${Math.round(bounds.right)}]`;
    });
  const uncontainedOverflowElements = [...document.querySelectorAll("body *")]
    .filter((element) => {
      const bounds = element.getBoundingClientRect();
      const overflows = bounds.right > window.innerWidth + 1 || bounds.left < -1;
      return overflows && !element.closest(".case-study-code, .case-study-table-wrap");
    })
    .slice(0, 8)
    .map((element) => element.tagName.toLowerCase());
  window.scrollTo(100, 0);
  const horizontalScroll = window.scrollX;
  window.scrollTo(0, 0);
  return {
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    switcherVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
    switcherInsideViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1),
    heroArtworkWidth: heroArtwork?.width ?? null,
    heroActionsWidth: heroActions?.width ?? null,
    brokenImages,
    overflowElements,
    uncontainedOverflowElements,
    horizontalScroll,
  };
};

// Check the minimum WCAG 2.4.11 requirement for the sticky header only.
// Use actual keyboard navigation, not scrollIntoView (which could mask a defect).
const assertHeaderDoesNotObscureFocus = async (page, url, width) => {
  const visited = new Set();
  const inspect = () => page.evaluate(() => {
    const target = document.activeElement;
    if (!target || target === document.body || target === document.documentElement) return null;
    const header = document.querySelector(".site-header");
    const bounds = target.getBoundingClientRect();
    const cover = header?.getBoundingClientRect();
    const label = target.getAttribute("aria-label") || target.textContent.trim().slice(0, 80);
    const key = Array.from(document.querySelectorAll("*")).indexOf(target);
    // Header descendants and the higher-z-index skip link are not covered by the header.
    if (!cover || header.contains(target) || target.closest(".skip-link") ||
        bounds.width === 0 || bounds.height === 0 ||
        !["sticky", "fixed"].includes(getComputedStyle(header).position)) {
      return { key, label, obscured: false };
    }
    const fragments = [...target.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    const obscured = fragments.length > 0 && fragments.every((rect) => {
      const left = Math.max(0, rect.left);
      const right = Math.min(innerWidth, rect.right);
      const top = Math.max(0, rect.top);
      const bottom = Math.min(innerHeight, rect.bottom);
      if (right <= left || bottom <= top) return true;
      return cover.left <= left && cover.right >= right &&
        cover.top <= top && cover.bottom >= bottom;
    });
    const overlapsHeader = fragments.some((rect) =>
      rect.left < cover.right && rect.right > cover.left &&
      rect.top < cover.bottom && rect.bottom > cover.top);
    return { key, label, obscured: obscured && overlapsHeader };
  });
  const check = async (direction) => {
    // Allow native focus scrolling and layout to settle, without forcing scroll.
    await page.evaluate(() => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await inspect();
    if (result) {
      assert.equal(result.obscured, false,
        `${url} at ${width}px: ${direction} focus hidden by header: ${result.label}`);
    }
    return result;
  };
  let ended = false;
  for (let i = 0; i < 500; i += 1) {
    await page.keyboard.press("Tab");
    const result = await check("Tab");
    if (!result || visited.has(result.key)) { ended = true; break; }
    visited.add(result.key);
  }
  assert.ok(ended && visited.size > 0, `${url} at ${width}px: incomplete forward focus traversal`);
  const backwards = new Set();
  await page.keyboard.down("Shift");
  try {
    ended = false;
    for (let i = 0; i < 500; i += 1) {
      await page.keyboard.press("Tab");
      const result = await check("Shift+Tab");
      if (!result || backwards.has(result.key)) { ended = true; break; }
      backwards.add(result.key);
    }
  } finally {
    await page.keyboard.up("Shift");
  }
  assert.ok(ended && backwards.size > 0, `${url} at ${width}px: incomplete reverse focus traversal`);
  assert.deepEqual([...visited].filter((key) => !backwards.has(key)), [],
    `${url} at ${width}px: reverse traversal missed forward focus targets`);
};

const assertMobileLinkNavigation = async (page, url, profileName) => {
  const links = await page.$$eval(".mobile-nav-panel a", (elements) =>
    elements.map((link) => link.getAttribute("href")),
  );

  assert.ok(links.length > 0, `${url} exposes mobile navigation links for ${profileName}`);

  for (const [index, href] of links.entries()) {
    if (index > 0) await page.goto(`${ORIGIN}${url}`, { waitUntil: "load" });
    if (href === "#top") await page.evaluate(() => window.scrollTo(0, 1000));
    await page.click(".mobile-nav-toggle");
    assert.equal(
      await page.$eval(".mobile-nav-toggle", (toggle) => toggle.getAttribute("aria-expanded")),
      "true",
      `${url} opens before selecting ${href} on ${profileName}`,
    );
    await page.waitForFunction(
      () => document.activeElement === document.querySelector(".mobile-nav-panel a"),
      { timeout: 2000 },
    );

    if (href.startsWith("/")) {
      // Services is a route, not an in-page anchor: wait for a full navigation.
      await Promise.all([
        page.waitForNavigation({ waitUntil: "load", timeout: 10000 }),
        page.$eval(`.mobile-nav-panel a[href="${href}"]`, (link) => link.click()),
      ]);
      assert.equal(new URL(page.url()).pathname, href,
        `${url} navigates to ${href} on ${profileName}`);
      assert.equal(
        await page.$eval(".mobile-nav-toggle", (toggle) => toggle.getAttribute("aria-expanded")),
        "false",
        `${url} loads ${href} with its mobile menu closed`,
      );
      continue;
    }

    await page.$eval(`.mobile-nav-panel a[href="${href}"]`, (link) => link.click());
    await page.waitForFunction(
      (expectedHash) => window.location.hash === expectedHash &&
        document.querySelector(".mobile-nav-toggle").getAttribute("aria-expanded") === "false",
      { timeout: 3000 },
      href,
    );
    await page.waitForFunction(
      (targetId) => {
        const headerBottom = document.querySelector(".site-header").getBoundingClientRect().bottom;
        const target = document.getElementById(targetId);
        const content = [...target.children].find((child) => child.classList.contains("container")) || target;
        return content.getBoundingClientRect().top >= headerBottom - 1;
      },
      { timeout: 3000 },
      href.slice(1),
    );

    assert.equal(
      await page.$eval(".mobile-nav-panel", (nav) => nav.getAttribute("aria-hidden")),
      "true",
      `${url} closes after selecting ${href} on ${profileName}`,
    );
  }
};

(async () => {
  for (const width of keyboardOnly || navigationOnly ? [] : widths) {
    for (const url of urls) {
      let result;
      let loadError;
      for (let attempt = 1; attempt <= 3 && !result; attempt += 1) {
        const browser = await launchBrowser();
        try {
          const page = await browser.newPage();
          await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
          await page.goto(`${ORIGIN}${url}`, { waitUntil: "load" });
          result = await page.evaluate(inspectLayout);
        } catch (error) {
          loadError = error;
        } finally {
          await browser.close();
        }
      }
      if (!result) throw new Error(`Failed to load ${url} at ${width}px after 3 attempts`, { cause: loadError });
      assert.equal(result.horizontalScroll, 0, `${url} scrolls horizontally at ${width}px (${result.documentWidth}px document): ${result.overflowElements.join(", ")}`);
      assert.ok(result.switcherVisible, `${url} hides the language switcher at ${width}px`);
      assert.ok(result.switcherInsideViewport, `${url} clips the language switcher at ${width}px`);
      assert.deepEqual(result.uncontainedOverflowElements, [], `${url} has uncontained overflow at ${width}px`);
      assert.deepEqual(result.brokenImages, [], `${url} has broken images at ${width}px`);
      if (width <= 640 && roots.map((root) => root ? `/${root}/` : "/").includes(url)) {
        assert.ok(result.heroArtworkWidth, `${url} shows the hero artwork at ${width}px`);
        assert.ok(result.heroActionsWidth, `${url} shows the hero actions at ${width}px`);
        assert.ok(Math.abs(result.heroArtworkWidth - result.heroActionsWidth) <= 1,
          `${url} aligns hero artwork (${result.heroArtworkWidth}px) and actions (${result.heroActionsWidth}px) at ${width}px`);
      }
    }
  }

  for (const root of navigationOnly ? [] : roots) {
    const url = root ? `/${root}/` : "/";
    let completed = false;
    let keyboardError;
    for (let attempt = 1; attempt <= 3 && !completed; attempt += 1) {
      const browser = await launchBrowser();
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
        await page.goto(`${ORIGIN}${url}`, { waitUntil: "load" });
        // These navigation controls use a 44px height and at least 24px width.
        const targets = await page.$$eval(".mobile-nav-toggle, .language-switcher .lang-link", (elements) =>
          elements.map((element) => ({ name: element.textContent.trim() || element.getAttribute("aria-label"), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
        );
        assert.ok(targets.length === 4, `${url} exposes mobile navigation targets`);
        for (const target of targets) {
          assert.ok(target.height >= 44 && target.width >= 24, `${url} target ${target.name} is ${target.width}x${target.height}px`);
        }
        await page.focus(".mobile-nav-toggle");
        await page.keyboard.press("Enter");
        assert.equal(await page.$eval(".mobile-nav-toggle", (toggle) => toggle.getAttribute("aria-expanded")), "true", `${url} keyboard opens menu`);
        assert.equal(await page.$eval(".mobile-nav-panel", (nav) => nav.getAttribute("aria-hidden")), "false", `${url} exposes open menu`);
        await page.waitForFunction(
          () => document.activeElement === document.querySelector(".mobile-nav-panel a"),
          { timeout: 2000 },
        );
        assert.equal(await page.evaluate(() => document.activeElement === document.querySelector(".mobile-nav-panel a")), true, `${url} focuses first menu link`);
        await page.keyboard.press("Escape");
        assert.equal(await page.$eval(".mobile-nav-toggle", (toggle) => toggle.getAttribute("aria-expanded")), "false", `${url} Escape closes menu`);
        assert.equal(await page.evaluate(() => document.activeElement === document.querySelector(".mobile-nav-toggle")), true, `${url} Escape restores focus`);
        await page.keyboard.press("Enter");
        await page.waitForFunction(
          () => document.activeElement === document.querySelector(".mobile-nav-panel a"),
          { timeout: 2000 },
        );
        await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => window.location.hash === "#career");
        assert.equal(await page.$eval(".mobile-nav-toggle", (toggle) => toggle.getAttribute("aria-expanded")), "false", `${url} keyboard selection closes menu`);
        assert.equal(await page.evaluate(() => document.activeElement?.id), "career", `${url} keyboard selection focuses its section`);
        completed = true;
      } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
        keyboardError = error;
      } finally {
        await browser.close();
      }
    }
    if (!completed) throw new Error(`Keyboard validation failed for ${url} after 3 attempts`, { cause: keyboardError });
  }

  if (!keyboardOnly) {
    for (const profile of mobileProfiles) {
      for (const root of roots) {
        const url = root ? `/${root}/` : "/";
        let completed = false;
        let navigationError;
        for (let attempt = 1; attempt <= 3 && !completed; attempt += 1) {
          let browser;
          try {
            browser = await launchBrowser();
            const page = await browser.newPage();
            await page.setViewport(profile.viewport);
            await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
            await page.goto(`${ORIGIN}${url}`, { waitUntil: "load" });
            await assertMobileLinkNavigation(page, url, profile.name);
            completed = true;
          } catch (error) {
            if (error instanceof assert.AssertionError) throw error;
            navigationError = error;
          } finally {
            await browser?.close();
          }
        }
        if (!completed) {
          throw new Error(`Mobile link validation failed for ${url} on ${profile.name}`, { cause: navigationError });
        }
      }
    }

    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport(mobileProfiles[0].viewport);
      await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
      await page.evaluate(() => {
        const toggle = document.querySelector(".mobile-nav-toggle");
        const link = document.querySelector('.mobile-nav-panel a[href="#projects"]');
        toggle.focus();
        toggle.click();
        toggle.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
        if (toggle.getAttribute("aria-expanded") !== "true") {
          throw new Error("Safari focusout closed the menu before click dispatch");
        }
        link.click();
      });
      await page.waitForFunction(() => window.location.hash === "#projects");
      assert.equal(
        await page.$eval(".mobile-nav-toggle", (toggle) => toggle.getAttribute("aria-expanded")),
        "false",
        "Safari null-relatedTarget sequence selects the link and closes the menu",
      );
    } finally {
      await browser.close();
    }
  }
  // Cover representative narrow and wide layouts across every localized route.
  // Reuse one browser; each route starts with a fresh page and native focus order.
  if (!navigationOnly) {
    const browser = await launchBrowser();
    try {
      for (const width of [320, 390, 768, 1440]) {
        for (const url of (width === 390 || width === 1440 ? urls : roots.map((root) => root ? `/${root}/` : "/"))) {
          const page = await browser.newPage();
          try {
            await page.setViewport({ width, height: 844, deviceScaleFactor: 1 });
            await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
            await page.goto(`${ORIGIN}${url}`, { waitUntil: "load" });
            await assertHeaderDoesNotObscureFocus(page, url, width);
          } finally {
            await page.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  // Simulate Apple device detection; actual Safari/VoiceOver still needs manual validation.
  if (!navigationOnly) {
    const browser = await launchBrowser();
    try {
      for (const root of roots) {
        const url = root ? `/${root}/` : "/";
        const page = await browser.newPage();
        try {
          await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
          await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, "userAgent", { get: () => "iPhone" });
          });
          await page.goto(`${ORIGIN}${url}`, { waitUntil: "load" });
          await page.waitForSelector("#home-screen-install", { visible: true });
          await page.focus(".home-screen-install-dismiss");
          await page.keyboard.press("Enter");
          assert.equal(await page.$eval("#home-screen-install", (el) => el.hidden), true, `${url} dismisses install guide`);
          assert.equal(await page.evaluate(() => document.activeElement === document.querySelector("footer.site-footer")), true, `${url} moves focus to the next landmark`);
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  // Check service-page anchor navigation through the mobile menu.
  if (!navigationOnly) {
    const browser = await launchBrowser();
    try {
      for (const servicePath of servicePaths) {
        const page = await browser.newPage();
        try {
          await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
          await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
          await page.goto(`${ORIGIN}${servicePath}`, { waitUntil: "load" });
          await page.focus(".mobile-nav-toggle");
          await page.keyboard.press("Enter");
          await page.waitForFunction(() =>
            document.activeElement === document.querySelector(".mobile-nav-panel a"),
          );
          await page.keyboard.press("Enter");
          await page.waitForFunction(() => window.location.hash === "#atuacao");
          assert.equal(
            await page.$eval(".mobile-nav-toggle", (el) => el.getAttribute("aria-expanded")),
            "false",
            `${servicePath} closes the mobile menu after the section link`,
          );
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  console.log(keyboardOnly
    ? "Validated keyboard navigation in PT/EN/ES."
    : navigationOnly
      ? "Validated mobile link selection in PT/EN/ES."
      : `Validated ${urls.length} pages at ${widths.join(", ")}px, keyboard navigation, and mobile link selection in PT/EN/ES.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
