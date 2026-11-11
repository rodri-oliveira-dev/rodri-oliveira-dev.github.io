import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECTS, PROFILES, SKILLS, SITE_URL, projectSummary } from "../../assets/js/webmcp-data.mjs";
import { DEFAULT_LANGUAGE, MESSAGES, SUPPORTED_LANGUAGES, pageLanguage, resolveLanguage } from "../../assets/js/webmcp-i18n.mjs";
import { createPortfolioTools } from "../../assets/js/webmcp-tools.mjs";
import { createWebMCPRegistry } from "../../assets/js/webmcp.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");
const NAMES = ["getProfile", "getSkills", "searchProjects", "getProjectDetails", "getResume", "getContactInfo"];
const PAGE = { "pt-BR": "index.html", en: "en/index.html", "es-419": "es/index.html" };
const tools = (language) => createPortfolioTools(language);
const call = (language, name, input = {}) => tools(language).find((tool) => tool.name === name).execute(input);

/** Assert that a failed tool call returns a localized, serializable error. */
function expectError(output, code, language) {
  assert.equal(output.error?.code, code);
  assert.equal(output.language, language);
  assert.ok(output.error.message.length > 5);
  assert.doesNotThrow(() => JSON.stringify(output));
}

/** Normalize project-card HTML into the same plain text used by WebMCP. */
function cleanHtml(fragment) {
  return fragment.replace(/<wbr\s*\/?>/gi, "").replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Extract published project cards for a locale and detect content drift. */
function htmlCards(relative) {
  const html = read(relative);
  const section = html.match(/<section class="section projects-section" id="projects">([\s\S]*?)<\/section>/);
  assert.ok(section, "Projects section must exist in " + relative);
  return [...section[1].matchAll(/<article class="project-card">([\s\S]*?)<\/article>/g)].map((match) => {
    const content = match[1];
    const title = content.match(/<h3>([\s\S]*?)<\/h3>/)?.[1];
    const description = content.match(/<p>([\s\S]*?)<\/p>/)?.[1];
    const tagsBlock = content.match(/<div class="tags">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(title && description && tagsBlock, relative + " project card structure");
    return {
      name: cleanHtml(title),
      description: cleanHtml(description),
      technologies: [...tagsBlock.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => cleanHtml(m[1])),
      links: [...content.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[1]),
    };
  });
}

/** Read the homepage Person JSON-LD to compare public profile fields. */
function seoPerson(relative) {
  const match = read(relative).match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(match, relative + " must contain JSON-LD");
  const graph = JSON.parse(match[1])["@graph"];
  assert.ok(Array.isArray(graph));
  const person = graph.find((node) => node["@type"] === "Person");
  assert.ok(person);
  return person;
}

test("tool names, schemas and safety annotations remain stable", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    const registered = tools(language);
    assert.deepEqual(registered.map((tool) => tool.name), NAMES);
    for (const tool of registered) {
      assert.equal(typeof tool.execute, "function");
      assert.ok(tool.description.length > 15, tool.name);
      assert.deepEqual(tool.annotations, {
        readOnlyHint: true, idempotentHint: true, openWorldHint: false,
      });
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.deepEqual(tool.inputSchema.properties.language.enum, [...SUPPORTED_LANGUAGES]);
      assert.ok(tool.inputSchema.properties.language.description.length > 12);
      assert.doesNotThrow(() => JSON.stringify(tool.inputSchema));
    }
    assert.deepEqual(registered.find((tool) => tool.name === "getProjectDetails").inputSchema.required, ["projectId"]);
  }
});

test("localized tool descriptions, schema hints, errors and language resolver", () => {
  assert.equal(DEFAULT_LANGUAGE, "pt-BR");
  assert.equal(pageLanguage("en"), "en");
  assert.equal(pageLanguage("es-419"), "es-419");
  assert.equal(pageLanguage("fr"), DEFAULT_LANGUAGE);
  assert.equal(resolveLanguage(undefined, "en"), "en");
  assert.equal(resolveLanguage("pt-BR", "en"), "pt-BR");
  assert.equal(resolveLanguage("fr", "en"), null);
  assert.equal(resolveLanguage(null, "en"), null);
  for (const name of NAMES) {
    assert.equal(new Set(SUPPORTED_LANGUAGES.map((lang) => MESSAGES[lang].tools[name])).size, 3, name);
  }
  for (const field of ["language", "query", "technology", "limit", "projectId"]) {
    assert.equal(new Set(SUPPORTED_LANGUAGES.map((lang) => MESSAGES[lang].parameters[field])).size, 3, field);
  }
});

test("every tool defaults to page language and accepts an explicit override", () => {
  for (const page of SUPPORTED_LANGUAGES) {
    const other = page === "en" ? "pt-BR" : "en";
    for (const name of NAMES) {
      const input = name === "getProjectDetails" ? { projectId: PROJECTS[0].id } : {};
      const own = call(page, name, input);
      const cross = call(page, name, { ...input, language: other });
      assert.equal(own.language, page, name);
      assert.equal(cross.language, other, name);
      assert.doesNotThrow(() => JSON.stringify(own));
      assert.doesNotThrow(() => JSON.stringify(cross));
    }
    assert.equal(call(page, "getProfile").role, PROFILES[page].role);
    assert.deepEqual(call(page, "getSkills").skills, SKILLS[page]);
  }
  assert.equal(call("pt-BR", "getProfile", { language: "en" }).role, "Senior Software Architect");
  assert.equal(call("en", "getProfile", { language: "pt-BR" }).role, "Arquiteto de Software Sênior");
  assert.equal(call("en", "getProfile", { language: "es-419" }).role, "Arquitecto de Software Senior");
  assert.equal(call("es-419", "getProfile", { language: "en" }).role, "Senior Software Architect");
  assert.deepEqual(call("en", "getResume").availableLanguages, ["pt-BR"]);
});

test("search is multilingual, accent-insensitive and applies limits", () => {
  assert.equal(PROJECTS.length, 5);
  assert.equal(call("pt-BR", "searchProjects").total, 5);
  assert.equal(call("en", "searchProjects", { technology: ".NET" }).total, 4);
  assert.equal(call("en", "searchProjects", { technology: "Resiliência" }).total, 1);
  assert.equal(call("pt-BR", "searchProjects", { technology: "resilience" }).total, 1);
  assert.equal(call("pt-BR", "searchProjects", { technology: "resiliencia" }).total, 1);
  assert.equal(call("es-419", "searchProjects", { technology: "Resiliencia" }).total, 1);
  assert.equal(call("en", "searchProjects", { query: "mensajería" }).total, 1);
  assert.ok(call("en", "searchProjects", { query: "observabilidade" }).total >= 1);
  assert.ok(call("pt-BR", "searchProjects", { query: "observability" }).total >= 1);
  const limited = call("pt-BR", "searchProjects", { limit: 2 });
  assert.equal(limited.total, 5);
  assert.equal(limited.projects.length, 2);
  assert.equal(call("pt-BR", "getProjectDetails", { projectId: " ADR-GUARD " }).project.id, "adr-guard");
  const skills = call("en", "getSkills").skills;
  skills.push("injected");
  assert.ok(!call("en", "getSkills").skills.includes("injected"));
});

test("invalid inputs always return actionable, localized errors", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    for (const name of NAMES) {
      const base = name === "getProjectDetails" ? { projectId: "adr-guard" } : {};
      expectError(call(language, name, null), "INVALID_INPUT", language);
      expectError(call(language, name, []), "INVALID_INPUT", language);
      expectError(call(language, name, { ...base, extra: true }), "INVALID_INPUT", language);
      expectError(call(language, name, { ...base, language: "es" }), "UNSUPPORTED_LANGUAGE", language);
    }
    for (const input of [
      { query: "x".repeat(121) }, { technology: "x".repeat(81) },
      { query: 7 }, { technology: [] }, { limit: 0 }, { limit: 6 },
      { limit: 1.1 }, { limit: "2" },
    ]) {
      expectError(call(language, "searchProjects", input), "INVALID_INPUT", language);
    }
    expectError(call(language, "getProjectDetails", {}), "INVALID_INPUT", language);
    expectError(call(language, "getProjectDetails", { projectId: " " }), "INVALID_INPUT", language);
    expectError(call(language, "getProjectDetails", { projectId: "unknown" }), "PROJECT_NOT_FOUND", language);
  }
});

test("project catalog is synchronized with HTML content in all three languages", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    const relative = PAGE[language];
    const cards = htmlCards(relative);
    assert.equal(cards.length, PROJECTS.length, relative + " project card count");
    const results = call(language, "searchProjects").projects;
    for (const [index, project] of PROJECTS.entries()) {
      const expected = projectSummary(project, language);
      const card = cards[index];
      assert.equal(card.name, expected.name, relative + " name: " + project.id);
      assert.equal(card.description, expected.description, relative + " description: " + project.id);
      assert.deepEqual(card.technologies, expected.technologies, relative + " tags: " + project.id);
      assert.ok(card.links.includes(expected.repositoryUrl), relative + " repository: " + project.id);
      assert.ok(card.links.includes(new URL(expected.caseStudyUrl).pathname), relative + " case study: " + project.id);
      assert.ok(existsSync(path.join(ROOT, new URL(expected.caseStudyUrl).pathname.slice(1), "index.html")));
      assert.deepEqual(results[index], expected, relative + " tool output: " + project.id);
    }
  }
});

test("profile, skills, contact and resume match published HTML and JSON-LD", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    const homepage = read(PAGE[language]);
    const person = seoPerson(PAGE[language]);
    const profile = call(language, "getProfile");
    const contact = call(language, "getContactInfo");
    assert.equal(profile.name, person.name);
    assert.equal(profile.summary, person.description);
    assert.deepEqual(SKILLS[language], person.knowsAbout);
    assert.equal("mailto:" + contact.email, person.email);
    assert.ok(homepage.includes('href="mailto:' + contact.email + '"'));
    assert.ok(homepage.includes('href="' + contact.linkedInUrl + '"'));
    assert.ok(homepage.includes('href="' + contact.githubUrl + '"'));
    assert.equal(profile.websiteUrl, SITE_URL + (language === "en" ? "/en/" : language === "es-419" ? "/es/" : "/"));
    assert.equal(contact.websiteUrl, profile.websiteUrl);
  }
  const resume = call("en", "getResume");
  assert.equal(resume.htmlUrl, SITE_URL + "/curriculo/");
  assert.equal(resume.pdfUrl, SITE_URL + "/curriculo/rodrigo-de-oliveira.pdf");
  assert.ok(read("curriculo/index.html").includes('href="./rodrigo-de-oliveira.pdf"'));
  assert.ok(read("index.html").includes('href="/curriculo/"'));
  assert.deepEqual(resume.availableLanguages, ["pt-BR"]);
});

test("page loading and existing CSP remain unchanged and safe", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    const html = read(PAGE[language]);
    assert.ok(html.includes('<script type="module" src="/assets/js/webmcp.js"></script>'));
    assert.ok(html.includes("connect-src 'none'"));
    assert.ok(html.includes("script-src 'self'"));
    for (const project of PROJECTS) {
      const relative = (language === "en" ? "en/" : language === "es-419" ? "es/" : "") +
        "case-studies/" + project.id + "/index.html";
      assert.ok(read(relative).includes('src="/assets/js/webmcp.js"'), relative);
    }
  }
  assert.ok(read("curriculo/index.html").includes('src="/assets/js/webmcp.js"'));
  assert.ok(read("es/index.html").includes('src="/assets/js/webmcp.js"'));
  for (const relative of [
    "assets/js/webmcp.js", "assets/js/webmcp-tools.mjs",
    "assets/js/webmcp-data.mjs", "assets/js/webmcp-i18n.mjs",
  ]) {
    assert.doesNotMatch(read(relative), /\b(?:fetch|XMLHttpRequest|sendBeacon|eval)\s*\(/);
  }
});

test("registry handles feature detection, abort and registration failures", async () => {
  const registered = [];
  const listeners = new Map();
  const document = {
    documentElement: { lang: "pt-BR" },
    modelContext: { registerTool(tool, options) {
      registered.push({ tool, options });
      return Promise.resolve();
    } },
  };
  const window = {
    isSecureContext: true,
    addEventListener(name, listener) { listeners.set(name, listener); },
  };
  const registry = createWebMCPRegistry(document, window);
  assert.equal(registry.language, "pt-BR");
  await Promise.all(tools("pt-BR").map((tool) => registry.registerTool(tool)));
  assert.deepEqual(registered.map((r) => r.tool.name), NAMES);
  const signal = registered[0].options.signal;
  assert.ok(registered.every((r) => r.options.signal === signal));
  assert.ok(!signal.aborted);
  listeners.get("pagehide")();
  assert.ok(signal.aborted);
  await assert.rejects(registry.registerTool(tools("pt-BR")[0]), /no longer active/);

  // A normal pageshow must not restore tools after pagehide.
  listeners.get("pageshow")({ persisted: false });
  assert.equal(registered.length, NAMES.length);

  // Returning through the bfcache restores all six tools with a new signal.
  listeners.get("pageshow")({ persisted: true });
  assert.equal(registered.length, NAMES.length * 2);
  assert.deepEqual(registered.slice(6).map((item) => item.tool.name), NAMES);
  const restoredSignal = registered[6].options.signal;
  assert.notEqual(restoredSignal, signal);
  assert.ok(!restoredSignal.aborted);
  assert.ok(registered.slice(6).every((item) => item.options.signal === restoredSignal));

  // Duplicate pageshow events must not register the same tools twice.
  listeners.get("pageshow")({ persisted: true });
  assert.equal(registered.length, NAMES.length * 2);

  // A second trip through the bfcache must work with another fresh signal.
  listeners.get("pagehide")();
  assert.ok(restoredSignal.aborted);
  listeners.get("pageshow")({ persisted: true });
  assert.equal(registered.length, NAMES.length * 3);
  assert.notEqual(registered[12].options.signal, restoredSignal);
  assert.deepEqual(registered.slice(12).map((item) => item.tool.name), NAMES);

  registry.dispose();
  assert.ok(registered[12].options.signal.aborted);
  await assert.rejects(registry.registerTool(tools("pt-BR")[0]), /no longer active/);
  assert.equal(createWebMCPRegistry({ documentElement: { lang: "es-419" }, modelContext: document.modelContext }, window).language, "es-419");
  assert.equal(createWebMCPRegistry({ documentElement: { lang: "fr" }, modelContext: document.modelContext }, window), null);
  assert.equal(createWebMCPRegistry(document, { ...window, isSecureContext: false }), null);
  assert.equal(createWebMCPRegistry({ documentElement: { lang: "en" } }, window), null);
  assert.equal(createWebMCPRegistry(undefined, undefined), null);
  const failing = createWebMCPRegistry({
    documentElement: { lang: "en" },
    modelContext: { registerTool() { throw Error("registration denied"); } },
  }, window);
  assert.throws(() => failing.registerTool(tools("en")[0]), /registration denied/);
  failing.dispose();
});

test("browser module automatically registers six tools in the presence of WebMCP", () => {
  const runner = [
    "const registrations = []; const handlers = new Map();",
    "globalThis.document = { documentElement: { lang: 'en' }, modelContext: {",
    " registerTool(tool, options) { registrations.push({ name: tool.name, signal: options.signal }); return Promise.resolve(); } } };",
    "globalThis.window = { isSecureContext: true, addEventListener(name, callback) { handlers.set(name, callback); } };",
    "const entry = await import('./assets/js/webmcp.js');",
    "const outcomes = await entry.webMCPRegistrations;",
    "const before = registrations[0].signal.aborted; handlers.get('pagehide')();",
    "const after = registrations[0].signal.aborted;",
    "handlers.get('pageshow')({ persisted: false }); const nonCachedCount = registrations.length;",
    "handlers.get('pageshow')({ persisted: true }); await Promise.resolve();",
    "const restored = registrations.slice(6).map((r) => r.name);",
    "const freshSignal = registrations[6].signal !== registrations[0].signal && !registrations[6].signal.aborted;",
    "process.stdout.write(JSON.stringify({ names: registrations.slice(0, 6).map((r) => r.name),",
    " statuses: outcomes.map((r) => r.status), before, after, nonCachedCount, restored, freshSignal }));",
  ].join("\n");
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", runner],
    { cwd: ROOT, encoding: "utf8" }));
  assert.deepEqual(result.names, NAMES);
  assert.deepEqual(result.statuses, NAMES.map(() => "fulfilled"));
  assert.equal(result.before, false);
  assert.equal(result.after, true);
  assert.equal(result.nonCachedCount, NAMES.length);
  assert.deepEqual(result.restored, NAMES);
  assert.equal(result.freshSignal, true);
});


test("trilingual WebMCP guides and Pages packaging contract stay discoverable", () => {
  const pt = read("docs/webmcp.pt-BR.md");
  const en = read("docs/webmcp.en.md");
  const es = read("docs/webmcp.es-419.md");
  const readmePt = read("README.md");
  const readmeEn = read("README.en.md");
  const readmeEs = read("README.es.md");
  const automation = read(".github/AUTOMATION.md");
  const deploy = read(".github/workflows/deploy-pages.yml");

  for (const name of NAMES) {
    assert.ok(pt.includes(name), "PT documentation must cover " + name);
    assert.ok(en.includes(name), "EN documentation must cover " + name);
    assert.ok(es.includes(name), "ES documentation must cover " + name);
  }
  for (const language of SUPPORTED_LANGUAGES) {
    assert.ok(pt.includes(language) && en.includes(language) && es.includes(language));
  }
  assert.ok(readmePt.includes("docs/webmcp.pt-BR.md"));
  assert.ok(readmeEn.includes("docs/webmcp.en.md"));
  assert.ok(readmeEs.includes("docs/webmcp.es-419.md"));
  assert.ok(automation.includes("../docs/webmcp.pt-BR.md"));
  assert.ok(automation.includes("../docs/webmcp.en.md"));
  assert.ok(automation.includes("../docs/webmcp.es-419.md"));
  assert.ok(pt.includes("node --test .github/scripts/test-webmcp.mjs"));
  assert.ok(en.includes("node --test .github/scripts/test-webmcp.mjs"));
  assert.ok(es.includes("node --test .github/scripts/test-webmcp.mjs"));

  for (const name of ["webmcp.js", "webmcp-tools.mjs", "webmcp-data.mjs", "webmcp-i18n.mjs"]) {
    assert.ok(deploy.includes("test -f _site/assets/js/" + name),
      "Pages artifact must include " + name);
  }
  for (const doc of ["webmcp.pt-BR.md", "webmcp.en.md", "webmcp.es-419.md"]) {
    assert.ok(deploy.includes("test -f _site/docs/" + doc));
  }
  assert.ok(deploy.includes("test -f _site/es/index.html"));
});
