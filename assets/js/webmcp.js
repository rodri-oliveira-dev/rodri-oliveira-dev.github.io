/**
 * Optional WebMCP bootstrap for the Portuguese and English pages.
 * No tools are exposed until the next implementation stage.
 */
const SUPPORTED_LANGUAGES = Object.freeze(["pt-BR", "en"]);

/**
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

// Stage 1 only initializes the integration boundary; stage 2 adds tools.
export const webMCPRegistry = createWebMCPRegistry();
