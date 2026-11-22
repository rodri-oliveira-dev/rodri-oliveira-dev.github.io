/* Progressive enhancement for a static, multilingual GitHub Pages portfolio. */
"use strict";

const PREFIX = "rodrigo-portfolio-pwa-";
// Explicit deploy revision: bump for every SW policy/shell change. Keeping
// active and installing worker caches separate avoids cross-version mixing.
const CACHE_VERSION = "2026-11-22.1";
const PRECACHE = PREFIX + "shell-" + CACHE_VERSION;
const RUNTIME = PREFIX + "runtime-" + CACHE_VERSION;
const MAX_RUNTIME_ENTRIES = 64;
const NETWORK_TIMEOUT_MS = 5000;
const APP_SHELL = [
  "/", "/en/", "/es/",
  "/offline.html", "/en/offline.html", "/es/offline.html",
  "/assets/css/offline.css",
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
  if (pathname.startsWith("/en/")) return "/en/offline.html";
  if (pathname.startsWith("/es/")) return "/es/offline.html";
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
  if (url.search || !response || !response.ok || response.redirected || response.type === "opaque") return;
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

const onlineResponse = async (request) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const networkFirst = async (request) => {
  try {
    const response = await onlineResponse(request);
    // Never cache errors, redirects, opaque responses or private/external data.
    if (response.ok) await putRuntime(request, response);
    return response;
  } catch {
    const cached = await getCached(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await caches.match(offlinePage(new URL(request.url).pathname));
      if (fallback) return fallback;
    }
    return Response.error();
  }
};

self.addEventListener("fetch", (event) => {
  if (!permitted(event.request)) return;
  event.respondWith(networkFirst(event.request));
});
