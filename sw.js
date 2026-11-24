/* Progressive enhancement for a static, multilingual GitHub Pages portfolio. */
"use strict";

const PREFIX = "rodrigo-portfolio-pwa-";
// Explicit deploy revision: bump for every SW policy/shell change. Keeping
// active and installing worker caches separate avoids cross-version mixing.
const CACHE_VERSION = "2026-11-24.8";
const PRECACHE = PREFIX + "shell-" + CACHE_VERSION;
const RUNTIME = PREFIX + "runtime-" + CACHE_VERSION;
const MAX_RUNTIME_ENTRIES = 64;
const NETWORK_TIMEOUT_MS = 5000;
const APP_SHELL = [
  "/", "/en/", "/es/",
  "/offline.html", "/en/offline.html", "/es/offline.html",
  "/assets/css/offline.css",
  "/assets/css/contrast.css",
  "/assets/js/contrast.js",
  "/assets/css/site.css",
  "/assets/css/mobile-enhancements.css",
  "/assets/css/home-screen-install.css",
  "/assets/js/site.js",
  "/assets/js/home-screen-install.js",
  "/assets/js/pwa-register.js",
  "/assets/js/webmcp.js",
  "/assets/js/webmcp-tools.mjs",
  "/assets/js/webmcp-data.mjs",
  "/assets/js/webmcp-i18n.mjs",
  "/assets/js/webmcp-services.mjs",
  "/assets/js/webmcp-services-data.mjs",
  "/site.webmanifest"
];

self.addEventListener("install", (event) => {
  // A changed worker waits for existing controlled tabs to close. Never force
  // skipWaiting: new JS/CSS must not silently replace assets in a running tab.
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(PREFIX) && name !== PRECACHE && name !== RUNTIME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

const offlinePage = (pathname) => {
  if (pathname === "/en" || pathname.startsWith("/en/")) return "/en/offline.html";
  if (pathname === "/es" || pathname.startsWith("/es/")) return "/es/offline.html";
  return "/offline.html";
};

const permitted = (request) => {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return false;
  if (url.pathname.endsWith(".pdf")) return false;
  return request.mode === "navigate" ||
    ["script", "style", "image", "font", "manifest"].includes(request.destination);
};

const cacheKey = (request) => {
  // Tracking/query parameters must not produce unbounded duplicate entries.
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return url.toString();
};

const getCached = async (request) => {
  // Query parameters can change semantics; never substitute the plain URL
  // for a query-bearing navigation while disconnected.
  if (new URL(request.url).search) return null;
  const key = cacheKey(request);
  const runtime = await caches.open(RUNTIME);
  return (await runtime.match(key)) ||
    (await (await caches.open(PRECACHE)).match(key));
};

const putRuntime = async (request, response) => {
  const url = new URL(request.url);
  if (url.search || !response || response.status !== 200 || response.redirected || response.type === "opaque" ||
      /\b(?:private|no-store)\b/i.test(response.headers.get("cache-control") || "")) return;
  try {
    const cache = await caches.open(RUNTIME);
    await cache.put(cacheKey(request), response.clone());
    const keys = await cache.keys();
    // FIFO eviction; intentionally bounded even across long browser sessions.
    if (keys.length > MAX_RUNTIME_ENTRIES) {
      await Promise.all(keys.slice(0, keys.length - MAX_RUNTIME_ENTRIES).map((key) => cache.delete(key)));
    }
  } catch {
    // Cache writes are best effort (quota/private mode). Online navigation wins.
  }
};

const cachedOrOffline = async (request) => {
  const cached = await getCached(request);
  if (cached) return cached;
  if (request.mode !== "navigate") return null;
  return (await (await caches.open(PRECACHE)).match(offlinePage(new URL(request.url).pathname))) || null;
};

const networkFirst = async (request) => {
  const controller = new AbortController();
  let timeoutId;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error("Network response deadline exceeded"));
    }, NETWORK_TIMEOUT_MS);
  });

  const load = async () => {
    const response = await fetch(request, { signal: controller.signal });
    // Temporary server failures should not defeat an otherwise usable offline
    // experience; a genuine 404 stays a 404, never cached as successful HTML.
    if (response.status >= 500) {
      return (await cachedOrOffline(request)) || response;
    }
    if (response.status === 200) {
      // fetch() resolves after headers. Drain a clone before returning so a
      // stalled response body also triggers the offline fallback on timeout.
      await response.clone().arrayBuffer();
      await putRuntime(request, response);
    }
    return response;
  };

  try {
    return await Promise.race([load(), deadline]);
  } catch {
    return (await cachedOrOffline(request)) || Response.error();
  } finally {
    clearTimeout(timeoutId);
  }
};

self.addEventListener("fetch", (event) => {
  if (!permitted(event.request)) return;
  event.respondWith(networkFirst(event.request));
});
