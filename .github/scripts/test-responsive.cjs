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
});

const launchBrowser = () => puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

const inspectLayout = () => {
  const switcher = document.querySelector(".language-switcher");
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
  console.log(keyboardOnly
    ? "Validated keyboard navigation in PT/EN/ES."
    : navigationOnly
      ? "Validated mobile link selection in PT/EN/ES."
      : `Validated ${urls.length} pages at ${widths.join(", ")}px, keyboard navigation, and mobile link selection in PT/EN/ES.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
