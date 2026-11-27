import { WEB_PUSH_CONFIG } from "./web-push-config.mjs";
import { WebPushLifecycle } from "./web-push-lifecycle.mjs";
import { WebPushApiClient, WebPushBrowserGateway, WebPushStorage } from "./web-push-platform.mjs";
import { WebPushView } from "./web-push-view.mjs";

const root = document.querySelector("[data-web-push]");
if (root) {
  const view = new WebPushView(root, { config: WEB_PUSH_CONFIG });
  const disabledApi = Object.freeze({
    register: async () => { throw new Error("Web Push is disabled"); },
    revoke: async () => { throw new Error("Web Push is disabled"); },
  });
  const lifecycle = new WebPushLifecycle({
    config: WEB_PUSH_CONFIG,
    browser: new WebPushBrowserGateway(),
    api: WEB_PUSH_CONFIG.enabled ? new WebPushApiClient({ baseUrl: WEB_PUSH_CONFIG.apiBaseUrl }) : disabledApi,
    storage: new WebPushStorage(),
    view,
  });

  void lifecycle.initialize().catch(() => {});
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void lifecycle.initialize().catch(() => {});
  });
}
