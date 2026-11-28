const DATABASE_NAME = "rodrigo-portfolio-web-push";
const STORE_NAME = "lifecycle";
const RECORD_KEY = "current";

const base64UrlToUint8Array = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43,200}$/.test(value)) {
    throw new Error("Invalid public key");
  }
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const decoded = atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(decoded, (character) => character.codePointAt(0));
};

const isAppleMobileContext = (navigatorLike) => {
  const platform = navigatorLike.userAgentData?.platform || navigatorLike.platform || "";
  const touchPoints = Number(navigatorLike.maxTouchPoints || 0);
  const userAgent = navigatorLike.userAgent || "";
  return (/^(iPhone|iPad|iPod)$/i.test(platform) ||
    (/^MacIntel$/i.test(platform) && touchPoints > 1) ||
    (/iPhone|iPad|iPod/i.test(userAgent) && touchPoints > 0));
};

export const detectWebPushCapabilities = ({ windowLike = window, navigatorLike = navigator } = {}) => {
  const secure = windowLike.isSecureContext === true;
  const serviceWorker = "serviceWorker" in navigatorLike;
  const notifications = "Notification" in windowLike;
  const pushManager = "PushManager" in windowLike;
  const standalone = navigatorLike.standalone === true ||
    windowLike.matchMedia?.("(display-mode: standalone)")?.matches === true;
  const appleMobile = isAppleMobileContext(navigatorLike);
  return Object.freeze({
    supported: secure && serviceWorker && notifications && pushManager && (!appleMobile || standalone),
    installRequired: secure && serviceWorker && notifications && appleMobile && !standalone,
    permission: notifications ? windowLike.Notification.permission : "unsupported",
  });
};

export class WebPushBrowserGateway {
  constructor({ windowLike = window, navigatorLike = navigator } = {}) {
    this.window = windowLike;
    this.navigator = navigatorLike;
  }

  getCapabilities() {
    return detectWebPushCapabilities({ windowLike: this.window, navigatorLike: this.navigator });
  }

  requestPermission() {
    return this.window.Notification.requestPermission();
  }

  async getSubscription() {
    const registration = await this.navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  }

  async subscribe(vapidPublicKey) {
    const registration = await this.navigator.serviceWorker.ready;
    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
    });
  }

  unsubscribe(subscription) {
    return subscription.unsubscribe();
  }

  serializeSubscription(subscription) {
    const serialized = subscription.toJSON();
    return {
      endpoint: serialized.endpoint,
      keys: {
        p256Dh: serialized.keys?.p256dh,
        auth: serialized.keys?.auth,
      },
    };
  }
}

const parseJsonSafely = async (response) => {
  try { return await response.json(); } catch { return null; }
};

const exactRegistrationResponse = (data) => data &&
  !Array.isArray(data) &&
  JSON.stringify(Object.keys(data).sort((left, right) => left.localeCompare(right))) === JSON.stringify(["cancellationCapability", "expiresAtUtc", "recoveryCapability", "subscriptionId"]) &&
  /^sub_[A-Za-z0-9_-]{43}$/.test(data.subscriptionId) &&
  /^[A-Za-z0-9_-]{43}$/.test(data.cancellationCapability) &&
  /^[A-Za-z0-9_-]{43}$/.test(data.recoveryCapability) &&
  typeof data.expiresAtUtc === "string" && Number.isFinite(Date.parse(data.expiresAtUtc));

const exactPublicConfiguration = (data) => {
  if (!data || Array.isArray(data) || typeof data.enabled !== "boolean") return false;
  const keys = Object.keys(data).sort((left, right) => left.localeCompare(right));
  if (data.enabled === false) return JSON.stringify(keys) === JSON.stringify(["enabled"]);
  return JSON.stringify(keys) === JSON.stringify(["enabled", "vapidPublicKey"]) &&
    /^[A-Za-z0-9_-]{87}$/.test(data.vapidPublicKey);
};

export class WebPushApiClient {
  constructor({ baseUrl, fetchLike = fetch, timeoutMs = 8000, AbortControllerLike = AbortController, setTimeoutLike = setTimeout, clearTimeoutLike = clearTimeout }) {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("Invalid Web Push API configuration");
    }
    this.endpoint = new URL("subscriptions", parsed.href.endsWith("/") ? parsed : parsed.href + "/").href;
    this.configurationEndpoint = new URL("web-push/config", parsed.href.endsWith("/") ? parsed : parsed.href + "/").href;
    this.fetch = fetchLike;
    this.timeoutMs = timeoutMs;
    this.AbortController = AbortControllerLike;
    this.setTimeout = setTimeoutLike;
    this.clearTimeout = clearTimeoutLike;
  }

  async getPublicConfiguration() {
    const controller = new this.AbortController();
    const timeout = this.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(this.configurationEndpoint, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const data = response.status === 200 ? await parseJsonSafely(response) : null;
      if (response.status !== 200 || !exactPublicConfiguration(data)) {
        throw new Error("Invalid Web Push public configuration");
      }
      return Object.freeze(data);
    } finally {
      this.clearTimeout(timeout);
    }
  }

  async register({ subscription, ...consent }) {
    const result = await this.#request("POST", { ...subscription, ...consent, consentGranted: true, consentMethod: "explicit-button" });
    if (result.status === 201 && !exactRegistrationResponse(result.data)) throw new Error("Invalid registration response");
    return result;
  }

  async revoke({ subscriptionId, capability }) {
    if (!/^sub_[A-Za-z0-9_-]{43}$/.test(subscriptionId) || !/^[A-Za-z0-9_-]{43}$/.test(capability)) {
      throw new Error("Invalid revocation credentials");
    }
    const result = await this.#request("DELETE", { subscriptionId, capability });
    return { status: result.status };
  }

  async #request(method, body) {
    const serializedBody = JSON.stringify(body);
    const maximumBodyBytes = method === "POST" ? 8192 : 512;
    if (new TextEncoder().encode(serializedBody).byteLength > maximumBodyBytes) {
      throw new Error("Web Push request exceeds contract limit");
    }
    const controller = new this.AbortController();
    const timeout = this.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(this.endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: serializedBody,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const data = method === "POST" && response.status === 201 ? await parseJsonSafely(response) : null;
      return { status: response.status, data };
    } finally {
      this.clearTimeout(timeout);
    }
  }
}

export class WebPushStorage {
  constructor({ indexedDBLike = indexedDB } = {}) {
    this.indexedDB = indexedDBLike;
  }

  async read() {
    return this.#transaction("readonly", (store) => store.get(RECORD_KEY));
  }

  async write(record) {
    // Endpoint, PushSubscription keys and recovery capability are deliberately excluded.
    const safeRecord = {
      subscriptionId: record.subscriptionId,
      expiresAtUtc: record.expiresAtUtc,
      remoteRevoked: record.remoteRevoked === true,
      ...(record.remoteRevoked === true ? {} : { cancellationCapability: record.cancellationCapability }),
    };
    await this.#transaction("readwrite", (store) => store.put(safeRecord, RECORD_KEY));
  }

  async clear() {
    await this.#transaction("readwrite", (store) => store.delete(RECORD_KEY));
  }

  #open() {
    return new Promise((resolve, reject) => {
      const request = this.indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Web Push storage unavailable"));
      request.onblocked = () => reject(new Error("Web Push storage blocked"));
    });
  }

  async #transaction(mode, operation) {
    const database = await this.#open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        let result = null;
        request.onsuccess = () => { result = request.result ?? null; };
        request.onerror = () => reject(new Error("Web Push storage operation failed"));
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(new Error("Web Push storage transaction aborted"));
      });
    } finally {
      database.close();
    }
  }
}

export { base64UrlToUint8Array, exactPublicConfiguration, isAppleMobileContext };
