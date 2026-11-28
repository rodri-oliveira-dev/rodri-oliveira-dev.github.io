import { WEB_PUSH_CONFIG } from "./web-push-config.mjs";
import { WebPushLifecycle } from "./web-push-lifecycle.mjs";
import { WebPushApiClient, WebPushBrowserGateway, WebPushStorage } from "./web-push-platform.mjs";
import { WebPushView } from "./web-push-view.mjs";

const root = document.querySelector("[data-web-push]");
if (root) {
  const disabledApi = Object.freeze({
    register: async () => { throw new Error("Web Push is disabled"); },
    revoke: async () => { throw new Error("Web Push is disabled"); },
  });
  let lifecycle;
  const bootstrap = async () => {
    if (!lifecycle) {
      let config = WEB_PUSH_CONFIG;
      let api = disabledApi;
      try {
        api = new WebPushApiClient({ baseUrl: WEB_PUSH_CONFIG.apiBaseUrl });
        const remote = await api.getPublicConfiguration();
        config = Object.freeze({ ...WEB_PUSH_CONFIG, ...remote });
      } catch {
        api = disabledApi;
      }
      const view = new WebPushView(root, { config });
      lifecycle = new WebPushLifecycle({
        config,
        browser: new WebPushBrowserGateway(),
        api: config.enabled ? api : disabledApi,
        storage: new WebPushStorage(),
        view,
      });
    }
    await lifecycle.initialize();
  };

  void bootstrap().catch(() => {});
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void bootstrap().catch(() => {});
  });
}
