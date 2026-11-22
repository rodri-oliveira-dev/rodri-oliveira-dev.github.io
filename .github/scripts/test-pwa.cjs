"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const ORIGIN = "https://rodri-oliveira-dev.github.io";
const workerSource = read("sw.js");
const workerVersion = workerSource.match(/^const CACHE_VERSION = "([^"]+)";$/m)?.[1];
assert.ok(workerVersion, "sw.js must declare a literal CACHE_VERSION");
const SHELL_CACHE = "rodrigo-portfolio-pwa-shell-" + workerVersion;
const RUNTIME_CACHE = "rodrigo-portfolio-pwa-runtime-" + workerVersion;

const htmlPages = [
  "index.html", "en/index.html", "es/index.html",
  "curriculo/index.html", "en/resume/index.html", "es/curriculo/index.html",
  "servicos/index.html", "en/services/index.html", "es/servicios/index.html"
];
for (const locale of ["", "en/", "es/"]) {
  const dir = path.join(ROOT, locale, "case-studies");
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) htmlPages.push(locale + "case-studies/" + entry.name + "/index.html");
  }
}

test("all site pages register PWA without weakening existing CSP", () => {
  for (const file of htmlPages) {
    const html = read(file);
    assert.match(html, /<script src="\/assets\/js\/pwa-register\.js" defer><\/script>/, file);
    assert.match(html, /<link rel="manifest" href="\/site\.webmanifest">/, file);
    if (html.includes('http-equiv="Content-Security-Policy"')) {
      assert.match(html, /worker-src 'self'/, file);
      assert.doesNotMatch(html, /worker-src 'none'/, file);
    }
  }
  const manifest = JSON.parse(read("site.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
});

test("fallbacks have matching languages, noindex and accessible return links", () => {
  for (const [file, lang, home] of [
    ["offline.html", "pt-BR", "/"],
    ["en/offline.html", "en", "/en/"],
    ["es/offline.html", "es-419", "/es/"]
  ]) {
    const html = read(file);
    assert.ok(html.includes('lang="' + lang + '"'));
    assert.ok(html.includes('name="robots" content="noindex,nofollow"'));
    assert.ok(html.includes('href="' + home + '"'));
    assert.ok(html.includes('data-pwa-offline="true"'));
  }
});

function createWorker() {
  const listeners = new Map();
  const stores = new Map();
  let isOffline = false;
  let serverStatus = 200;
  let cacheDirective = null;
  let stallResponseBody = false;
  let responseWasAborted = false;
  let claimed = false;
  const keyOf = (request) => typeof request === "string" ? new URL(request, ORIGIN).href : request.url;
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async addAll(urls) {
        for (const url of urls) store.set(keyOf(url), new Response("shell:" + url));
      },
      async put(request, response) { store.set(keyOf(request), response.clone()); },
      async match(request) { return store.get(keyOf(request))?.clone(); },
      async keys() { return [...store.keys()]; },
      async delete(request) { return store.delete(keyOf(request)); }
    };
  };
  const caches = {
    open: async (name) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    async match(request) {
      for (const name of stores.keys()) {
        const match = await cacheFor(name).match(request);
        if (match) return match;
      }
    }
  };
  const context = {
    self: {
      location: new URL(ORIGIN),
      clients: { async claim() { claimed = true; } },
      addEventListener(type, callback) { listeners.set(type, callback); }
    },
    caches,
    URL, Response, AbortController, clearTimeout, ReadableStream,
    setTimeout(callback, timeout, ...args) {
      // Shorten the deadline only for the intentionally stalled-body fixture.
      return setTimeout(callback, stallResponseBody ? Math.min(timeout, 50) : timeout, ...args);
    },
    async fetch(request, { signal } = {}) {
      if (isOffline) throw new Error("offline");
      if (serverStatus !== 200) return new Response("server:" + serverStatus, { status: serverStatus });
      if (stallResponseBody) {
        return new Response(new ReadableStream({
          start(controller) {
            const abort = () => {
              responseWasAborted = true;
              controller.error(new Error("Response body aborted"));
            };
            if (signal?.aborted) abort();
            else signal?.addEventListener("abort", abort, { once: true });
          }
        }), { status: 200 });
      }
      return new Response("network:" + keyOf(request), {
        status: 200,
        headers: cacheDirective ? { "cache-control": cacheDirective } : {}
      });
    }
  };
  vm.runInNewContext(read("sw.js"), context, { filename: "sw.js" });

  const dispatch = async (type, request) => {
    let response;
    const pending = [];
    listeners.get(type)({
      request,
      waitUntil(promise) { pending.push(promise); },
      respondWith(promise) { response = promise; }
    });
    const result = response ? await response : null;
    await Promise.all(pending);
    return result;
  };
  const request = (pathname, mode = "navigate", destination = "document") => ({
    url: new URL(pathname, ORIGIN).href, method: "GET", mode, destination
  });
  return { caches, stores, dispatch, request, setOffline(value) { isOffline = value; }, setServerStatus(value) { serverStatus = value; }, setCacheControl(value) { cacheDirective = value; }, setStalledBody(value) { stallResponseBody = value; }, get responseWasAborted() { return responseWasAborted; }, get claimed() { return claimed; } };
}

test("installs localized shell and claims on activation, without deleting unrelated caches", async () => {
  const worker = createWorker();
  await (await worker.caches.open("unrelated-cache")).put("https://example.com/", new Response("other"));
  await (await worker.caches.open("rodrigo-portfolio-pwa-old")).put(ORIGIN + "/", new Response("old"));
  await worker.dispatch("install");
  assert.ok((await worker.caches.keys()).includes(SHELL_CACHE));
  await worker.dispatch("activate");
  assert.ok(worker.claimed);
  assert.ok(!(await worker.caches.keys()).includes("rodrigo-portfolio-pwa-old"));
  assert.ok((await worker.caches.keys()).includes("unrelated-cache"));
});

test("updated worker uses isolated caches until activation, then removes old revisions", async () => {
  const worker = createWorker();
  const oldShell = await worker.caches.open("rodrigo-portfolio-pwa-shell-2026-11-20.1");
  await oldShell.put(ORIGIN + "/", new Response("old-html"));
  const oldRuntime = await worker.caches.open("rodrigo-portfolio-pwa-runtime-2026-11-20.1");
  await oldRuntime.put(ORIGIN + "/", new Response("old-runtime-html"));

  await worker.dispatch("install");
  const activeNames = await worker.caches.keys();
  assert.ok(activeNames.includes("rodrigo-portfolio-pwa-shell-2026-11-20.1"),
    "install must not modify the active worker caches");
  assert.equal(await (await oldRuntime.match(ORIGIN + "/")).text(), "old-runtime-html");
  assert.ok(activeNames.includes(SHELL_CACHE));

  await worker.dispatch("activate");
  const names = await worker.caches.keys();
  assert.ok(!names.includes("rodrigo-portfolio-pwa-shell-2026-11-20.1"));
  assert.ok(!names.includes("rodrigo-portfolio-pwa-runtime-2026-11-20.1"));
  worker.setOffline(true);
  const offlineHome = await worker.dispatch("fetch", worker.request("/"));
  assert.equal(await offlineHome.text(), "shell:/",
    "previous runtime HTML must not override the new application's shell");
});

test("query-bearing URLs do not silently resolve from the cache for a different URL", async () => {
  const worker = createWorker();
  await worker.dispatch("install");
  await worker.dispatch("activate");
  worker.setOffline(true);
  const response = await worker.dispatch("fetch", worker.request("/en/?format=print"));
  assert.equal(await response.text(), "shell:/en/offline.html");
});

test("network-first serves fresh HTML and falls back to the latest stored response", async () => {
  const worker = createWorker();
  await worker.dispatch("install");
  await worker.dispatch("activate");
  const req = worker.request("/en/");
  assert.match(await (await worker.dispatch("fetch", req)).text(), /^network:/);
  worker.setOffline(true);
  assert.match(await (await worker.dispatch("fetch", req)).text(), /^network:/);
});

test("HTTP 200 with a stalled body must time out and use cached content", async () => {
  const worker = createWorker();
  await worker.dispatch("install");
  await worker.dispatch("activate");
  const visitedPage = worker.request("/case-studies/adr-guard/");
  assert.match(await (await worker.dispatch("fetch", visitedPage)).text(), /^network:/);

  worker.setStalledBody(true);
  const cached = await worker.dispatch("fetch", visitedPage);
  assert.match(await cached.text(), /^network:/,
    "timeout should serve the previously visited page");
  assert.equal(worker.responseWasAborted, true,
    "deadline should abort the stalled response stream");

  const unvisitedPage = worker.request("/en/case-studies/unvisited/");
  const fallback = await worker.dispatch("fetch", unvisitedPage);
  assert.equal(await fallback.text(), "shell:/en/offline.html");
});

test("transient 5xx failures use cached HTML or a localized fallback, not a false 404", async () => {
  const worker = createWorker();
  await worker.dispatch("install");
  await worker.dispatch("activate");
  await worker.dispatch("fetch", worker.request("/en/"));
  worker.setServerStatus(503);

  const previouslyViewed = await worker.dispatch("fetch", worker.request("/en/"));
  assert.match(await previouslyViewed.text(), /^network:/,
    "a temporary server failure should not replace a known-good cached page");

  const neverViewed = await worker.dispatch("fetch", worker.request("/es/case-studies/unknown/"));
  assert.equal(await neverViewed.text(), "shell:/es/offline.html");

  worker.setServerStatus(404);
  const missingPage = await worker.dispatch("fetch", worker.request("/es/case-studies/unknown/"));
  assert.equal(missingPage.status, 404, "a valid 404 must not become a success response");
});

test("private and no-store responses must not enter runtime cache", async () => {
  const worker = createWorker();
  await worker.dispatch("install");
  await worker.dispatch("activate");
  worker.setCacheControl("private, no-store");
  const request = worker.request("/servicos/");
  const response = await worker.dispatch("fetch", request);
  assert.equal(response.status, 200);
  const runtime = await worker.caches.open(RUNTIME_CACHE);
  assert.equal(await runtime.match(request.url), undefined);
});

test("offline fallback cannot be shadowed by an unrelated cache", async () => {
  const worker = createWorker();
  const other = await worker.caches.open("unrelated-cache");
  await other.put(ORIGIN + "/en/offline.html", new Response("unexpected content"));
  await worker.dispatch("install");
  worker.setOffline(true);
  const response = await worker.dispatch("fetch", worker.request("/en/never-seen/"));
  assert.equal(await response.text(), "shell:/en/offline.html");
});

test("unknown offline navigation uses PT/EN/ES fallback", async () => {
  const worker = createWorker();
  await worker.dispatch("install");
  worker.setOffline(true);
  for (const [pathname, expected] of [
    ["/not-visited/", "shell:/offline.html"],
    ["/en/not-visited/", "shell:/en/offline.html"],
    ["/en", "shell:/en/offline.html"],
    ["/es/not-visited/", "shell:/es/offline.html"],
    ["/es", "shell:/es/offline.html"]
  ]) {
    const response = await worker.dispatch("fetch", worker.request(pathname));
    assert.equal(await response.text(), expected);
  }
});

test("only same-origin GET navigations and assets are intercepted", async () => {
  const worker = createWorker();
  await worker.dispatch("install");
  for (const req of [
    { url: "https://external.example/", method: "GET", mode: "navigate", destination: "document" },
    { url: ORIGIN + "/submit", method: "POST", mode: "navigate", destination: "document" },
    worker.request("/curriculo/rodrigo-de-oliveira.pdf"),
    worker.request("/robots.txt", "no-cors", "")
  ]) {
    assert.equal(await worker.dispatch("fetch", req), null);
  }
});

test("runtime entries are bounded and URLs with query strings are never cached", async () => {
  const worker = createWorker();
  await worker.dispatch("install");
  for (let i = 0; i < 70; i += 1) {
    await worker.dispatch("fetch", worker.request("/case-studies/item-" + i + "/"));
  }
  await worker.dispatch("fetch", worker.request("/en/?utm_source=test"));
  const runtime = await worker.caches.open(RUNTIME_CACHE);
  const keys = await runtime.keys();
  assert.equal(keys.length, 64);
  assert.ok(keys.every((key) => !key.includes("?")));
});
