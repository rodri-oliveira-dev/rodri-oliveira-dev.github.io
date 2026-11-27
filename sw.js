/* Progressive enhancement for a static, multilingual GitHub Pages portfolio. */
"use strict";

const PREFIX = "rodrigo-portfolio-pwa-";
// Explicit deploy revision: bump for every SW policy/shell change. Keeping
// active and installing worker caches separate avoids cross-version mixing.
const CACHE_VERSION = "2026-11-27.7";
const PRECACHE = PREFIX + "shell-" + CACHE_VERSION;
const RUNTIME = PREFIX + "runtime-" + CACHE_VERSION;
const MAX_RUNTIME_ENTRIES = 64;
const NETWORK_TIMEOUT_MS = 5000;
const PUSH_PAYLOAD_VERSION = 1;
const MAX_PUSH_PAYLOAD_BYTES = 4096;
const MAX_PUSH_LIFETIME_MS = 24 * 60 * 60 * 1000;
const PUSH_CLOCK_SKEW_MS = 5 * 60 * 1000;
const PUSH_PAYLOAD_FIELDS = ["body", "expiresAtUtc", "lang", "title", "url", "version"];
const APP_SHELL = [
  "/", "/en/", "/es/",
  "/offline.html", "/en/offline.html", "/es/offline.html",
  "/assets/css/offline.css",
  "/assets/css/contrast.css",
  "/assets/js/contrast.js",
  "/assets/css/site.css",
  "/assets/css/mobile-enhancements.css",
  "/assets/css/home-screen-install.css",
  "/assets/css/web-push.css",
  "/assets/js/site.js",
  "/assets/js/home-screen-install.js",
  "/assets/js/pwa-register.js",
  "/assets/js/web-push.mjs",
  "/assets/js/web-push-config.mjs",
  "/assets/js/web-push-lifecycle.mjs",
  "/assets/js/web-push-platform.mjs",
  "/assets/js/web-push-view.mjs",
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

const authorizedNotificationUrl = (value) => {
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const url = new URL(value);
    const allowedPath = url.pathname === "/" ||
      /^\/case-studies\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(url.pathname);
    if (url.origin !== self.location.origin || url.protocol !== "https:" ||
        url.username || url.password || url.search || url.hash || !allowedPath) return null;
    return url.href;
  } catch {
    return null;
  }
};

const boundedText = (value, maxLength) => {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength ||
      value !== value.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return null;
  return value;
};

const parsePushPayload = (rawPayload) => {
  if (typeof rawPayload !== "string" || rawPayload.length === 0 ||
      new TextEncoder().encode(rawPayload).byteLength > MAX_PUSH_PAYLOAD_BYTES) return null;
  try {
    const payload = JSON.parse(rawPayload);
    if (!payload || Array.isArray(payload) || typeof payload !== "object" ||
        JSON.stringify(Object.keys(payload).sort((left, right) => left.localeCompare(right))) !== JSON.stringify(PUSH_PAYLOAD_FIELDS) ||
        payload.version !== PUSH_PAYLOAD_VERSION || payload.lang !== "pt-BR") return null;

    const title = boundedText(payload.title, 80);
    const body = boundedText(payload.body, 160);
    const url = authorizedNotificationUrl(payload.url);
    const timestampMatch = typeof payload.expiresAtUtc === "string" &&
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?Z$/.exec(payload.expiresAtUtc);
    if (!title || !body || !url || !timestampMatch) return null;

    const expiresAt = Date.parse(payload.expiresAtUtc);
    const parsedExpiration = new Date(expiresAt);
    const calendarMatches = Number.isFinite(expiresAt) &&
      parsedExpiration.getUTCFullYear() === Number(timestampMatch[1]) &&
      parsedExpiration.getUTCMonth() === Number(timestampMatch[2]) - 1 &&
      parsedExpiration.getUTCDate() === Number(timestampMatch[3]) &&
      parsedExpiration.getUTCHours() === Number(timestampMatch[4]) &&
      parsedExpiration.getUTCMinutes() === Number(timestampMatch[5]) &&
      parsedExpiration.getUTCSeconds() === Number(timestampMatch[6]);
    const remainingLifetime = expiresAt - Date.now();
    if (!calendarMatches || remainingLifetime <= 0 ||
        remainingLifetime > MAX_PUSH_LIFETIME_MS + PUSH_CLOCK_SKEW_MS) return null;
    return { title, body, url };
  } catch {
    return null;
  }
};

const showPushNotification = async (event) => {
  if (!event.data) return;
  let rawPayload;
  try {
    rawPayload = event.data.text();
  } catch {
    return;
  }
  const payload = parsePushPayload(rawPayload);
  if (!payload) return;
  try {
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
      icon: "/assets/brand/android-icon-192x192.png",
      badge: "/assets/brand/android-icon-192x192.png",
      lang: "pt-BR",
      tag: "new-article-pt-br"
    });
  } catch {
    // Notification display is best effort; never retry or expose payload data.
  }
};

self.addEventListener("push", (event) => {
  event.waitUntil(showPushNotification(event));
});

const openNotificationTarget = async (value) => {
  const target = authorizedNotificationUrl(value);
  if (!target) return;

  let windows = [];
  try {
    windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  } catch {
    // Opening a new window remains a safe fallback.
  }
  for (const client of windows) {
    try {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin !== self.location.origin) continue;
      if (client.url !== target) {
        if (typeof client.navigate !== "function") continue;
        await client.navigate(target);
      }
      await client.focus();
      return;
    } catch {
      // Try another same-origin window, then the safe openWindow fallback.
    }
  }
  try {
    await self.clients.openWindow(target);
  } catch {
    // The browser may reject window creation; no alternate destination is used.
  }
};

self.addEventListener("notificationclick", (event) => {
  try {
    event.notification.close();
  } catch {
    // Closing is best effort and must not bypass destination validation.
  }
  event.waitUntil(openNotificationTarget(event.notification?.data?.url));
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
