import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { STATES, WebPushLifecycle, validConfig } from "../../assets/js/web-push-lifecycle.mjs";
import { WebPushApiClient, base64UrlToUint8Array, detectWebPushCapabilities } from "../../assets/js/web-push-platform.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const consentFixture = JSON.parse(read(".github/scripts/fixtures/web-push-consent.json"));
const CONFIG = Object.freeze({
  enabled: true,
  locale: "pt-BR",
  purposeId: consentFixture.purposeId,
  consentVersion: consentFixture.consentVersion,
  privacyNoticeVersion: consentFixture.privacyNoticeVersion,
  consentText: consentFixture.consentText,
  privacyNoticeUrl: consentFixture.privacyNoticeUrl,
  apiBaseUrl: "https://api.fixture.invalid/api/",
  vapidPublicKey: "BCfE1kcD7xO6UF4uXkW7DPPxABEiMZLVmt2t6AUjBshHmM3IYwk6knm8LJg5WXwPBqoJas1Hq4X6j2pQWl2AA0U",
});
const ACTIVE_RECORD = Object.freeze({
  subscriptionId: "sub_" + "A".repeat(43),
  cancellationCapability: "B".repeat(43),
  expiresAtUtc: "2027-11-27T12:00:00Z",
  remoteRevoked: false,
});

const createHarness = ({
  config = CONFIG,
  record = null,
  subscription = null,
  permission = "default",
  supported = true,
  installRequired = false,
  registerResponse,
  revokeResponses = [{ status: 202 }],
  unsubscribeResults = [true],
  now = Date.parse("2026-11-27T12:00:00Z"),
} = {}) => {
  const calls = { permission: 0, subscribe: 0, unsubscribe: 0, register: 0, revoke: 0, waits: [], writes: [], clears: 0, renders: [], downloads: [] };
  let stored = record;
  let currentSubscription = subscription;
  let actions;
  const browser = {
    getCapabilities: () => ({ supported, installRequired, permission }),
    requestPermission: () => { calls.permission += 1; return Promise.resolve(permission === "denied" ? "denied" : "granted"); },
    getSubscription: async () => currentSubscription,
    subscribe: async () => {
      calls.subscribe += 1;
      currentSubscription = { synthetic: true };
      return currentSubscription;
    },
    unsubscribe: async () => {
      calls.unsubscribe += 1;
      const result = unsubscribeResults[Math.min(calls.unsubscribe - 1, unsubscribeResults.length - 1)];
      if (result instanceof Error) throw result;
      if (result) currentSubscription = null;
      return result;
    },
    serializeSubscription: () => ({ endpoint: "https://push.fixture.invalid/send/synthetic", keys: { p256Dh: "p256-synthetic", auth: "auth-synthetic" } }),
  };
  const api = {
    register: async (payload) => {
      calls.register += 1;
      calls.registrationPayload = payload;
      return registerResponse || { status: 201, data: { ...ACTIVE_RECORD, recoveryCapability: "recover_synthetic_capability" } };
    },
    revoke: async (payload) => {
      calls.revoke += 1;
      calls.revocationPayload = payload;
      const result = revokeResponses[Math.min(calls.revoke - 1, revokeResponses.length - 1)];
      if (result instanceof Error) throw result;
      return result;
    },
  };
  const storage = {
    read: async () => stored,
    write: async (value) => { stored = structuredClone(value); calls.writes.push(stored); },
    clear: async () => { stored = null; calls.clears += 1; },
  };
  const view = {
    bind: (boundActions) => { actions = boundActions; },
    render: (state, options) => calls.renders.push({ state: structuredClone(state), options }),
    downloadRecovery: (bundle) => calls.downloads.push(structuredClone(bundle)),
  };
  const lifecycle = new WebPushLifecycle({
    config, browser, api, storage, view,
    wait: async (delay) => { calls.waits.push(delay); },
    retryDelays: [10, 20],
    now: () => now,
  });
  return { lifecycle, calls, actions: () => actions, getStored: () => stored };
};

test("public PT-BR shell is gated off and EN/ES remain free of Web Push controls", () => {
  const pt = read("index.html");
  const en = read("en/index.html");
  const es = read("es/index.html");
  const config = read("assets/js/web-push-config.mjs");
  assert.match(pt, /data-web-push/);
  assert.match(pt, /web-push\.mjs/);
  assert.doesNotMatch(en, /data-web-push|web-push\.mjs/);
  assert.doesNotMatch(es, /data-web-push|web-push\.mjs/);
  assert.match(config, /enabled: false/);
  assert.match(config, /apiBaseUrl: null/);
  assert.match(config, /vapidPublicKey: null/);
  assert.match(config, /privacyNoticeVersion: null/);
  assert.doesNotMatch(pt, new RegExp(consentFixture.consentText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("disabled public gate never inspects browser, storage, permission or API", async () => {
  const disabled = createHarness({ config: { ...CONFIG, enabled: false } });
  disabled.lifecycle.browser.getCapabilities = () => { throw new Error("must not inspect browser"); };
  await disabled.lifecycle.initialize();
  await disabled.lifecycle.activate(true);
  assert.equal(disabled.lifecycle.state.name, STATES.DISABLED);
  assert.equal(disabled.calls.permission, 0);
  assert.equal(disabled.calls.subscribe, 0);
  assert.equal(disabled.calls.register, 0);
});

test("capability detection combines secure APIs and iOS standalone context", () => {
  const Notification = { permission: "default" };
  const baseWindow = { isSecureContext: true, Notification, PushManager: class {}, matchMedia: () => ({ matches: false }) };
  const ios = { serviceWorker: {}, platform: "MacIntel", maxTouchPoints: 5, userAgent: "Synthetic browser" };
  assert.deepEqual(detectWebPushCapabilities({ windowLike: baseWindow, navigatorLike: ios }), {
    supported: false, installRequired: true, permission: "default",
  });
  assert.equal(detectWebPushCapabilities({
    windowLike: { ...baseWindow, matchMedia: () => ({ matches: true }) }, navigatorLike: ios,
  }).supported, true);
  assert.equal(detectWebPushCapabilities({
    windowLike: { ...baseWindow, isSecureContext: false }, navigatorLike: { serviceWorker: {}, platform: "Linux", maxTouchPoints: 0 },
  }).supported, false);
});

test("initialization reports install, unsupported and denied states without prompting", async () => {
  for (const [options, expected] of [
    [{ installRequired: true }, STATES.INSTALL_REQUIRED],
    [{ supported: false }, STATES.UNSUPPORTED],
    [{ permission: "denied" }, STATES.PERMISSION_DENIED],
  ]) {
    const harness = createHarness(options);
    await harness.lifecycle.initialize();
    assert.equal(harness.lifecycle.state.name, expected);
    assert.equal(harness.calls.permission, 0);
    assert.equal(harness.calls.subscribe, 0);
  }
});

test("activation requires affirmative consent and requests permission only from the action", async () => {
  const harness = createHarness();
  await harness.lifecycle.initialize();
  await harness.lifecycle.activate(false);
  assert.equal(harness.calls.permission, 0);
  assert.equal(harness.calls.subscribe, 0);
  await harness.actions().activate(true);
  assert.equal(harness.lifecycle.state.name, STATES.ACTIVE);
  assert.equal(harness.calls.permission, 1);
  assert.equal(harness.calls.subscribe, 1);
  assert.equal(harness.calls.register, 1);
  assert.equal(harness.calls.registrationPayload.consentVersion, "1.0.0");
  assert.equal(harness.calls.registrationPayload.purposeId, "new-articles-pt-br");
  assert.equal(harness.getStored().cancellationCapability, "B".repeat(43));
  assert.equal("endpoint" in harness.getStored(), false);
  assert.equal("recoveryCapability" in harness.getStored(), false);
  harness.actions().exportRecovery();
  assert.deepEqual(harness.calls.downloads, [{ subscriptionId: "sub_" + "A".repeat(43), recoveryCapability: "recover_synthetic_capability" }]);
});

test("native permission failure is recoverable and never reaches subscribe", async () => {
  const harness = createHarness();
  harness.lifecycle.browser.requestPermission = () => {
    harness.calls.permission += 1;
    return Promise.reject(new Error("synthetic permission failure"));
  };
  await harness.lifecycle.initialize();
  await harness.lifecycle.activate(true);
  assert.equal(harness.lifecycle.state.name, STATES.ERROR);
  assert.equal(harness.calls.permission, 1);
  assert.equal(harness.calls.subscribe, 0);
});

test("registration conflict or uncertain failure never retries or automatically resubscribes", async () => {
  const conflict = createHarness({ registerResponse: { status: 202, data: null } });
  await conflict.lifecycle.initialize();
  await conflict.lifecycle.activate(true);
  assert.equal(conflict.lifecycle.state.name, STATES.RECOVERY_REQUIRED);
  assert.equal(conflict.calls.register, 1);
  assert.equal(conflict.calls.unsubscribe, 1);
  assert.equal(conflict.calls.subscribe, 1);

  const failure = createHarness({ registerResponse: new Error("synthetic") });
  failure.lifecycle.api.register = async () => { failure.calls.register += 1; throw new Error("synthetic"); };
  await failure.lifecycle.initialize();
  await failure.lifecycle.activate(true);
  assert.equal(failure.lifecycle.state.name, STATES.ERROR);
  await failure.lifecycle.initialize();
  assert.equal(failure.calls.subscribe, 1);
  assert.equal(failure.calls.register, 1);
});

test("remote cancellation is retried idempotently before local unsubscribe", async () => {
  const harness = createHarness({
    record: ACTIVE_RECORD,
    subscription: { synthetic: true },
    revokeResponses: [new Error("offline"), { status: 503 }, { status: 202 }],
  });
  await harness.lifecycle.initialize();
  await harness.lifecycle.cancel();
  assert.equal(harness.lifecycle.state.name, STATES.INACTIVE);
  assert.equal(harness.calls.revoke, 3);
  assert.deepEqual(harness.calls.waits, [10, 20]);
  assert.equal(harness.calls.unsubscribe, 1);
  assert.equal(harness.calls.clears, 1);
  assert.deepEqual(harness.calls.revocationPayload, {
    subscriptionId: ACTIVE_RECORD.subscriptionId,
    capability: ACTIVE_RECORD.cancellationCapability,
  });
});

test("backend failure preserves capability and never performs local unsubscribe", async () => {
  const harness = createHarness({
    record: ACTIVE_RECORD,
    subscription: { synthetic: true },
    revokeResponses: [{ status: 503 }],
  });
  await harness.lifecycle.initialize();
  await harness.lifecycle.cancel();
  assert.equal(harness.lifecycle.state.name, STATES.CANCEL_PENDING_REMOTE);
  assert.equal(harness.calls.unsubscribe, 0);
  assert.equal(harness.getStored().cancellationCapability, ACTIVE_RECORD.cancellationCapability);
});

test("partial local failure removes cancellation capability only after remote 202 and supports retry", async () => {
  const harness = createHarness({
    record: ACTIVE_RECORD,
    subscription: { synthetic: true },
    unsubscribeResults: [false, true],
  });
  await harness.lifecycle.initialize();
  await harness.lifecycle.cancel();
  assert.equal(harness.lifecycle.state.name, STATES.CANCEL_PENDING_LOCAL);
  assert.equal(harness.getStored().remoteRevoked, true);
  assert.equal("cancellationCapability" in harness.getStored(), false);
  await harness.lifecycle.retry();
  assert.equal(harness.lifecycle.state.name, STATES.INACTIVE);
  assert.equal(harness.calls.revoke, 1);
  assert.equal(harness.calls.unsubscribe, 2);
});

test("concurrent cancellation actions collapse into one lifecycle operation", async () => {
  let release;
  const harness = createHarness({ record: ACTIVE_RECORD, subscription: { synthetic: true } });
  harness.lifecycle.api.revoke = () => {
    harness.calls.revoke += 1;
    return new Promise((resolve) => { release = () => resolve({ status: 202 }); });
  };
  await harness.lifecycle.initialize();
  const first = harness.lifecycle.cancel();
  const second = harness.lifecycle.cancel();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await Promise.all([first, second]);
  assert.equal(harness.calls.revoke, 1);
  assert.equal(harness.calls.unsubscribe, 1);
});

test("expiration and missing local subscription never trigger renewal", async () => {
  const expired = createHarness({ record: { ...ACTIVE_RECORD, expiresAtUtc: "2025-01-01T00:00:00Z" }, subscription: { synthetic: true } });
  await expired.lifecycle.initialize();
  assert.equal(expired.lifecycle.state.name, STATES.EXPIRED);
  assert.equal(expired.calls.subscribe, 0);

  const missing = createHarness({ record: ACTIVE_RECORD, subscription: null });
  await missing.lifecycle.initialize();
  assert.equal(missing.lifecycle.state.name, STATES.CANCEL_PENDING_REMOTE);
  assert.equal(missing.calls.subscribe, 0);
});

test("bfcache-style reinitialization only reconciles state", async () => {
  const harness = createHarness({ record: ACTIVE_RECORD, subscription: { synthetic: true } });
  await harness.lifecycle.initialize();
  await harness.lifecycle.initialize();
  assert.equal(harness.lifecycle.state.name, STATES.ACTIVE);
  assert.equal(harness.calls.permission, 0);
  assert.equal(harness.calls.subscribe, 0);
  assert.equal(harness.calls.register, 0);
});

test("loss of browser capability preserves remote cancellation without resubscribe", async () => {
  const harness = createHarness({ record: ACTIVE_RECORD, subscription: { synthetic: true }, supported: false });
  await harness.lifecycle.initialize();
  assert.equal(harness.lifecycle.state.name, STATES.CAPABILITY_LOST);
  assert.equal(harness.calls.subscribe, 0);
  await harness.lifecycle.cancel();
  assert.equal(harness.calls.revoke, 1);
  assert.equal(harness.calls.subscribe, 0);
});

test("recovery uses an independent capability in the request body and then cleans locally", async () => {
  const harness = createHarness({ subscription: { synthetic: true } });
  await harness.lifecycle.initialize();
  assert.equal(harness.lifecycle.state.name, STATES.RECOVERY_REQUIRED);
  await harness.lifecycle.recoverAndCancel({ subscriptionId: "sub_" + "R".repeat(43), recoveryCapability: "S".repeat(43) });
  assert.deepEqual(harness.calls.revocationPayload, { subscriptionId: "sub_" + "R".repeat(43), capability: "S".repeat(43) });
  assert.equal(harness.lifecycle.state.name, STATES.INACTIVE);
});

test("API transport keeps capabilities out of URLs and disables credentials, redirects, cache and referrer", async () => {
  const requests = [];
  const client = new WebPushApiClient({
    baseUrl: "https://api.fixture.invalid/api/",
    fetchLike: async (url, options) => { requests.push({ url, options }); return { status: 202, json: async () => null }; },
  });
  await client.revoke({ subscriptionId: "sub_" + "D".repeat(43), capability: "E".repeat(43) });
  assert.equal(requests[0].url, "https://api.fixture.invalid/api/subscriptions");
  assert.doesNotMatch(requests[0].url, /sub_|EEEE/);
  assert.deepEqual({
    credentials: requests[0].options.credentials,
    cache: requests[0].options.cache,
    redirect: requests[0].options.redirect,
    referrerPolicy: requests[0].options.referrerPolicy,
  }, { credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
  assert.ok(requests[0].options.signal);
  assert.deepEqual(JSON.parse(requests[0].options.body), { subscriptionId: "sub_" + "D".repeat(43), capability: "E".repeat(43) });
  assert.throws(() => new WebPushApiClient({ baseUrl: "http://api.fixture.invalid/api/" }));
});

test("VAPID conversion validates bounded base64url input", () => {
  assert.equal(base64UrlToUint8Array(CONFIG.vapidPublicKey).byteLength, 65);
  assert.throws(() => base64UrlToUint8Array("not-a-key"));
  assert.equal(validConfig(CONFIG), true);
});

test("frontend implementation contains no logging or public endpoint/key literals", () => {
  const sources = [
    "assets/js/web-push-config.mjs", "assets/js/web-push-lifecycle.mjs",
    "assets/js/web-push-platform.mjs", "assets/js/web-push-view.mjs", "assets/js/web-push.mjs",
  ].map(read).join("\n");
  assert.doesNotMatch(sources, /console\.|sendBeacon|analytics|telemetry/i);
  assert.doesNotMatch(read("assets/js/web-push-config.mjs"), /https:\/\/|api\/subscriptions|[A-Za-z0-9_-]{80,}/);
});
