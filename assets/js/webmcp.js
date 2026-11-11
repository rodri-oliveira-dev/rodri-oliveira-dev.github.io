import { createPortfolioTools } from "./webmcp-tools.mjs";
import { SUPPORTED_LANGUAGES } from "./webmcp-i18n.mjs";

/**
 * Service-specific tools are exposed only on the three canonical service pages.
 * They are lazy-loaded to avoid adding weight to the rest of the portfolio.
 * The optional index.html suffix also supports local preview URLs.
 */
const SERVICE_PAGE_PATHS = Object.freeze({
  "pt-BR": "/servicos/",
  en: "/en/services/",
  "es-419": "/es/servicios/",
});

export function isServicesPage(doc = globalThis.document, view = globalThis.window) {
  const canonicalPath = SERVICE_PAGE_PATHS[doc?.documentElement?.lang];
  const pathname = doc?.location?.pathname ?? view?.location?.pathname;
  return Boolean(canonicalPath) && (
    pathname === canonicalPath ||
    pathname === canonicalPath + "index.html" ||
    pathname === canonicalPath.slice(0, -1)
  );
}

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
    if (disposed) {
      return Promise.reject(new Error("WebMCP registry is no longer active."));
    }
    // Keep late-loaded definitions for restoration if a pagehide happened
    // while the services module was still being imported.
    definitions.set(tool.name, tool);
    if (controller.signal.aborted) {
      return Promise.reject(new Error("WebMCP registry is no longer active."));
    }
    return modelContext.registerTool(tool, { signal: controller.signal });
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

  return Object.freeze({ language, servicesPage: isServicesPage(doc, view), registerTool, dispose });
}

/**
 * General tools remain available everywhere. Only the localized services
 * pages register the additional four read-only tools. An unavailable services
 * module cannot prevent registration of the general portfolio tools.
 */
async function registerPageTools(registry) {
  const registrations = createPortfolioTools(registry.language).map((tool) =>
    Promise.resolve().then(() => registry.registerTool(tool))
  );

  if (registry.servicesPage) {
    try {
      const { createServiceTools } = await import("./webmcp-services.mjs");
      registrations.push(...createServiceTools(registry.language).map((tool) =>
        Promise.resolve().then(() => registry.registerTool(tool))
      ));
    } catch (error) {
      // Report the failure while allowing the six existing tools to work.
      registrations.push(Promise.reject(error));
    }
  }

  return Promise.allSettled(registrations);
}

// Register only on supported browsers. A failed tool must not affect the page.
export const webMCPRegistry = createWebMCPRegistry();
export const webMCPRegistrations = webMCPRegistry
  ? registerPageTools(webMCPRegistry)
  : Promise.resolve([]);
