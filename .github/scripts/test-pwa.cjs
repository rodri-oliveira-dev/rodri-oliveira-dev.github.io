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
  const notifications = [];
  const windowClients = [];
  const openedWindows = [];
  let isOffline = false;
  let serverStatus = 200;
  let cacheDirective = null;
  let stallResponseBody = false;
  let responseWasAborted = false;
  let claimed = false;
  let showNotificationFails = false;
  let matchAllFails = false;
  let openWindowFails = false;
  let lastWaitUntilCount = 0;
  let currentTime = Date.now();
  class WorkerDate extends Date {
    static now() { return currentTime; }
  }
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
      registration: {
        async showNotification(title, options) {
          if (showNotificationFails) throw new Error("synthetic notification failure");
          notifications.push({ title, options });
        }
      },
      clients: {
        async claim() { claimed = true; },
        async matchAll() {
          if (matchAllFails) throw new Error("synthetic client lookup failure");
          return windowClients;
        },
        async openWindow(url) {
          if (openWindowFails) throw new Error("synthetic window open failure");
          openedWindows.push(url);
          return null;
        }
      },
      addEventListener(type, callback) { listeners.set(type, callback); }
    },
    caches,
    URL, Response, AbortController, clearTimeout, ReadableStream, TextEncoder, Date: WorkerDate,
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
  vm.runInNewContext(read("sw.js"), context, { filename: path.join(ROOT, "sw.js") });

  const dispatch = async (type, request, properties = {}) => {
    let response;
    const pending = [];
    listeners.get(type)({
      request,
      ...properties,
      waitUntil(promise) { pending.push(promise); },
      respondWith(promise) { response = promise; }
    });
    lastWaitUntilCount = pending.length;
    const result = response ? await response : null;
    await Promise.all(pending);
    return result;
  };
  const request = (pathname, mode = "navigate", destination = "document") => ({
    url: new URL(pathname, ORIGIN).href, method: "GET", mode, destination
  });
  const addWindow = (url, { focusFails = false, navigateFails = false } = {}) => {
    const client = {
      url,
      focusCalls: 0,
      navigateCalls: [],
      async focus() {
        this.focusCalls += 1;
        if (focusFails) throw new Error("synthetic focus failure");
        return this;
      },
      async navigate(target) {
        this.navigateCalls.push(target);
        if (navigateFails) throw new Error("synthetic navigation failure");
        this.url = target;
        return this;
      }
    };
    windowClients.push(client);
    return client;
  };
  return {
    caches, stores, dispatch, request, notifications, openedWindows, addWindow,
    setOffline(value) { isOffline = value; },
    setServerStatus(value) { serverStatus = value; },
    setCacheControl(value) { cacheDirective = value; },
    setStalledBody(value) { stallResponseBody = value; },
    setShowNotificationFails(value) { showNotificationFails = value; },
    setMatchAllFails(value) { matchAllFails = value; },
    setOpenWindowFails(value) { openWindowFails = value; },
    setCurrentTime(value) { currentTime = value; },
    get responseWasAborted() { return responseWasAborted; },
    get claimed() { return claimed; },
    get lastWaitUntilCount() { return lastWaitUntilCount; }
  };
}

const validPushPayload = (overrides = {}) => JSON.stringify({
  version: 1,
  title: "Novo artigo disponível",
  body: "Leia o novo artigo em português no portfólio.",
  url: ORIGIN + "/case-studies/adr-guard/",
  lang: "pt-BR",
  expiresAtUtc: new Date(Date.now() + 60_000).toISOString(),
  ...overrides
});

const pushData = (payload) => ({ text: () => payload });

test("valid versioned PT-BR push payload displays a bounded notification", async () => {
  const worker = createWorker();
  await worker.dispatch("push", undefined, { data: pushData(validPushPayload()) });

  assert.equal(worker.lastWaitUntilCount, 1);
  assert.equal(worker.notifications.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(worker.notifications[0])), {
    title: "Novo artigo disponível",
    options: {
      body: "Leia o novo artigo em português no portfólio.",
      data: { url: ORIGIN + "/case-studies/adr-guard/" },
      icon: "/assets/brand/android-icon-192x192.png",
      badge: "/assets/brand/android-icon-192x192.png",
      lang: "pt-BR",
      tag: "new-article-pt-br"
    }
  });
});

test("missing, malformed, expired and structurally invalid push payloads are ignored", async () => {
  const worker = createWorker();
  const invalidPayloads = [
    undefined,
    pushData("not-json"),
    pushData(validPushPayload({ expiresAtUtc: new Date(Date.now() - 1000).toISOString() })),
    pushData(validPushPayload({ expiresAtUtc: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() })),
    pushData(validPushPayload({ version: 2 })),
    pushData(validPushPayload({ lang: "en" })),
    pushData(validPushPayload({ extra: "unexpected" })),
    pushData(validPushPayload({ title: " titulo inválido" })),
    pushData(validPushPayload({ body: "controle\u0085inválido" })),
    pushData("x".repeat(4097))
  ];
  for (const data of invalidPayloads) {
    await worker.dispatch("push", undefined, { data });
    assert.equal(worker.lastWaitUntilCount, 1);
  }
  assert.equal(worker.notifications.length, 0);
});

test("calendar-invalid expiration is rejected even when Date.parse normalizes it", async () => {
  const worker = createWorker();
  worker.setCurrentTime(Date.parse("2026-11-30T23:59:00Z"));
  await worker.dispatch("push", undefined, {
    data: pushData(validPushPayload({ expiresAtUtc: "2026-11-31T00:00:00.1234567Z" }))
  });
  assert.equal(worker.notifications.length, 0);
});

test("external, credentialed and unauthorized notification destinations are rejected", async () => {
  const worker = createWorker();
  for (const url of [
    "https://attacker.example.test/case-studies/adr-guard/",
    "https://rodri-oliveira-dev.github.io.attacker.example/case-studies/adr-guard/",
    "https://user:password@rodri-oliveira-dev.github.io/case-studies/adr-guard/",
    ORIGIN + "/case-studies/adr-guard/?next=https://attacker.example",
    ORIGIN + "/case-studies/adr-guard/#redirect",
    ORIGIN + "/en/case-studies/adr-guard/",
    ORIGIN + "/assets/js/site.js"
  ]) {
    await worker.dispatch("push", undefined, { data: pushData(validPushPayload({ url })) });
  }
  assert.equal(worker.notifications.length, 0);
});

test("notification click focuses and navigates an existing window to the authorized target", async () => {
  const worker = createWorker();
  const client = worker.addWindow(ORIGIN + "/servicos/");
  let closed = false;
  await worker.dispatch("notificationclick", undefined, {
    notification: {
      data: { url: ORIGIN + "/case-studies/adr-guard/" },
      close() { closed = true; }
    }
  });

  assert.equal(worker.lastWaitUntilCount, 1);
  assert.equal(closed, true);
  assert.deepEqual(client.navigateCalls, [ORIGIN + "/case-studies/adr-guard/"]);
  assert.equal(client.focusCalls, 1);
  assert.deepEqual(worker.openedWindows, []);
});

test("notification click opens a new window only for an authorized target", async () => {
  const worker = createWorker();
  await worker.dispatch("notificationclick", undefined, {
    notification: { data: { url: ORIGIN + "/" }, close() {} }
  });
  assert.deepEqual(worker.openedWindows, [ORIGIN + "/"]);

  await worker.dispatch("notificationclick", undefined, {
    notification: { data: { url: "https://attacker.example.test/" }, close() {} }
  });
  assert.deepEqual(worker.openedWindows, [ORIGIN + "/"]);
});

test("asynchronous notification and window failures remain contained", async () => {
  const worker = createWorker();
  worker.setShowNotificationFails(true);
  await worker.dispatch("push", undefined, { data: pushData(validPushPayload()) });
  await worker.dispatch("push", undefined, { data: { text() { throw new Error("synthetic parse failure"); } } });
  assert.equal(worker.notifications.length, 0);

  worker.setMatchAllFails(true);
  worker.setOpenWindowFails(true);
  await worker.dispatch("notificationclick", undefined, {
    notification: { data: { url: ORIGIN + "/" }, close() { throw new Error("synthetic close failure"); } }
  });
  assert.deepEqual(worker.openedWindows, []);
});

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


test("PWA and Apple touch icons are PNGs with the declared dimensions", () => {
  const manifest = JSON.parse(read("site.webmanifest"));
  const icons = new Map(manifest.icons.map(icon => [icon.src.slice(1), icon.sizes]));
  for (const file of htmlPages) {
    for (const match of read(file).matchAll(/<link rel="apple-touch-icon" sizes="(\d+x\d+)" href="\/([^"]+)">/g)) {
      icons.set(match[2], match[1]);
    }
  }
  assert.equal(icons.size, 7);
  for (const [file, size] of icons) {
    const png = fs.readFileSync(path.join(ROOT, file));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], file);
    assert.equal(png.toString("ascii", 12, 16), "IHDR", file);
    assert.equal(png.readUInt32BE(16) + "x" + png.readUInt32BE(20), size, file);
  }
  assert.equal(manifest.icons.find(icon => icon.purpose === "maskable")?.sizes, "512x512");
});
