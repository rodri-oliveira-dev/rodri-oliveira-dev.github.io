# Portfolio WebMCP integration (English)

**English** | [Português (Brasil)](webmcp.pt-BR.md) | [Español (América Latina)](webmcp.es-419.md)

## Purpose and scope

The site exposes six general **read-only** tools plus four additional service-specific tools through the experimental [WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api). Tools are registered inside a compatible browser tab using `document.modelContext.registerTool`. This is not a REST endpoint or a remote MCP server; the visual site remains unchanged.

- Supported languages: `pt-BR`, `en`, and `es-419`. Tool descriptions follow the page locale, while individual calls may request any of the three response languages.
- Pages: Portuguese, English and Spanish homepages, five case studies per language, the Portuguese resume, and `/servicos/`, `/en/services/`, `/es/servicios/`.
- Data: published professional information, five featured projects and four consulting services; no external requests, credentials, analytics, or state changes.
- Compatibility: if the WebMCP API is missing, or the page lacks a secure context, no tools are registered and the regular site still works.
- Resume: the published HTML and PDF are **Portuguese only**. An English or Spanish tool response is not a translated resume.

**WebMCP is experimental.** It does not replace SEO, structured data, canonical links, sitemap, or standard HTML navigation, and it does not ensure an AI agent will discover or recommend the site. Availability varies by browser, version, experimental flags and permissions. **No origin-trial token is configured in this repository.**

## Architecture

| File | Purpose |
| --- | --- |
| [`assets/js/webmcp.js`](../assets/js/webmcp.js) | Optional feature detection, registration, `pagehide` cleanup and automatic bfcache restoration |
| [`assets/js/webmcp-tools.mjs`](../assets/js/webmcp-tools.mjs) | Tool definitions, JSON Schema input contracts, validation and read-only operations |
| [`assets/js/webmcp-data.mjs`](../assets/js/webmcp-data.mjs) | Public projects, profile and skills in Portuguese, English and Spanish |
| [`assets/js/webmcp-i18n.mjs`](../assets/js/webmcp-i18n.mjs) | Tool descriptions, parameter help, localized errors and language negotiation |
| [`assets/js/webmcp-services.mjs`](../assets/js/webmcp-services.mjs) | Four read-only services tools, strict schemas and localized errors |
| [`assets/js/webmcp-services-data.mjs`](../assets/js/webmcp-services-data.mjs) | Public service catalog and engagement approach in three locales |
| [`docs/contracts/webmcp-services.v1.json`](contracts/webmcp-services.v1.json) | Versioned JSON Schema contract v1.0.0 |
| [`docs/webmcp-services-contract.md`](webmcp-services-contract.md) | Full contract semantics, maintenance and versioning |
| [`.github/scripts/test-webmcp-services.mjs`](../.github/scripts/test-webmcp-services.mjs) | Contract, HTML parity, locale and simulated-browser lifecycle tests |
| [`.github/scripts/test-webmcp.mjs`](../.github/scripts/test-webmcp.mjs) | Contract, localization, lifecycle and HTML content-parity tests |
| [`.github/workflows/site-validation.yml`](../.github/workflows/site-validation.yml) | Runs tests in PR and `main` CI |
| [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) | Checks WebMCP modules are included in the GitHub Pages artifact |

Each covered HTML page loads only `/assets/js/webmcp.js`. On the three services routes, the entry point lazy-loads `webmcp-services.mjs` and registers up to ten tools; other pages retain only the six general tools. The integration uses native ES Modules and requires no bundler or npm package. The published CSP remains restrictive (`script-src 'self'`; `connect-src 'none'`).

## Public tools

| Tool | Arguments | Output |
| --- | --- | --- |
| `getProfile` | `language?` | Name, role, summary, minimum years of experience, portfolio URL |
| `getSkills` | `language?` | Published technical skills |
| `searchProjects` | `query?`, `technology?`, `limit?`, `language?` | Total matches and project summaries with technologies and links |
| `getProjectDetails` | `projectId`, `language?` | One featured project's public details |
| `getResume` | `language?` | HTML/PDF links and the actual available language, `pt-BR` |
| `getContactInfo` | `language?` | Public email, LinkedIn, GitHub and website URLs |

### Additional tools on the services pages only

| Tool | Arguments | Output |
| --- | --- | --- |
| `getServices` | `language?` | Four professional services and engagement scope note |
| `getServiceDetails` | `serviceId`, `language?` | One service and possible outputs subject to the agreed scope |
| `getEngagementProcess` | `language?` | Introduction and three published work stages |
| `getConsultingContact` | `language?` | Public email, LinkedIn and initial outreach guidance |

These read-only tools cannot send messages, process client data or create agreements. Service IDs are `architecture-review`, `dotnet-modernization`, `apis-distributed-systems` and `technical-decision-support`. An unknown service returns `SERVICE_NOT_FOUND` and `availableIds`. For full JSON schemas and examples, see the [v1 services contract](webmcp-services-contract.md).

Tool names and JSON property names are stable in English. Descriptions and human-facing messages are localized.

### Locale and error contract

- Omitting `language` uses the current HTML page's `lang` value: `pt-BR` on `/`, `en` on `/en/` and `es-419` on `/es/`.
- Passing `language: "pt-BR"`, `language: "en"`, or `language: "es-419"` overrides the page locale for that call.
- Passing an unsupported language explicitly returns `UNSUPPORTED_LANGUAGE` rather than silently falling back.
- Invalid types, unexpected arguments and out-of-range inputs return `INVALID_INPUT`.
- An unknown project ID returns `PROJECT_NOT_FOUND` and a list of `availableIds`.
- Project search is case-insensitive, accent-insensitive and searches descriptions and technology tags in all three languages.
- `limit` is 1–5 (default 5); `query` is limited to 120 characters, and `technology` to 80.
- Handlers produce serializable JSON objects. Browser `executeTool()` may expose the serialized result as a string.

Sample tool request:

```json
{
  "tool": "searchProjects",
  "arguments": {
    "technology": ".NET",
    "language": "en",
    "limit": 3
  }
}
```

## Automated verification

From the repository root:

```bash
node --test .github/scripts/test-webmcp.mjs
node --test .github/scripts/test-webmcp-services.mjs
node .github/scripts/test-site-i18n.cjs
```

The first suite verifies the six general tools. The services suite checks four versioned tool contracts, all three locales, output schemas and errors, route-specific registration, browser lifecycle/bfcache simulation, and HTML/content parity across the three service pages. Both are dependency-free and run in the `Site validation` workflow with Node.js 24.

The GitHub Pages build verifies the general and services WebMCP modules are present in the `_site` static artifact. **Mocked tests do not prove real-browser compatibility.** Use the manual smoke test below in addition to CI.

## Additional manual smoke test for services pages

On a compatible Chrome version with experimental WebMCP enabled, visit `http://localhost:8000/servicos/`, `http://localhost:8000/en/services/` and `http://localhost:8000/es/servicios/` after starting the local server described below.

After each page loads, open DevTools:

```javascript
const context = document.modelContext;
const registered = await context.getTools();
console.log(registered.map((tool) => tool.name).sort());
const details = registered.find((tool) => tool.name === "getServiceDetails");
const result = await context.executeTool(details, {
  serviceId: "architecture-review",
  language: "en"
});
console.log(result);
```

Each services page should expose **ten tools** (six general plus four services tools). The details call should describe the architecture review in English. On `/`, `/en/` and `/es/`, expect **six general tools** only. Also exercise `getServices`, `getEngagementProcess`, `getConsultingContact` and a nonexistent service ID (`SERVICE_NOT_FOUND`). Verify that leaving a services page unregisters its tools and a bfcache restore re-registers them without duplicates.

**This is a manual native-browser acceptance test, not evidence supplied by the mock-based CI suite.** Browser flags, APIs and inspectors are experimental and version-dependent; consult the current official Chrome guidance.

## Manual smoke test in a compatible browser

1. Use a Chrome version supporting experimental WebMCP, visit `chrome://flags/#enable-webmcp-testing`, enable the flag and relaunch. Browser availability and requirements can change; see [Chrome Developers: WebMCP](https://developer.chrome.com/docs/ai/webmcp).
2. Check out the PR branch. From the repository root, run `python3 -m http.server 8000` and visit `http://localhost:8000/`. Localhost is treated as a secure context. For English, visit `http://localhost:8000/en/`. Do not open the HTML directly with `file://`.
3. Open DevTools Console and evaluate `"modelContext" in document`. If `false`, the browser has not enabled WebMCP; that is not a site failure.
4. On a PT/EN/ES page, list the tools:

```javascript
const ctx = document.modelContext;
const available = await ctx.getTools();
available.map((tool) => tool.name);
```

Expected names: `getProfile`, `getSkills`, `searchProjects`, `getProjectDetails`, `getResume`, `getContactInfo`.

5. Call a tool and override the response language:

```javascript
const search = available.find((tool) => tool.name === "searchProjects");
const output = await ctx.executeTool(search, {
  technology: ".NET",
  language: "en",
  limit: 3
});
console.log(output);
```

6. Repeat on `/en/` with `language: "pt-BR"` and on `/es/` with `language: "es-419"`. Verify the localized errors `UNSUPPORTED_LANGUAGE`, `INVALID_INPUT` and `PROJECT_NOT_FOUND` as well.
7. Verify that all six tools are registered on PT/EN/ES pages. Navigate away to check that the former page's tools are released (`pagehide` aborts its signal), then navigate **Back**: when restored from bfcache (`pageshow.persisted`), all six tools are registered again with a new signal.

If `getTools()` or `executeTool()` is not available in your browser's DevTools, use the [Model Context Tool Inspector](https://developer.chrome.com/docs/ai/webmcp) or the browser's equivalent inspector instead. Do not publish keys or change production settings just to run the smoke test. Enabling a local flag does not make WebMCP universally available to external agents.

## Maintenance

When changing a featured project in `index.html`, `en/index.html` or `es/index.html`, update `assets/js/webmcp-data.mjs` in the same PR. CI blocks drift in title, description, tags, repository URL or case-study link. Keep profile/skills consistent with the public JSON-LD. When the services HTML changes, update `assets/js/webmcp-services-data.mjs` in the same PR and run `node --test .github/scripts/test-webmcp-services.mjs`. Keep the versioned contract consistent and update sitemap `lastmod` for changes to site content. New tools must remain read-only, with PT-BR/EN/ES-419 descriptions, strict JSON Schemas and result/error tests.

References: [WebMCP overview](https://developer.chrome.com/docs/ai/webmcp), [Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [community draft specification](https://webmachinelearning.github.io/webmcp/).
