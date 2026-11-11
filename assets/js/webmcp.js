import { createPortfolioTools } from "./webmcp-tools.mjs";
import { SUPPORTED_LANGUAGES } from "./webmcp-i18n.mjs";

/**
 * Create an optional browser-local WebMCP registry for a supported page.
 * A pagehide aborts its registered tools; restoring the document from the
 * back/forward cache re-registers the same tools with a fresh AbortSignal.
 * An explicit dispose is permanent and removes the event listeners.
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

  const definitions = new Map();
  let controller = new AbortController();
  let disposed = false;

  /** Register a tool using the current page-lifecycle signal. */
  const registerTool = (tool) => {
    if (disposed || controller.signal.aborted) {
      return Promise.reject(new Error("WebMCP registry is no longer active."));
    }
    const result = modelContext.registerTool(tool, { signal: controller.signal });
    definitions.set(tool.name, tool);
    return result;
  };

  /** Unregister tools when leaving the page, including on bfcache entry. */
  const onPageHide = () => controller.abort();

  /**
   * Restoring a cached document does not re-execute its module script.
   * Re-register exactly once per bfcache restore; ignore ordinary pageshow.
   */
  const onPageShow = (event) => {
    if (event?.persisted !== true || disposed || !controller.signal.aborted) {
      return;
    }

    controller = new AbortController();
    for (const tool of definitions.values()) {
      try {
        // One rejected registration must not break the remaining tools.
        Promise.resolve(registerTool(tool)).catch(() => {});
      } catch {
        // Experimental browsers may reject registration synchronously.
      }
    }
  };

  /** Permanently stop this registry and release all lifecycle listeners. */
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    definitions.clear();
    if (typeof view.removeEventListener === "function") {
      view.removeEventListener("pagehide", onPageHide);
      view.removeEventListener("pageshow", onPageShow);
    }
  };

  view.addEventListener("pagehide", onPageHide);
  view.addEventListener("pageshow", onPageShow);

  return Object.freeze({ language, registerTool, dispose });
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
