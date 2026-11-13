import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createPortfolioTools } from "../../assets/js/webmcp-tools.mjs";
import { createServiceTools } from "../../assets/js/webmcp-services.mjs";
import {
  SERVICES_CATALOG,
  SERVICES_CONTACT_EMAIL,
  SERVICES_CONTRACT_VERSION,
  SERVICES_LINKEDIN_URL,
  SERVICES_PAGE_URLS,
  SERVICES_PROCESS_STEP_IDS,
  SERVICES_SERVICE_IDS,
  SERVICES_SUPPORTED_LANGUAGES,
} from "../../assets/js/webmcp-services-data.mjs";
import { createWebMCPRegistry, isServicesPage } from "../../assets/js/webmcp.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");
const contract = JSON.parse(read("docs/contracts/webmcp-services.v1.json"));
const TOOL_NAMES = [
  "getServices", "getServiceDetails", "getEngagementProcess", "getConsultingContact",
];
const GENERAL_NAMES = [
  "getProfile", "getSkills", "searchProjects", "getProjectDetails", "getResume", "getContactInfo",
];
const PAGES = Object.freeze({
  "pt-BR": "servicos/index.html",
  en: "en/services/index.html",
  "es-419": "es/servicios/index.html",
});

function tools(language) {
  return Object.fromEntries(createServiceTools(language).map((tool) => [tool.name, tool]));
}

function call(pageLanguage, name, input = {}) {
  return tools(pageLanguage)[name].execute(input);
}

function errorFor(output, code, language, schema) {
  assert.equal(output.error?.code, code);
  assert.equal(output.language, language);
  assert.ok(output.error.message.length > 5);
  assert.ok(conforms(output, schema), JSON.stringify(output));
  assert.doesNotThrow(() => JSON.stringify(output));
}

/* Validate the JSON Schema subset actually used by the versioned contract.
 * No extra npm dependencies or permissive checks that ignore nested fields. */
function conforms(value, schema) {
  if (schema.oneOf) return schema.oneOf.filter((variant) => conforms(value, variant)).length === 1;
  if (Object.hasOwn(schema, "const") && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const properties = schema.properties ?? {};
    if ((schema.required ?? []).some((field) => !Object.hasOwn(value, field))) return false;
    if (schema.additionalProperties === false &&
      Reflect.ownKeys(value).some((field) => !Object.hasOwn(properties, field))) return false;
    return Object.keys(value).every((field) =>
      !Object.hasOwn(properties, field) || conforms(value[field], properties[field]));
  }
  if (schema.type === "array") {
    return Array.isArray(value) &&
      (schema.minItems === undefined || value.length >= schema.minItems) &&
      (schema.maxItems === undefined || value.length <= schema.maxItems) &&
      value.every((item) => conforms(item, schema.items));
  }
  if (schema.type === "string") {
    if (typeof value !== "string") return false;
    if (schema.minLength !== undefined && value.length < schema.minLength) return false;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.format === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return false;
    if (schema.format === "uri") {
      try { new URL(value); } catch { return false; }
    }
    return true;
  }
  if (schema.type === "integer") return Number.isInteger(value);
  if (schema.type === "boolean") return typeof value === "boolean";
  return true;
}

function cleanHtml(fragment) {
  return fragment.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function capture(text, regex, hint) {
  const match = text.match(regex);
  assert.ok(match, "Missing " + hint);
  return match[1];
}

function section(html, id) {
  return capture(html,
    new RegExp('<section\\b[^>]*\\bid="' + id + '"[^>]*>([\\s\\S]*?)<\\/section>'),
    "section #" + id);
}

function sectionIntroduction(html) {
  return cleanHtml(capture(html,
    /<div class="section-heading">[\s\S]*?<\/h2>\s*<p>([\s\S]*?)<\/p>/,
    "section introduction"));
}

function cards(sectionHtml, className) {
  const regex = new RegExp('<article class="' + className + '">([\\s\\S]*?)<\\/article>', "g");
  return [...sectionHtml.matchAll(regex)].map(([_, block]) => ({
    title: cleanHtml(capture(block, /<h3>([\s\S]*?)<\/h3>/, "card heading")),
    description: cleanHtml(capture(block, /<p>([\s\S]*?)<\/p>/, "card description")),
  }));
}

test("versioned contract, catalogs and tool definitions are consistent", () => {
  assert.equal(contract.contractId, "portfolio-services-webmcp");
  assert.equal(contract.contractVersion, SERVICES_CONTRACT_VERSION);
  assert.equal(contract.status, "implemented-tested");
  assert.deepEqual(contract.supportedLanguages, [...SERVICES_SUPPORTED_LANGUAGES]);
  assert.deepEqual(contract.pageUrls, SERVICES_PAGE_URLS);
  assert.deepEqual(contract.serviceIds, [...SERVICES_SERVICE_IDS]);
  assert.deepEqual(contract.processStepIds, [...SERVICES_PROCESS_STEP_IDS]);
  assert.deepEqual(contract.tools.map((tool) => tool.name), TOOL_NAMES);
  assert.equal(new Set(TOOL_NAMES).size, 4);
  assert.deepEqual(
    contract.tools.flatMap((tool) => [tool.name]).filter((name) => GENERAL_NAMES.includes(name)),
    [],
  );
  for (const language of SERVICES_SUPPORTED_LANGUAGES) {
    const definitions = createServiceTools(language);
    assert.deepEqual(definitions.map((tool) => tool.name), TOOL_NAMES);
    for (const [index, implementation] of definitions.entries()) {
      const specification = contract.tools[index];
      assert.equal(implementation.title, specification.titles[language]);
      assert.equal(implementation.description, specification.descriptions[language]);
      assert.deepEqual(implementation.inputSchema, specification.inputSchema);
      assert.deepEqual(implementation.outputSchema, specification.outputSchema);
      assert.deepEqual(implementation.annotations, specification.annotations);
      assert.equal(implementation.annotations.readOnlyHint, true);
      assert.equal(implementation.annotations.idempotentHint, true);
      assert.equal(implementation.annotations.openWorldHint, false);
      assert.equal(implementation.inputSchema.additionalProperties, false);
      assert.equal(implementation.outputSchema.oneOf.length, 2);
      assert.equal(typeof implementation.execute, "function");
    }
  }
});

test("all successful outputs conform to JSON Schema in PT-BR, EN and ES-419", () => {
  for (const page of SERVICES_SUPPORTED_LANGUAGES) {
    for (const target of SERVICES_SUPPORTED_LANGUAGES) {
      const input = page === target ? {} : { language: target };
      for (const name of TOOL_NAMES) {
        const specification = contract.tools.find((tool) => tool.name === name);
        const toolInput = name === "getServiceDetails"
          ? { ...input, serviceId: SERVICES_SERVICE_IDS[0] } : input;
        assert.ok(conforms(toolInput, specification.inputSchema), "input schema " + name);
        const output = call(page, name, toolInput);
        assert.ok(conforms(output, specification.outputSchema), page + "/" + target + "/" + name);
        assert.equal(output.contractVersion, contract.contractVersion);
        assert.equal(output.language, target);
        assert.equal(output.sourceUrl, SERVICES_PAGE_URLS[target]);
      }
      const listing = call(page, "getServices", input);
      assert.deepEqual(listing.services.map((service) => service.id), [...SERVICES_SERVICE_IDS]);
      assert.equal(listing.engagementNote, SERVICES_CATALOG[target].engagementNote);
      const process = call(page, "getEngagementProcess", input);
      assert.deepEqual(process.steps.map((step) => step.id), [...SERVICES_PROCESS_STEP_IDS]);
      const contact = call(page, "getConsultingContact", input);
      assert.equal(contact.email, SERVICES_CONTACT_EMAIL);
      assert.equal(contact.linkedInUrl, SERVICES_LINKEDIN_URL);
      assert.equal(contact.emailUrl, SERVICES_CATALOG[target].contact.emailUrl);
      for (const serviceId of SERVICES_SERVICE_IDS) {
        const spec = contract.tools.find((tool) => tool.name === "getServiceDetails");
        const result = call(page, "getServiceDetails", { ...input, serviceId });
        assert.ok(conforms(result, spec.outputSchema), page + "/" + serviceId);
        assert.equal(result.service.id, serviceId);
        assert.deepEqual(result.service.potentialOutputs, SERVICES_CATALOG[target].potentialOutputs);
        assert.equal(result.service.scopeNote, SERVICES_CATALOG[target].scopeNote);
      }
    }
  }
});

test("errors, unknown services and unsupported languages are localized and schema-valid", () => {
  for (const page of SERVICES_SUPPORTED_LANGUAGES) {
    for (const name of TOOL_NAMES) {
      const spec = contract.tools.find((tool) => tool.name === name);
      const base = name === "getServiceDetails" ? { serviceId: SERVICES_SERVICE_IDS[0] } : {};
      const invalid = [null, [], "hello", 1, { ...base, unexpected: "value" }];
      for (const input of invalid) {
        errorFor(call(page, name, input), "INVALID_INPUT", page, spec.outputSchema);
      }
      errorFor(call(page, name, { ...base, language: "fr" }),
        "UNSUPPORTED_LANGUAGE", page, spec.outputSchema);
      errorFor(call(page, name, { ...base, language: null }),
        "UNSUPPORTED_LANGUAGE", page, spec.outputSchema);
      const foreign = call(page, name, { ...base, language: "en", unexpected: true });
      errorFor(foreign, "INVALID_INPUT", "en", spec.outputSchema);
      assert.equal(Object.keys(base).length ? 1 : 0,
        spec.inputSchema.required.length, name + " mandatory parameters");
    }
    const details = contract.tools.find((tool) => tool.name === "getServiceDetails");
    for (const serviceId of ["", "INVALID", "a/b", "x".repeat(81), 42, null, []]) {
      errorFor(call(page, "getServiceDetails", { serviceId }),
        "INVALID_INPUT", page, details.outputSchema);
    }
    const missing = call(page, "getServiceDetails", { serviceId: "unknown-service" });
    errorFor(missing, "SERVICE_NOT_FOUND", page, details.outputSchema);
    assert.deepEqual(missing.availableIds, [...SERVICES_SERVICE_IDS]);
    assert.equal(call(page, "getServiceDetails", {}).error.code, "INVALID_INPUT");
  }
});

test("returns are detached from the immutable source catalog", () => {
  const list = call("pt-BR", "getServices");
  list.services[0].title = "Injected";
  list.services.push({ id: "wrong", title: "wrong", description: "wrong" });
  const details = call("pt-BR", "getServiceDetails",
    { serviceId: SERVICES_SERVICE_IDS[0] });
  details.service.potentialOutputs[0] = "Injected";
  const process = call("pt-BR", "getEngagementProcess");
  process.steps[0].title = "Injected";
  assert.equal(call("pt-BR", "getServices").services.length, 4);
  assert.equal(call("pt-BR", "getServices").services[0].title,
    SERVICES_CATALOG["pt-BR"].services[0].title);
  assert.equal(call("pt-BR", "getServiceDetails",
    { serviceId: SERVICES_SERVICE_IDS[0] }).service.potentialOutputs[0],
  SERVICES_CATALOG["pt-BR"].potentialOutputs[0]);
  assert.equal(call("pt-BR", "getEngagementProcess").steps[0].title,
    SERVICES_CATALOG["pt-BR"].process.steps[0].title);
  assert.ok(Object.isFrozen(SERVICES_CATALOG["pt-BR"].services[0]));
});

test("all service descriptions, process steps and contact data match published HTML", () => {
  for (const language of SERVICES_SUPPORTED_LANGUAGES) {
    const relative = PAGES[language];
    const html = read(relative);
    const data = SERVICES_CATALOG[language];
    assert.ok(html.includes('<html lang="' + language + '">'), relative);
    assert.equal(capture(html, /<link rel="canonical" href="([^"]+)">/, "canonical"),
      SERVICES_PAGE_URLS[language]);

    const areas = section(html, "atuacao");
    const services = cards(areas, "services-card");
    assert.deepEqual(services,
      data.services.map(({ title, description }) => ({ title, description })), relative + " services");
    assert.equal(sectionIntroduction(areas), data.engagementNote, relative + " engagement");
    assert.ok(data.engagementNote.includes(data.scopeNote));
    assert.ok(data.potentialOutputs.every((output) => data.engagementNote.includes(output)));

    const approach = section(html, "abordagem");
    assert.equal(sectionIntroduction(approach), data.process.introduction, relative + " intro");
    assert.deepEqual(cards(approach, "services-process__item"),
      data.process.steps.map(({ title, description }) => ({ title, description })),
      relative + " process");

    const contact = section(html, "contato");
    assert.equal(cleanHtml(capture(contact, /<h2[^>]*>[\s\S]*?<\/h2>\s*<p>([\s\S]*?)<\/p>/,
      "contact guidance")), data.contact.guidance);
    assert.ok(contact.includes('href="' + data.contact.emailUrl + '"'), relative + " mailto");
    assert.ok(contact.includes('href="' + SERVICES_LINKEDIN_URL + '"'), relative + " LinkedIn");
    assert.equal(data.contact.emailUrl.split("?")[0], "mailto:" + SERVICES_CONTACT_EMAIL);
    assert.ok(html.includes('<script type="module" src="/assets/js/webmcp.js"></script>'));
    assert.ok(html.includes("connect-src 'none'"));
    assert.ok(html.includes("script-src 'self'"));
  }
});

test("only the exact three service routes enable additional tool registration", () => {
  for (const [language, relative] of Object.entries(PAGES)) {
    const canonical = new URL(SERVICES_PAGE_URLS[language]).pathname;
    const doc = { documentElement: { lang: language }, location: { pathname: canonical } };
    assert.equal(isServicesPage(doc), true, relative);
    assert.equal(isServicesPage({ ...doc, location: { pathname: canonical + "index.html" } }),
      true, relative + " local index");
    assert.equal(isServicesPage({ ...doc, location: { pathname: canonical.slice(0, -1) } }),
      true, relative + " no trailing slash");
    assert.equal(isServicesPage({ ...doc, location: { pathname: "/" } }),
      false, relative + " homepage");
    assert.equal(isServicesPage({ ...doc, location: { pathname: canonical + "other/" } }),
      false, relative + " nested route");
    for (const otherLanguage of SERVICES_SUPPORTED_LANGUAGES.filter((code) => code !== language)) {
      assert.equal(isServicesPage({ ...doc, documentElement: { lang: otherLanguage } }),
        false, relative + " mismatched language");
    }
  }
  assert.equal(isServicesPage(), false);
});

test("browser registration, absence of support, lifecycle and restoration are isolated", () => {
  const scenarios = [
    ...SERVICES_SUPPORTED_LANGUAGES.map((language) => ({
      language, pathname: new URL(SERVICES_PAGE_URLS[language]).pathname, secure: true,
      supported: true, expected: [...GENERAL_NAMES, ...TOOL_NAMES],
    })),
    { language: "en", pathname: "/en/", secure: true, supported: true, expected: GENERAL_NAMES },
    ...[
      ["pt-BR", "/curriculo/"],
      ["en", "/en/resume/"],
      ["es-419", "/es/curriculo/"],
    ].map(([language, pathname]) => ({
      language, pathname, secure: true, supported: true, expected: GENERAL_NAMES,
    })),
    { language: "es-419", pathname: "/es/case-studies/adr-guard/", secure: true,
      supported: true, expected: GENERAL_NAMES },
    { language: "en", pathname: "/en/services/", secure: false, supported: true, expected: [] },
    { language: "pt-BR", pathname: "/servicos/", secure: true, supported: false, expected: [] },
    { language: "en", pathname: "/servicos/", secure: true, supported: true,
      expected: GENERAL_NAMES },
  ];
  for (const scenario of scenarios) {
    // A new child process prevents the ESM cache from hiding import-time bugs.
    const runner = [
      'const arg = JSON.parse(process.argv[1]);',
      'const registrations = []; const handlers = new Map();',
      'globalThis.document = { documentElement: { lang: arg.language },',
      ' location: { pathname: arg.pathname },',
      ' modelContext: arg.supported ? { registerTool(tool, opts) {',
      ' registrations.push({ name: tool.name, signal: opts.signal }); return Promise.resolve();',
      ' } } : undefined };',
      'globalThis.window = { isSecureContext: arg.secure,',
      ' location: { pathname: arg.pathname },',
      ' addEventListener(name, fn) { handlers.set(name, fn); },',
      ' removeEventListener(name) { handlers.delete(name); } };',
      'const entry = await import("./assets/js/webmcp.js");',
      'const outcomes = await entry.webMCPRegistrations;',
      'const first = registrations.map((item) => item.name);',
      'const statuses = outcomes.map((item) => item.status);',
      'const signal = registrations[0]?.signal;',
      'handlers.get("pagehide")?.();',
      'const aborted = signal?.aborted ?? null;',
      'handlers.get("pageshow")?.({ persisted: false });',
      'const countBeforeCacheRestore = registrations.length;',
      'handlers.get("pageshow")?.({ persisted: true });',
      'await Promise.resolve();',
      'const restored = registrations.slice(first.length).map((item) => item.name);',
      'const freshSignal = registrations[first.length]?.signal !== signal &&',
      ' !registrations[first.length]?.signal?.aborted;',
      'handlers.get("pageshow")?.({ persisted: true });',
      'const noDoubleRestore = registrations.length === first.length * 2;',
      'entry.webMCPRegistry?.dispose();',
      'process.stdout.write(JSON.stringify({ first, statuses, aborted, restored,',
      ' freshSignal: !!freshSignal, noDoubleRestore, countBeforeCacheRestore,',
      ' servicesPage: entry.webMCPRegistry?.servicesPage ?? null }));',
    ].join("\n");
    const output = JSON.parse(execFileSync(process.execPath,
      ["--input-type=module", "--eval", runner, JSON.stringify(scenario)],
      { cwd: ROOT, encoding: "utf8" }));
    assert.deepEqual(output.first, scenario.expected, JSON.stringify(scenario));
    assert.deepEqual(output.statuses, scenario.expected.map(() => "fulfilled"),
      JSON.stringify(scenario) + " statuses");
    assert.equal(output.servicesPage, scenario.expected.length === 10 ? true :
      scenario.secure && scenario.supported ? false : null);
    if (scenario.expected.length) {
      assert.equal(output.aborted, true);
      assert.equal(output.countBeforeCacheRestore, scenario.expected.length);
      assert.deepEqual(output.restored, scenario.expected);
      assert.equal(output.freshSignal, true);
      assert.equal(output.noDoubleRestore, true);
    }
  }
});

test("trilingual guides document all service tools, schemas and browser smoke tests", () => {
  for (const file of [
    "docs/webmcp.pt-BR.md", "docs/webmcp.en.md", "docs/webmcp.es-419.md",
  ]) {
    const guide = read(file);
    for (const name of TOOL_NAMES) {
      assert.ok(guide.includes(name), file + " missing tool " + name);
    }
    assert.ok(guide.includes("webmcp-services-contract.md"), file + " contract link");
    assert.ok(guide.includes("webmcp-services.v1.json"), file + " schema link");
    assert.ok(guide.includes("node --test .github/scripts/test-webmcp-services.mjs"),
      file + " test command");
    assert.ok(guide.includes("architecture-review"), file + " service ID");
    assert.ok(guide.includes("document.modelContext"), file + " browser API");
    assert.ok(guide.includes("context.executeTool(details"), file + " smoke test");
    assert.ok(guide.includes("getTools()"), file + " discovery API");
  }
  assert.ok(read(".github/AUTOMATION.md").includes("test-webmcp-services.mjs"));
  assert.ok(read("docs/webmcp-services-contract.md").includes("implemented-tested"));
});

test("CSP, read-only behavior and Pages bundle checks remain enforced", () => {
  const deployment = read(".github/workflows/deploy-pages.yml");
  for (const module of ["webmcp.js", "webmcp-services.mjs", "webmcp-services-data.mjs"]) {
    assert.ok(deployment.includes("test -f _site/assets/js/" + module), module);
  }
  const site = read(".github/workflows/site-validation.yml");
  assert.ok(site.includes("node --test .github/scripts/test-webmcp-services.mjs"));
  for (const file of [
    "assets/js/webmcp-services.mjs", "assets/js/webmcp-services-data.mjs",
  ]) {
    assert.doesNotMatch(read(file), /\b(?:fetch|XMLHttpRequest|sendBeacon|eval)\s*\(/);
    assert.doesNotMatch(read(file), /\b(?:localStorage|sessionStorage|navigator\.sendBeacon)\b/);
  }
  assert.equal(createPortfolioTools("pt-BR").length, 6);
  assert.equal(createServiceTools("pt-BR").length, 4);
  assert.equal(createWebMCPRegistry(undefined, undefined), null);
});
