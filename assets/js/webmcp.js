import { createPortfolioTools } from "./webmcp-tools.mjs";
import { SUPPORTED_LANGUAGES } from "./webmcp-i18n.mjs";

/**
 * Optional WebMCP bootstrap for the Portuguese, English and Spanish pages.
 * Read-only tools are registered only when the experimental API is available.
 * Creates a browser-local tool registry when WebMCP is available.
 * Unsupported browsers and other locales keep their existing behavior.
 */
export function createWebMCPRegistry(doc = globalThis.document, view = globalThis.window) {
  const language = doc?.documentElement?.lang;
  const modelContext = doc?.modelContext;

  if (
    !SUPPORTED_LANGUAGES.includes(language) ||
    view?.isSecureContext !== true ||
    typeof modelContext?.registerTool !== "function"
  ) {
    return null;
  }

  const controller = new AbortController();
  const dispose = () => controller.abort();
  view.addEventListener("pagehide", dispose, { once: true });

  return Object.freeze({
    language,
    registerTool(tool) {
      if (controller.signal.aborted) {
        return Promise.reject(new Error("WebMCP registry is no longer active."));
      }
      return modelContext.registerTool(tool, { signal: controller.signal });
    },
    dispose,
  });
}

// Register only on supported browsers. A failed tool must not affect the page.
export const webMCPRegistry = createWebMCPRegistry();
export const webMCPRegistrations = webMCPRegistry
  ? Promise.allSettled(
      createPortfolioTools(webMCPRegistry.language).map((tool) =>
        Promise.resolve().then(() => webMCPRegistry.registerTool(tool))
      )
    )
  : Promise.resolve([]);

