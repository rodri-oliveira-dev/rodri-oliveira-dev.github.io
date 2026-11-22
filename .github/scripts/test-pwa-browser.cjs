"use strict";
const assert = require("node:assert/strict");
const { chromium, firefox, webkit } = require("playwright");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const browsers = { chromium, firefox, webkit };
const name = process.env.PWA_BROWSER;
const origin = process.env.PWA_TEST_ORIGIN || "http://127.0.0.1:8765";
if (!browsers[name]) throw new Error("Set PWA_BROWSER to chromium, firefox, or webkit");

// Playwright's emulated offline mode does not always block network fetches
// initiated inside Firefox's Service Worker. Stop the actual local server as
// well, so every engine exercises the same real network failure.
const pidFile = "/tmp/pwa-http.pid";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const serverResponds = async () => {
  try {
    const response = await fetch(origin + "/", { signal: AbortSignal.timeout(500) });
    return response.ok;
  } catch {
    return false;
  }
};
const stopServer = async () => {
  const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
  process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!(await serverResponds())) return;
    await delay(100);
  }
  throw new Error("Local fixture server did not stop");
};
const restartServer = async () => {
  const server = spawn("python3", ["-m", "http.server", "8765", "--bind", "127.0.0.1"], {
    detached: true,
    stdio: "ignore"
  });
  server.unref();
  fs.writeFileSync(pidFile, String(server.pid));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await serverResponds()) return;
    await delay(100);
  }
  throw new Error("Local fixture server did not restart");
};


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
      // One study page is deliberately absent from APP_SHELL: it must be
      // populated by the runtime cache rather than the install precache.
      for (const route of ["/", "/en/", "/es/", "/case-studies/adr-guard/"]) {
        await page.goto(origin + route, { waitUntil: "domcontentloaded" });
        assert.notEqual(await page.locator("h1").count(), 0, "Online page must render " + route);
      }
      await context.setOffline(true);
      await stopServer();
      // One study page is deliberately absent from APP_SHELL: it must be
      // populated by the runtime cache rather than the install precache.
      for (const route of ["/", "/en/", "/es/", "/case-studies/adr-guard/"]) {
        await page.goto(origin + route, { waitUntil: "domcontentloaded" });
        assert.equal(await page.locator("[data-pwa-offline]").count(), 0, "Visited page must be cached: " + route);
        const expectedTitle = route.includes("/case-studies/adr-guard/") ? "ADR Guard" : "Rodrigo";
        assert.ok((await page.title()).includes(expectedTitle), "Expected cached HTML for " + route);
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
      // Change the server's HTML *after* the offline phase. Only a real
      // network response can contain this marker; cached HTML cannot.
      const homePath = require("node:path").resolve(__dirname, "../../index.html");
      const originalHtml = fs.readFileSync(homePath, "utf8");
      const updatedHtml = originalHtml.replace("</body>",
        '<span data-pwa-reconnected="network-fresh" hidden></span>\n</body>');
      assert.notEqual(updatedHtml, originalHtml, "HTML fixture must have a body");
      fs.writeFileSync(homePath, updatedHtml, "utf8");
      try {
        await restartServer();
        await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
        assert.equal(await page.locator("[data-pwa-offline]").count(), 0);
        assert.equal(await page.locator('[data-pwa-reconnected="network-fresh"]').count(), 1,
          "after reconnecting, navigation must return newly published network HTML");
      } finally {
        fs.writeFileSync(homePath, originalHtml, "utf8");
      }
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
