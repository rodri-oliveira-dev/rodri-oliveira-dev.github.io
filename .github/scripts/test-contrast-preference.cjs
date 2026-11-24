const assert = require("node:assert/strict");
const puppeteer = require("puppeteer");
const { urls } = require("../../.pa11yci.cjs");
const results = require("./accessibility-results.cjs").createResults("Contrast preferences");
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const choose = (page, value) => page.click(`#contrast-preference input[value="${value}"]`);
  const selected = (page) => page.$eval("#contrast-preference input:checked", el => el.value);
  const open = async (page) => {
    await page.waitForSelector(".contrast-preference summary");
    if (!await page.$eval(".contrast-preference", el => el.open)) {
      await page.click(".contrast-preference summary");
    }
  };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    for (const url of urls) {
      await results.run(url + " | selection and persistence", async () => {
      await page.goto(url, { waitUntil: "load" });
      await open(page);
      assert.equal(await page.$$eval("#contrast-preference input[type=radio]", els => els.length), 3);
      assert.ok(await page.$eval("#contrast-preference legend", el => el.textContent.trim()));
      for (const width of [320, 360, 390, 768, 1024, 1440]) {
        await page.setViewport({ width, height: 844 });
        const layout = await page.$$eval("#contrast-preference label", labels => labels.map(label => {
          const rect = label.getBoundingClientRect();
          return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
        }));
        for (const rect of layout) {
          assert.ok(rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= width + 1,
            `${url} at ${width}px: ${JSON.stringify(rect)}`);
        }
      }
      await page.setViewport({ width: 390, height: 844 });
      await choose(page, "high");
      assert.equal(await page.$eval("html", el => el.dataset.contrast), "high", url);
      await page.reload({ waitUntil: "load" });
      await open(page);
      assert.equal(await selected(page), "high", url);
      await choose(page, "normal");
      assert.equal(await page.$eval("html", el => el.dataset.contrast), "normal", url);
      await choose(page, "system");
      assert.equal(await page.$eval("html", el => el.dataset.contrast), "system", url);
      });
    }
    await results.run("Keyboard disclosure and native radio navigation", async () => {
      await page.goto(urls[0], { waitUntil: "load" });
      await page.focus(".contrast-preference summary");
      await page.keyboard.press("Enter");
      assert.equal(await page.$eval(".contrast-preference", el => el.open), true);
      await choose(page, "system");
      await page.focus(".contrast-preference summary");
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.value), "system");
      await page.keyboard.press("ArrowRight");
      assert.equal(await selected(page), "normal");
      assert.equal(await page.$eval("html", el => el.dataset.contrast), "normal");
      await page.keyboard.press("ArrowRight");
      assert.equal(await selected(page), "high");
      await page.keyboard.press("ArrowLeft");
      assert.equal(await selected(page), "normal");
      await choose(page, "system");
      await page.focus(".contrast-preference summary");
      await page.keyboard.press("Space");
      assert.equal(await page.$eval(".contrast-preference", el => el.open), false);
    });
    await results.run("Stale storage event does not replace current contrast", async () => {
      await page.goto(urls[0], { waitUntil: "load" });
      await open(page);
      await choose(page, "high");
      try {
        await page.evaluate(() => {
          window.dispatchEvent(new StorageEvent("storage", {
            key: "portfolio-contrast", newValue: "normal", storageArea: localStorage
          }));
        });
        assert.equal(await page.$eval("html", el => el.dataset.contrast), "high");
        assert.equal(await selected(page), "high");
      } finally { await choose(page, "system"); }
    });
    await results.run("System contrast precedence", async () => {
    await page.goto(urls[0], { waitUntil: "load" });
      await open(page);
    const session = await page.createCDPSession();
    await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-contrast", value: "more" }] });
    await choose(page, "system");
    const bg = () => page.$eval("html", el => getComputedStyle(el).getPropertyValue("--bg").trim());
    assert.equal(await bg(), "#000000");
    await choose(page, "normal");
    assert.equal(await bg(), "#070b14");
    await choose(page, "high");
    assert.equal(await bg(), "#000000");
    await session.detach();
    });
  } finally { await browser.close(); results.finish(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
