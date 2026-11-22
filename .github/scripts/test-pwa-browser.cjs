"use strict";
const assert = require("node:assert/strict");
const { chromium, firefox, webkit } = require("playwright");

const browsers = { chromium, firefox, webkit };
const name = process.env.PWA_BROWSER;
const origin = process.env.PWA_TEST_ORIGIN || "http://127.0.0.1:8765";
if (!browsers[name]) throw new Error("Set PWA_BROWSER to chromium, firefox, or webkit");

(async () => {
  const browser = await browsers[name].launch({
    headless: true,
    ...(name === "chromium" ? { args: ["--no-sandbox"] } : {})
  });
  try {
    const context = await browser.newContext({ serviceWorkers: "allow" });
    try {
      const page = await context.newPage();
      await page.goto(origin + "/", { waitUntil: "load" });
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20000 });
      for (const route of ["/", "/en/", "/es/"]) {
        await page.goto(origin + route, { waitUntil: "domcontentloaded" });
        assert.notEqual(await page.locator("h1").count(), 0, "Online page must render " + route);
      }
      await context.setOffline(true);
      for (const route of ["/", "/en/", "/es/"]) {
        await page.goto(origin + route, { waitUntil: "domcontentloaded" });
        assert.equal(await page.locator("[data-pwa-offline]").count(), 0, "Visited page must be cached: " + route);
        assert.ok((await page.title()).includes("Rodrigo"), "Expected offline HTML " + route);
      }
      for (const [route, lang] of [
        ["/case-studies/never-visited/", "pt-BR"],
        ["/en/case-studies/never-visited/", "en"],
        ["/es/case-studies/never-visited/", "es-419"]
      ]) {
        await page.goto(origin + route, { waitUntil: "domcontentloaded" });
        assert.equal(await page.locator("[data-pwa-offline]").count(), 1, "Fallback is required: " + route);
        assert.equal(await page.locator("html").getAttribute("lang"), lang);
      }
      await context.setOffline(false);
      await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
      assert.equal(await page.locator("[data-pwa-offline]").count(), 0);
      console.log("PWA browser scenarios passed: " + name);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
