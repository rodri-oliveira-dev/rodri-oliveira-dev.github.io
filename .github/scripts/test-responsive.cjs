const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

const ROOT = path.resolve(__dirname, "../..");
const ORIGIN = process.env.SITE_ORIGIN || "http://127.0.0.1:8080";
const keyboardOnly = process.env.RESPONSIVE_KEYBOARD_ONLY === "1";
const widths = [320, 360, 390, 768, 1024, 1440];
const roots = ["", "en", "es"];
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
    brokenImages,
    overflowElements,
    uncontainedOverflowElements,
    horizontalScroll,
  };
};

(async () => {
  for (const width of keyboardOnly ? [] : widths) {
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
    }
  }

  for (const root of roots) {
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
  console.log(keyboardOnly
    ? "Validated keyboard navigation in PT/EN/ES."
    : `Validated ${urls.length} pages at ${widths.join(", ")}px and keyboard navigation in PT/EN/ES.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
