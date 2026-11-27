const STATES = Object.freeze({
  DISABLED: "disabled",
  CHECKING: "checking",
  INSTALL_REQUIRED: "install-required",
  UNSUPPORTED: "unsupported",
  INACTIVE: "inactive",
  PERMISSION_DENIED: "permission-denied",
  ACTIVATING: "activating",
  ACTIVE: "active",
  CAPABILITY_LOST: "capability-lost",
  CANCELING_REMOTE: "canceling-remote",
  CANCELING_LOCAL: "canceling-local",
  CANCEL_PENDING_REMOTE: "cancel-pending-remote",
  CANCEL_PENDING_LOCAL: "cancel-pending-local",
  EXPIRED: "expired",
  RECOVERY_REQUIRED: "recovery-required",
  ERROR: "error",
});

const EVENTS = Object.freeze({
  CHECK: "check",
  DISABLE: "disable",
  REQUIRE_INSTALL: "require-install",
  REJECT_CAPABILITY: "reject-capability",
  READY: "ready",
  DENY_PERMISSION: "deny-permission",
  ACTIVATE: "activate",
  ACTIVATE_OK: "activate-ok",
  RESTORE_ACTIVE: "restore-active",
  LOSE_CAPABILITY: "lose-capability",
  FAIL: "fail",
  CANCEL_REMOTE: "cancel-remote",
  CANCEL_REMOTE_PENDING: "cancel-remote-pending",
  RESTORE_REMOTE_PENDING: "restore-remote-pending",
  CANCEL_LOCAL: "cancel-local",
  CANCEL_LOCAL_PENDING: "cancel-local-pending",
  RESTORE_LOCAL_PENDING: "restore-local-pending",
  CANCEL_OK: "cancel-ok",
  EXPIRE: "expire",
  REQUIRE_RECOVERY: "require-recovery",
});

const TRANSITIONS = Object.freeze({
  [EVENTS.DISABLE]: new Set(Object.values(STATES)),
  [EVENTS.CHECK]: new Set(Object.values(STATES)),
  [EVENTS.REQUIRE_INSTALL]: new Set([STATES.CHECKING]),
  [EVENTS.REJECT_CAPABILITY]: new Set([STATES.CHECKING]),
  [EVENTS.READY]: new Set([STATES.CHECKING, STATES.ERROR, STATES.PERMISSION_DENIED]),
  [EVENTS.DENY_PERMISSION]: new Set([STATES.CHECKING, STATES.ACTIVATING]),
  [EVENTS.ACTIVATE]: new Set([STATES.INACTIVE, STATES.ERROR]),
  [EVENTS.ACTIVATE_OK]: new Set([STATES.ACTIVATING]),
  [EVENTS.RESTORE_ACTIVE]: new Set([STATES.CHECKING]),
  [EVENTS.LOSE_CAPABILITY]: new Set([STATES.CHECKING]),
  [EVENTS.FAIL]: new Set(Object.values(STATES)),
  [EVENTS.CANCEL_REMOTE]: new Set([
    STATES.ACTIVE, STATES.CAPABILITY_LOST, STATES.EXPIRED, STATES.CANCEL_PENDING_REMOTE,
    STATES.RECOVERY_REQUIRED,
  ]),
  [EVENTS.CANCEL_REMOTE_PENDING]: new Set([STATES.CANCELING_REMOTE]),
  [EVENTS.RESTORE_REMOTE_PENDING]: new Set([STATES.CHECKING]),
  [EVENTS.CANCEL_LOCAL]: new Set([
    STATES.CHECKING, STATES.CANCELING_REMOTE, STATES.CANCEL_PENDING_LOCAL,
  ]),
  [EVENTS.CANCEL_LOCAL_PENDING]: new Set([STATES.CANCELING_LOCAL]),
  [EVENTS.RESTORE_LOCAL_PENDING]: new Set([STATES.CHECKING]),
  [EVENTS.CANCEL_OK]: new Set([STATES.CANCELING_LOCAL, STATES.CANCEL_PENDING_LOCAL]),
  [EVENTS.EXPIRE]: new Set([STATES.CHECKING, STATES.ACTIVE]),
  [EVENTS.REQUIRE_RECOVERY]: new Set([
    STATES.CHECKING, STATES.ACTIVATING, STATES.CANCELING_REMOTE, STATES.ERROR,
  ]),
});

const EVENT_TARGETS = Object.freeze({
  [EVENTS.DISABLE]: STATES.DISABLED,
  [EVENTS.CHECK]: STATES.CHECKING,
  [EVENTS.REQUIRE_INSTALL]: STATES.INSTALL_REQUIRED,
  [EVENTS.REJECT_CAPABILITY]: STATES.UNSUPPORTED,
  [EVENTS.READY]: STATES.INACTIVE,
  [EVENTS.DENY_PERMISSION]: STATES.PERMISSION_DENIED,
  [EVENTS.ACTIVATE]: STATES.ACTIVATING,
  [EVENTS.ACTIVATE_OK]: STATES.ACTIVE,
  [EVENTS.RESTORE_ACTIVE]: STATES.ACTIVE,
  [EVENTS.LOSE_CAPABILITY]: STATES.CAPABILITY_LOST,
  [EVENTS.FAIL]: STATES.ERROR,
  [EVENTS.CANCEL_REMOTE]: STATES.CANCELING_REMOTE,
  [EVENTS.CANCEL_REMOTE_PENDING]: STATES.CANCEL_PENDING_REMOTE,
  [EVENTS.RESTORE_REMOTE_PENDING]: STATES.CANCEL_PENDING_REMOTE,
  [EVENTS.CANCEL_LOCAL]: STATES.CANCELING_LOCAL,
  [EVENTS.CANCEL_LOCAL_PENDING]: STATES.CANCEL_PENDING_LOCAL,
  [EVENTS.RESTORE_LOCAL_PENDING]: STATES.CANCEL_PENDING_LOCAL,
  [EVENTS.CANCEL_OK]: STATES.INACTIVE,
  [EVENTS.EXPIRE]: STATES.EXPIRED,
  [EVENTS.REQUIRE_RECOVERY]: STATES.RECOVERY_REQUIRED,
});

const DEFAULT_RETRY_DELAYS_MS = Object.freeze([250, 750, 1500]);
const SUBSCRIPTION_ID_PATTERN = /^sub_[A-Za-z0-9_-]{43}$/;
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const validHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
};

const validConfig = (config) => config?.enabled === true &&
  config.locale === "pt-BR" &&
  config.purposeId === "new-articles-pt-br" &&
  config.consentVersion === "1.0.0" &&
  typeof config.privacyNoticeVersion === "string" &&
  config.privacyNoticeVersion.length > 0 &&
  typeof config.consentText === "string" &&
  config.consentText.length > 0 &&
  validHttpsUrl(config.privacyNoticeUrl) &&
  validHttpsUrl(config.apiBaseUrl) &&
  /^[A-Za-z0-9_-]{43,200}$/.test(config.vapidPublicKey);

const validStoredRecord = (record) => Boolean(record &&
  SUBSCRIPTION_ID_PATTERN.test(record.subscriptionId) &&
  typeof record.expiresAtUtc === "string" && Number.isFinite(Date.parse(record.expiresAtUtc)) &&
  (record.remoteRevoked === true || CAPABILITY_PATTERN.test(record.cancellationCapability)));

export const transition = (state, event, detail = null) => {
  if (!TRANSITIONS[event]?.has(state.name)) {
    throw new Error("Invalid Web Push lifecycle transition");
  }
  return Object.freeze({ name: EVENT_TARGETS[event], detail });
};

export class WebPushLifecycle {
  #state = Object.freeze({ name: STATES.DISABLED, detail: null });
  #operation = null;
  #recoveryBundle = null;

  constructor({ config, browser, api, storage, view, wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)), retryDelays = DEFAULT_RETRY_DELAYS_MS, now = () => Date.now() }) {
    this.config = config;
    this.browser = browser;
    this.api = api;
    this.storage = storage;
    this.view = view;
    this.wait = wait;
    this.retryDelays = retryDelays;
    this.now = now;
    this.view.bind({
      activate: (consentGranted) => this.activate(consentGranted),
      cancel: () => this.cancel(),
      retry: () => this.retry(),
      recover: (bundle) => this.recoverAndCancel(bundle),
      exportRecovery: () => this.exportRecovery(),
    });
    this.#render();
  }

  get state() { return this.#state; }

  #move(event, detail = null) {
    this.#state = transition(this.#state, event, detail);
    this.#render();
  }

  #render() {
    this.view.render(this.#state, { recoveryAvailable: Boolean(this.#recoveryBundle) });
  }

  async initialize() {
    if (!validConfig(this.config)) {
      this.#move(EVENTS.DISABLE, "public-gate");
      return this.#state;
    }
    return this.#runOnce("initialize", async () => {
      this.#move(EVENTS.CHECK);
      try {
        const capabilities = this.browser.getCapabilities();
        const record = await this.storage.read();
        if (validStoredRecord(record)) {
          if (record.remoteRevoked === true) {
            this.#move(EVENTS.RESTORE_LOCAL_PENDING, "local-cleanup");
          } else if (Date.parse(record.expiresAtUtc) <= this.now()) {
            this.#move(EVENTS.EXPIRE, record);
          } else if (!capabilities.supported || capabilities.permission === "denied") {
            this.#move(EVENTS.LOSE_CAPABILITY, record);
          } else if (await this.browser.getSubscription()) {
            this.#move(EVENTS.RESTORE_ACTIVE, record);
          } else {
            this.#move(EVENTS.RESTORE_REMOTE_PENDING, record);
          }
          return;
        }
        if (capabilities.installRequired) {
          this.#move(EVENTS.REQUIRE_INSTALL);
        } else if (!capabilities.supported) {
          this.#move(EVENTS.REJECT_CAPABILITY);
        } else if (await this.browser.getSubscription()) {
          this.#move(EVENTS.REQUIRE_RECOVERY, "missing-capability");
        } else if (capabilities.permission === "denied") {
          this.#move(EVENTS.DENY_PERMISSION);
        } else {
          this.#move(EVENTS.READY);
        }
      } catch {
        this.#move(EVENTS.FAIL, "capability-check-failed");
      }
    });
  }

  async activate(consentGranted = false) {
    if (consentGranted !== true || !validConfig(this.config) || ![STATES.INACTIVE, STATES.ERROR].includes(this.#state.name)) return this.#state;
    return this.#runOnce("activate", async () => {
      this.#move(EVENTS.ACTIVATE);
      // Invoke the native prompt synchronously from the click handler before any await.
      let permission;
      try {
        const permissionPromise = this.browser.requestPermission();
        permission = await permissionPromise;
      } catch {
        this.#move(EVENTS.FAIL, "permission-request-failed");
        return;
      }
      if (permission !== "granted") {
        this.#move(EVENTS.DENY_PERMISSION);
        return;
      }

      let subscription;
      try {
        subscription = await this.browser.subscribe(this.config.vapidPublicKey);
        const response = await this.api.register({
          subscription: this.browser.serializeSubscription(subscription),
          locale: this.config.locale,
          purposeId: this.config.purposeId,
          consentVersion: this.config.consentVersion,
          privacyNoticeVersion: this.config.privacyNoticeVersion,
        });
        if (response.status !== 201) {
          try { await this.browser.unsubscribe(subscription); } catch { /* best effort */ }
          this.#move(EVENTS.REQUIRE_RECOVERY, "registration-not-created");
          return;
        }
        if (Date.parse(response.data.expiresAtUtc) <= this.now()) throw new Error("Invalid expiration");
        const record = Object.freeze({
          subscriptionId: response.data.subscriptionId,
          cancellationCapability: response.data.cancellationCapability,
          expiresAtUtc: response.data.expiresAtUtc,
          remoteRevoked: false,
        });
        this.#recoveryBundle = Object.freeze({
          subscriptionId: response.data.subscriptionId,
          recoveryCapability: response.data.recoveryCapability,
        });
        await this.storage.write(record);
        this.#move(EVENTS.ACTIVATE_OK, record);
      } catch {
        if (subscription) {
          try { await this.browser.unsubscribe(subscription); } catch { /* best effort */ }
        }
        this.#move(this.#recoveryBundle ? EVENTS.REQUIRE_RECOVERY : EVENTS.FAIL,
          this.#recoveryBundle ? "local-storage-failed" : "activation-uncertain");
      }
    });
  }

  async cancel() {
    if (![STATES.ACTIVE, STATES.CAPABILITY_LOST, STATES.EXPIRED, STATES.CANCEL_PENDING_REMOTE].includes(this.#state.name)) return this.#state;
    return this.#runOnce("cancel", async () => {
      let record;
      try { record = await this.storage.read(); } catch {
        this.#move(EVENTS.FAIL, "storage-unavailable");
        return;
      }
      if (!validStoredRecord(record) || record.remoteRevoked === true) {
        this.#move(EVENTS.REQUIRE_RECOVERY, "missing-cancellation-capability");
        return;
      }
      this.#move(EVENTS.CANCEL_REMOTE, record);
      const accepted = await this.#revokeWithBackoff({
        subscriptionId: record.subscriptionId,
        capability: record.cancellationCapability,
      });
      if (!accepted) {
        this.#move(EVENTS.CANCEL_REMOTE_PENDING, record);
        return;
      }

      const cleanupRecord = Object.freeze({
        subscriptionId: record.subscriptionId,
        expiresAtUtc: record.expiresAtUtc,
        remoteRevoked: true,
      });
      // Persist the terminal remote result before attempting the non-atomic local step.
      try { await this.storage.write(cleanupRecord); } catch { /* continue with safe local cleanup */ }
      this.#move(EVENTS.CANCEL_LOCAL, cleanupRecord);
      await this.#cleanupLocalSubscription(cleanupRecord);
    });
  }

  async retry() {
    if (this.#state.name === STATES.CANCEL_PENDING_REMOTE) return this.cancel();
    if (this.#state.name === STATES.CANCEL_PENDING_LOCAL) {
      return this.#runOnce("cleanup", async () => {
        try {
          const record = await this.storage.read();
          await this.#cleanupLocalSubscription(record);
        } catch {
          this.#move(EVENTS.FAIL, "storage-unavailable");
        }
      });
    }
    return this.initialize();
  }

  async recoverAndCancel(bundle) {
    if (!validConfig(this.config) || this.#state.name !== STATES.RECOVERY_REQUIRED) return this.#state;
    if (!bundle || !SUBSCRIPTION_ID_PATTERN.test(bundle.subscriptionId) || !CAPABILITY_PATTERN.test(bundle.recoveryCapability)) return this.#state;
    return this.#runOnce("recover", async () => {
      this.#state = transition(this.#state, EVENTS.CANCEL_REMOTE, "recovery");
      this.#render();
      const accepted = await this.#revokeWithBackoff({
        subscriptionId: bundle.subscriptionId,
        capability: bundle.recoveryCapability,
      });
      if (!accepted) {
        this.#move(EVENTS.REQUIRE_RECOVERY, "retry-recovery");
        return;
      }
      const cleanupRecord = Object.freeze({
        subscriptionId: bundle.subscriptionId,
        expiresAtUtc: new Date(this.now()).toISOString(),
        remoteRevoked: true,
      });
      try { await this.storage.write(cleanupRecord); } catch { /* continue with safe local cleanup */ }
      this.#move(EVENTS.CANCEL_LOCAL, cleanupRecord);
      await this.#cleanupLocalSubscription(cleanupRecord);
    });
  }

  exportRecovery() {
    if (!this.#recoveryBundle) return;
    this.view.downloadRecovery(this.#recoveryBundle);
    this.#recoveryBundle = null;
    this.#render();
  }

  async #cleanupLocalSubscription(record) {
    try {
      const subscription = await this.browser.getSubscription();
      const removed = !subscription || await this.browser.unsubscribe(subscription);
      if (!removed) throw new Error("Local subscription remains");
      await this.storage.clear();
      this.#recoveryBundle = null;
      this.#move(EVENTS.CANCEL_OK);
    } catch {
      try { await this.storage.write(record); } catch { /* retain in memory for this page */ }
      this.#move(EVENTS.CANCEL_LOCAL_PENDING, "remote-revoked");
    }
  }

  async #revokeWithBackoff(credentials) {
    for (let attempt = 0; attempt <= this.retryDelays.length; attempt += 1) {
      try {
        const response = await this.api.revoke(credentials);
        if (response.status === 202) return true;
        if (![429, 503].includes(response.status)) return false;
      } catch {
        // A lost response is retried with the same idempotency credentials.
      }
      if (attempt < this.retryDelays.length) await this.wait(this.retryDelays[attempt]);
    }
    return false;
  }

  #runOnce(_name, operation) {
    if (this.#operation) return this.#operation;
    let result;
    try {
      result = operation();
    } catch (error) {
      result = Promise.reject(error);
    }
    this.#operation = Promise.resolve(result).finally(() => {
      this.#operation = null;
    });
    return this.#operation;
  }
}

export { EVENTS, STATES, validConfig, validStoredRecord };
