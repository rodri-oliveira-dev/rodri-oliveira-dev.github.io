const assert = require("node:assert/strict");
const puppeteer = require("puppeteer");
const { urls } = require("../../.pa11yci.cjs");
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    for (const url of urls) {
      await page.goto(url, { waitUntil: "load" });
      await page.waitForSelector("#contrast-preference");
      await page.select("#contrast-preference", "high");
      assert.equal(await page.$eval("html", el => el.dataset.contrast), "high", url);
      await page.reload({ waitUntil: "load" });
      assert.equal(await page.$eval("#contrast-preference", el => el.value), "high", url);
      await page.select("#contrast-preference", "normal");
      assert.equal(await page.$eval("html", el => el.dataset.contrast), "normal", url);
      await page.select("#contrast-preference", "system");
      assert.equal(await page.$eval("html", el => el.dataset.contrast), "system", url);
    }
    await page.goto(urls[0], { waitUntil: "load" });
    const session = await page.createCDPSession();
    await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-contrast", value: "more" }] });
    const bg = () => page.$eval("html", el => getComputedStyle(el).getPropertyValue("--bg").trim());
    assert.equal(await bg(), "#000000");
    await page.select("#contrast-preference", "normal");
    assert.equal(await bg(), "#070b14");
    await page.select("#contrast-preference", "high");
    assert.equal(await bg(), "#000000");
    await session.detach();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
