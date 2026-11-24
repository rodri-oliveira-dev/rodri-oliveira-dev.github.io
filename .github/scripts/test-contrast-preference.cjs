const assert = require("node:assert/strict");
const puppeteer = require("puppeteer");
const { urls } = require("../../.pa11yci.cjs");
const results = require("./accessibility-results.cjs").createResults("Contrast preferences");
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const selector = "#contrast-preference";
  const state = page => page.$eval(selector, el => el.getAttribute("aria-checked"));
  const mode = page => page.$eval("html", el => el.dataset.contrast);
  const choose = async (page, value) => {
    const wanted = value === "high" ? "true" : "false";
    if (await state(page) !== wanted) await page.click(selector);
    assert.equal(await state(page), wanted);
  };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(urls[0], { waitUntil: "load" });
    await page.evaluate(() => localStorage.setItem("portfolio-contrast", "normal"));
    for (const url of urls) {
      await results.run(url + " | switch and persistence", async () => {
        await page.goto(url, { waitUntil: "load" });
        await page.waitForSelector(selector, { visible: true });
        assert.equal(await page.$$eval(selector, els => els.length), 1);
        assert.equal(await page.$eval(selector, el => el.getAttribute("role")), "switch");
        assert.ok(await page.$eval(selector, el => el.getAttribute("aria-label")));
        assert.equal(await page.$eval(selector, el => {
          const lang = document.querySelector(".site-header .language-switcher, .topbar .language-nav");
          return lang ? lang.nextElementSibling === el : !!el.closest("main[data-pwa-offline], footer");
        }), true, "Switch follows language selector or appears in offline fallback");
        for (const width of [320, 360, 390, 768, 1024, 1440]) {
          await page.setViewport({ width, height: 844 });
          const rect = await page.$eval(selector, el => {
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height, left: r.left, right: r.right };
          });
          assert.ok(rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= width + 1,
            `${url} at ${width}px: ${JSON.stringify(rect)}`);
        }
        await page.setViewport({ width: 390, height: 844 });
        await choose(page, "high");
        assert.equal(await mode(page), "high");
        await page.reload({ waitUntil: "load" });
        await page.waitForSelector(selector);
        assert.equal(await state(page), "true");
        await choose(page, "normal");
        assert.equal(await mode(page), "normal");
      });
    }
    await results.run("Keyboard switch navigation", async () => {
      await page.goto(urls[0], { waitUntil: "load" });
      await choose(page, "normal");
      await page.focus(selector);
      await page.keyboard.press("Space");
      assert.equal(await state(page), "true");
      assert.equal(await mode(page), "high");
      await page.keyboard.press("Enter");
      assert.equal(await state(page), "false");
      assert.equal(await mode(page), "normal");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "contrast-preference");
    });
    await results.run("Stale storage event does not replace current contrast", async () => {
      await page.goto(urls[0], { waitUntil: "load" });
      await choose(page, "high");
      try {
        await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
          key: "portfolio-contrast", newValue: "normal", storageArea: localStorage
        })));
        assert.equal(await mode(page), "high");
        assert.equal(await state(page), "true");
      } finally { await choose(page, "normal"); }
    });
    await results.run("System default and explicit choice precedence", async () => {
      await page.goto(urls[0], { waitUntil: "load" });
      const session = await page.createCDPSession();
      try {
        await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-contrast", value: "more" }] });
        await page.evaluate(() => localStorage.removeItem("portfolio-contrast"));
        await page.reload({ waitUntil: "load" });
        const bg = () => page.$eval("html", el => getComputedStyle(el).getPropertyValue("--bg").trim());
        assert.equal(await state(page), "true");
        assert.equal(await bg(), "#000000");
        await choose(page, "normal");
        assert.equal(await bg(), "#070b14");
        await choose(page, "high");
        assert.equal(await bg(), "#000000");
        await page.evaluate(() => localStorage.setItem("portfolio-contrast", "system"));
        await page.reload({ waitUntil: "load" });
        assert.equal(await state(page), "true", "Legacy system value follows the OS");
        await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-contrast", value: "no-preference" }] });
        await page.waitForFunction(() => document.querySelector("#contrast-preference").getAttribute("aria-checked") === "false");
        assert.equal(await bg(), "#070b14");
      } finally {
        await session.detach();
        await page.evaluate(() => localStorage.removeItem("portfolio-contrast"));
      }
    });
  } finally { await browser.close(); results.finish(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
