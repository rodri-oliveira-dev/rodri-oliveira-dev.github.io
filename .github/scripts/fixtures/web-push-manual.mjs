import { WebPushLifecycle } from "/assets/js/web-push-lifecycle.mjs";
import { WebPushView } from "/assets/js/web-push-view.mjs";

const scenarioSelect = document.querySelector("#fixture-scenario");
const scenario = new URL(location.href).searchParams.get("scenario") || "inactive";
scenarioSelect.value = scenario;
scenarioSelect.addEventListener("change", () => {
  const url = new URL(location.href);
  url.searchParams.set("scenario", scenarioSelect.value);
  location.assign(url);
});

const config = Object.freeze({
  enabled: true,
  locale: "pt-BR",
  purposeId: "new-articles-pt-br",
  consentVersion: "1.0.0",
  privacyNoticeVersion: "fixture-1.0.0",
  consentText: "Aceito o consentimento sintético para avaliar esta interface local.",
  privacyNoticeUrl: "https://fixture.invalid/privacy",
  apiBaseUrl: "https://api.fixture.invalid/",
  vapidPublicKey: "B".repeat(87),
});
const activeRecord = Object.freeze({
  subscriptionId: "sub_" + "A".repeat(43),
  cancellationCapability: "B".repeat(43),
  expiresAtUtc: "2099-11-27T12:00:00Z",
  remoteRevoked: false,
});

let stored = ["active", "backend-unavailable", "cleanup-error"].includes(scenario)
  ? activeRecord
  : scenario === "expired"
    ? { ...activeRecord, expiresAtUtc: "2025-01-01T00:00:00Z" }
    : null;
let subscription = ["active", "expired", "backend-unavailable", "cleanup-error", "recovery-required"].includes(scenario)
  ? Object.freeze({ synthetic: true })
  : null;

const browser = {
  getCapabilities: () => ({
    supported: !["install-required", "unsupported"].includes(scenario),
    installRequired: scenario === "install-required",
    permission: scenario === "permission-denied" ? "denied" : "default",
  }),
  requestPermission: async () => "granted",
  getSubscription: async () => subscription,
  subscribe: async () => {
    subscription = Object.freeze({ synthetic: true });
    return subscription;
  },
  unsubscribe: async () => {
    if (scenario === "cleanup-error") return false;
    subscription = null;
    return true;
  },
  serializeSubscription: () => ({
    endpoint: "https://push.fixture.invalid/synthetic",
    keys: { p256Dh: "synthetic-p256dh", auth: "synthetic-auth" },
  }),
};
const api = {
  register: async () => {
    if (scenario === "activation-error") throw new Error("synthetic activation failure");
    return {
      status: 201,
      data: {
        subscriptionId: activeRecord.subscriptionId,
        cancellationCapability: activeRecord.cancellationCapability,
        recoveryCapability: "C".repeat(43),
        expiresAtUtc: activeRecord.expiresAtUtc,
      },
    };
  },
  revoke: async () => ({ status: scenario === "backend-unavailable" ? 503 : 202 }),
};
const storage = {
  read: async () => stored,
  write: async (record) => { stored = structuredClone(record); },
  clear: async () => { stored = null; },
};

const root = document.querySelector("[data-web-push]");
root.querySelector("[data-web-push-privacy]").addEventListener("click", (event) => event.preventDefault());
const lifecycle = new WebPushLifecycle({
  config,
  browser,
  api,
  storage,
  view: new WebPushView(root, { config }),
  retryDelays: [],
  wait: async () => {},
  now: () => Date.parse("2026-11-27T12:00:00Z"),
});
await lifecycle.initialize();
