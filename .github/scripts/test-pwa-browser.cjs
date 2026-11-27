"use strict";
const assert = require("node:assert/strict");
const { chromium, firefox, webkit } = require("playwright");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");

const browsers = { chromium, firefox, webkit };
const name = process.env.PWA_BROWSER;
const origin = process.env.PWA_TEST_ORIGIN || "http://127.0.0.1:8765";
if (!browsers[name]) throw new Error("Set PWA_BROWSER to chromium, firefox, or webkit");

// Playwright's emulated offline mode does not always block network fetches
// initiated inside Firefox's Service Worker. Stop the actual local server as
// well, so every engine exercises the same real network failure.
const pidFile = "/tmp/pwa-http.pid";
let serverPid = process.env.PWA_SERVER_PID ? Number(process.env.PWA_SERVER_PID) : null;
const pythonCommand = process.env.PWA_PYTHON || "python3";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const serverResponds = () => new Promise((resolve) => {
  const request = http.get(origin + "/", (response) => {
    response.resume();
    resolve(response.statusCode >= 200 && response.statusCode < 400);
  });
  request.setTimeout(500, () => request.destroy());
  request.on("error", () => resolve(false));
});
const stopServer = async () => {
  const pid = serverPid || Number(fs.readFileSync(pidFile, "utf8").trim());
  process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!(await serverResponds())) return;
    await delay(100);
  }
  throw new Error("Local fixture server did not stop");
};
const restartServer = async () => {
  const server = spawn(pythonCommand, [".github/scripts/serve-test-site.py", "--port", "8765", "--bind", "127.0.0.1", "--directory", "."], {
    detached: true,
    stdio: "ignore"
  });
  server.unref();
  serverPid = server.pid;
  if (!process.env.PWA_SERVER_PID) fs.writeFileSync(pidFile, String(server.pid));
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
      await page.addInitScript(() => {
        window.__webPushNativeCalls = { permission: 0, subscribe: 0, unsubscribe: 0 };
        if (typeof Notification !== "undefined") {
          try {
            Object.defineProperty(Notification, "requestPermission", {
              configurable: true,
              value: () => { window.__webPushNativeCalls.permission += 1; return Promise.resolve("denied"); }
            });
          } catch { /* browser-owned descriptor can be immutable */ }
        }
        if (typeof PushManager !== "undefined") {
          const originalSubscribe = PushManager.prototype.subscribe;
          PushManager.prototype.subscribe = function (...args) {
            window.__webPushNativeCalls.subscribe += 1;
            return originalSubscribe.apply(this, args);
          };
        }
        if (typeof PushSubscription !== "undefined") {
          const originalUnsubscribe = PushSubscription.prototype.unsubscribe;
          PushSubscription.prototype.unsubscribe = function (...args) {
            window.__webPushNativeCalls.unsubscribe += 1;
            return originalUnsubscribe.apply(this, args);
          };
        }
      });
      const fixture = origin + "/.github/scripts/fixtures/web-push-manual.html";
      await page.goto(fixture + "?scenario=inactive", { waitUntil: "load" });
      await page.waitForFunction(() => document.querySelector("[data-web-push]")?.dataset.state === "inactive");
      assert.equal(await page.locator("[data-web-push]").getAttribute("data-state"), "inactive");
      await page.locator("[data-web-push-consent-input]").check();
      await page.locator("[data-web-push-activate]").click();
      await page.waitForFunction(() => document.querySelector("[data-web-push]")?.dataset.state === "active");
      assert.deepEqual(await page.evaluate(() => window.__webPushNativeCalls), {
        permission: 0, subscribe: 0, unsubscribe: 0
      }, "manual fixture must not invoke native Web Push capabilities");

      await page.goto(fixture + "?scenario=active", { waitUntil: "load" });
      await page.waitForFunction(() => document.querySelector("[data-web-push]")?.dataset.state === "active");
      await page.locator("[data-web-push-cancel]").click();
      await page.waitForFunction(() => document.querySelector("[data-web-push]")?.dataset.state === "inactive");

      await page.goto(fixture + "?scenario=backend-unavailable", { waitUntil: "load" });
      await page.waitForFunction(() => document.querySelector("[data-web-push]")?.dataset.state === "active");
      await page.locator("[data-web-push-cancel]").click();
      await page.waitForFunction(() => document.querySelector("[data-web-push]")?.dataset.state === "cancel-pending-remote");

      await page.goto(fixture + "?scenario=recovery-required", { waitUntil: "load" });
      await page.waitForFunction(() => document.querySelector("[data-web-push]")?.dataset.state === "recovery-required");
      await page.locator("[data-web-push-recovery-id]").fill("sub_" + "R".repeat(43));
      await page.locator("[data-web-push-recovery-capability]").fill("S".repeat(43));
      await page.locator("[data-web-push-recover]").click();
      await page.waitForFunction(() => document.querySelector("[data-web-push]")?.dataset.state === "inactive");

      await page.goto(origin + "/", { waitUntil: "load" });
      assert.equal(await page.locator("[data-web-push]").getAttribute("data-state"), "disabled");
      assert.equal(await page.locator("[data-web-push-activate]:visible").count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__webPushNativeCalls), {
        permission: 0, subscribe: 0, unsubscribe: 0
      }, "public gate must not invoke native Web Push capabilities");
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
