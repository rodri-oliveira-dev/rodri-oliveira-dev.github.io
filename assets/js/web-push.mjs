import { WEB_PUSH_CONFIG } from "./web-push-config.mjs";
import { WebPushLifecycle } from "./web-push-lifecycle.mjs";
import { WebPushApiClient, WebPushBrowserGateway, WebPushStorage } from "./web-push-platform.mjs";
import { WebPushView } from "./web-push-view.mjs";

export const createWebPushBootstrap = ({
  root,
  baseConfig = WEB_PUSH_CONFIG,
  createApi = (baseUrl) => new WebPushApiClient({ baseUrl }),
  createBrowser = () => new WebPushBrowserGateway(),
  createStorage = () => new WebPushStorage(),
  createView = (config) => new WebPushView(root, { config }),
  createLifecycle = (dependencies) => new WebPushLifecycle(dependencies),
}) => {
  const disabledApi = Object.freeze({
    register: async () => { throw new Error("Web Push is disabled"); },
    revoke: async () => { throw new Error("Web Push is disabled"); },
  });
  let lifecycle;

  return async () => {
    if (!lifecycle) {
      let config = baseConfig;
      let api = disabledApi;
      try {
        api = createApi(baseConfig.apiBaseUrl);
        const remote = await api.getPublicConfiguration();
        config = Object.freeze({ ...baseConfig, ...remote });
      } catch {
        api = disabledApi;
      }
      lifecycle = createLifecycle({
        config,
        browser: createBrowser(),
        api: config.enabled ? api : disabledApi,
        storage: createStorage(),
        view: createView(config),
      });
    }
    await lifecycle.initialize();
  };
};

const root = globalThis.document?.querySelector("[data-web-push]");
if (root) {
  const bootstrap = createWebPushBootstrap({ root });
  void bootstrap().catch(() => {});
  globalThis.window?.addEventListener("pageshow", (event) => {
    if (event.persisted) void bootstrap().catch(() => {});
  });
}
