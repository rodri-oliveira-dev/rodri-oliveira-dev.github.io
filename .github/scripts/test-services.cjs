"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SITE = "https://rodri-oliveira-dev.github.io";
const PERSON_ID = SITE + "/#person";
const WEBSITE_ID = SITE + "/#website";
const languages = [
  { code: "pt-BR", hreflang: "pt-BR", file: "servicos/index.html", route: "/servicos/", home: "/", label: "Serviços" },
  { code: "en", hreflang: "en", file: "en/services/index.html", route: "/en/services/", home: "/en/", label: "Services" },
  { code: "es-419", hreflang: "es", file: "es/servicios/index.html", route: "/es/servicios/", home: "/es/", label: "Servicios" },
];
const expectedAlternates = {
  "pt-BR": SITE + languages[0].route,
  en: SITE + languages[1].route,
  es: SITE + languages[2].route,
  "x-default": SITE + languages[0].route,
};
const projects = [
  "adr-guard",
  "reliable-webhooks",
  "dotnet-observability-lab",
  "dapper-fluentmap",
];
const companies = ["Bosch América Latina", "Nestlé Brasil", "Novo Nordisk"];

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const htmlFor = (variant) => read(variant.file);
const capture = (html, regex, label) => {
  const match = html.match(regex);
  assert.ok(match, "Missing " + label);
  return match[1];
};
const alternatesFor = (html) => Object.fromEntries(
  [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)]
    .map((result) => [result[1], result[2]]),
);
const title = (html) => capture(html, /<title>([^<]+)<\/title>/, "title");
const description = (html) =>
  capture(html, /<meta name="description" content="([^"]+)">/, "description");
const canonical = (html) =>
  capture(html, /<link rel="canonical" href="([^"]+)">/, "canonical");
const schemaFor = (html) => JSON.parse(capture(
  html, /<script type="application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/,
  "JSON-LD",
));
const headings = (html) => [...html.matchAll(/<article class="services-card">[\s\S]*?<h3>([^<]+)<\/h3>/g)]
  .map((match) => match[1].trim());

test("three localized service pages have accessible landmarks and consistent content", () => {
  for (const variant of languages) {
    const html = htmlFor(variant);
    assert.ok(html.includes('<html lang="' + variant.code + '">'), variant.file + " lang");
    assert.ok(html.includes('<a class="skip-link" href="#main">'), variant.file + " skip link");
    assert.ok(html.includes('<main id="main">'), variant.file + " main landmark");
    assert.ok(html.includes('<nav class="nav"'), variant.file + " navigation");
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, variant.file + " one h1");
    for (const section of ["atuacao", "abordagem", "experiencia", "evidencias", "contato"]) {
      assert.ok(html.includes('id="' + section + '"'), variant.file + " " + section);
      assert.ok(html.includes('href="#' + section + '"'), variant.file + " nav anchor " + section);
    }
    assert.equal(headings(html).length, 4, variant.file + " four service categories");
    assert.equal((html.match(/class="services-process__item"/g) ?? []).length, 3,
      variant.file + " three approach steps");
    assert.equal((html.match(/class="services-proof__item"/g) ?? []).length, 4,
      variant.file + " four public case studies");
    for (const company of companies) assert.ok(html.includes(company), variant.file + " " + company);
    assert.equal((html.match(/<li>\s*<h3>(Bosch América Latina|Nestlé Brasil|Novo Nordisk)<\/h3>/g) ?? []).length, 3,
      variant.file + " experiences remain clearly identified");
    assert.ok(html.includes('href="mailto:rodrigodotnet@outlook.com'), variant.file + " email");
    assert.ok(html.includes("linkedin.com/in/rodri-oliveira-dev"), variant.file + " LinkedIn");
    assert.ok(html.includes("connect-src 'none'"), variant.file + " existing CSP");
  }
});

test("canonical, hreflang, Open Graph and JSON-LD stay aligned with published content", () => {
  for (const variant of languages) {
    const html = htmlFor(variant);
    const pageUrl = SITE + variant.route;
    assert.equal(canonical(html), pageUrl, variant.file + " canonical");
    assert.deepEqual(alternatesFor(html), expectedAlternates, variant.file + " reciprocal alternates");
    assert.ok(!html.includes('hreflang="es-419"'), variant.file + " search engines use es");
    assert.ok(html.includes('<meta property="og:url" content="' + pageUrl + '">'),
      variant.file + " Open Graph URL");
    assert.ok(html.includes('<meta property="og:title" content="' + title(html) + '">'),
      variant.file + " Open Graph title");
    assert.ok(html.includes('<meta name="twitter:title" content="' + title(html) + '">'),
      variant.file + " social title");
    const payload = schemaFor(html);
    const nodes = Object.fromEntries(payload["@graph"].map((node) => [node["@type"], node]));
    assert.deepEqual(Object.keys(nodes).sort(), ["BreadcrumbList", "Service", "WebPage"]);
    assert.equal(nodes.WebPage.url, pageUrl);
    assert.equal(nodes.WebPage.name, title(html));
    assert.equal(nodes.WebPage.description, description(html));
    assert.equal(nodes.WebPage.inLanguage, variant.code);
    assert.equal(nodes.WebPage.isPartOf["@id"], WEBSITE_ID);
    assert.equal(nodes.WebPage.mainEntity["@id"], pageUrl + "#service");
    assert.equal(nodes.Service.provider["@id"], PERSON_ID);
    assert.equal(nodes.Service.mainEntityOfPage["@id"], pageUrl + "#webpage");
    assert.deepEqual(nodes.Service.serviceType, headings(html),
      variant.file + " schema reflects the actual four services");
    assert.ok(!("offers" in nodes.Service), variant.file + " no unverified offer");
    assert.ok(!("aggregateRating" in nodes.Service), variant.file + " no fabricated ratings");
    assert.equal(nodes.BreadcrumbList.itemListElement.length, 2);
    assert.equal(nodes.BreadcrumbList.itemListElement[0].item, SITE + variant.home);
    assert.equal(nodes.BreadcrumbList.itemListElement[1].item, pageUrl);
  }
});

test("language switcher and evidence links are localized and point to existing files", () => {
  for (const variant of languages) {
    const html = htmlFor(variant);
    const languageSwitcher = capture(
      html, /<div class="language-switcher"[^>]*>([\s\S]*?)<\/div>/,
      "language switcher",
    );
    const active = [...languageSwitcher.matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)];
    assert.equal(active.length, 1, variant.file + " single current language");
    assert.ok(active[0][0].includes('href="' + variant.route + '"'),
      variant.file + " current language link");
    for (const other of languages) {
      assert.ok(languageSwitcher.includes('href="' + other.route + '"'),
        variant.file + " cross-language " + other.code);
    }
    assert.ok(html.includes('href="' + variant.home + '"'), variant.file + " home link");
    const prefix = variant.home === "/" ? "" : variant.home.slice(0, -1);
    for (const slug of projects) {
      assert.ok(html.includes('href="' + prefix + '/case-studies/' + slug + '/"'),
        variant.file + " localized evidence " + slug);
    }

    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
      const value = match[1];
      if (value.startsWith("#")) {
        assert.ok(ids.has(value.slice(1)), variant.file + " broken anchor " + value);
        continue;
      }
      if (!value.startsWith("/")) continue;
      const relative = value.split(/[?#]/, 1)[0].replace(/^\//, "");
      const filename = path.join(ROOT, relative, value.endsWith("/") ? "index.html" : "");
      assert.ok(fs.existsSync(filename), variant.file + " broken local reference " + value);
    }
  }
});

test("service pages are discoverable from all three homepages and the mobile menu", () => {
  for (const variant of languages) {
    const normalizedHome = variant.home.slice(1) + "index.html";
    const home = read(normalizedHome);
    const nav = capture(home, /<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/, "homepage navigation");
    assert.ok(nav.includes('href="' + variant.route + '">' + variant.label + "</a>"),
      variant.code + " main navigation");
    assert.ok(home.includes('class="freelance-services-link"'), variant.code + " contextual link");
    assert.ok(home.includes('href="' + variant.route + '"'), variant.code + " services link");
  }
  const siteScript = read("assets/js/site.js");
  assert.ok(siteScript.includes('desktopNav.querySelectorAll("a")'),
    "mobile menu clones the desktop navigation links");
});

test("sitemap lists all three pages with reciprocal alternate URLs", () => {
  const entries = [...read("sitemap.xml").matchAll(/<url>\s*([\s\S]*?)\s*<\/url>/g)].map((match) => match[1]);
  for (const variant of languages) {
    const url = SITE + variant.route;
    const matches = entries.filter((entry) => entry.includes("<loc>" + url + "</loc>"));
    assert.equal(matches.length, 1, variant.file + " unique sitemap entry");
    const entry = matches[0];
    assert.match(entry, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    const values = Object.fromEntries([...entry.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)]
      .map((match) => [match[1], match[2]]));
    assert.deepEqual(values, expectedAlternates);
  }
});

test("WCAG, Lighthouse, responsive, HTML and spelling gates include the service pages", () => {
  const pa11y = require(path.join(ROOT, ".pa11yci.cjs"));
  const lighthouse = require(path.join(ROOT, "lighthouserc.cjs"));
  const { discoverLighthousePages } = require(path.join(ROOT, ".github/scripts/lighthouse-pages.cjs"));
  const site = read(".github/workflows/site-validation.yml");
  const accessibility = read(".github/workflows/accessibility.yml");
  const lighthousePages = discoverLighthousePages(ROOT);
  const responsive = read(".github/scripts/test-responsive.cjs");
  for (const variant of languages) {
    const servicePath = variant.route.slice(1);
    const localUrl = "http://127.0.0.1:8080" + variant.route;
    assert.ok(pa11y.urls.includes(localUrl), variant.file + " Pa11y URL");
    assert.ok(lighthouse.ci.collect.url.includes(localUrl), variant.file + " Lighthouse URL");
    assert.ok(site.includes(variant.file), variant.file + " HTML/cspell coverage");
    assert.ok(accessibility.includes('Path("' + variant.file + '")'), variant.file + " WCAG fixture");
    assert.ok(lighthousePages.some((page) => page.file === variant.file),
      variant.file + " Lighthouse fixture");
    assert.ok(responsive.includes('"' + variant.route + '"'),
      variant.file + " viewport coverage");
    assert.ok(fs.existsSync(path.join(ROOT, servicePath, "index.html")));
  }
  assert.ok(site.includes("node .github/scripts/test-services.cjs"), "service test in CI");
  assert.ok(responsive.includes('href.startsWith("/")'), "mobile navigation handles full-page routes");
  assert.ok(responsive.includes("waitForNavigation"), "mobile navigation waits for document load");
});
