const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { SITE_LANGUAGE_LABELS, resolveSiteLanguage } = require("../../assets/js/site.js");

const ROOT = path.resolve(__dirname, "../..");
const SITE_URL = "https://rodri-oliveira-dev.github.io";
const variants = [
  { key: "pt-BR", root: "", htmlLang: "pt-BR", hreflang: "pt-BR", label: "Idioma" },
  { key: "en", root: "en", htmlLang: "en", hreflang: "en", label: "Language" },
  { key: "es-419", root: "es", htmlLang: "es-419", hreflang: "es", label: "Idioma" },
];

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const homePath = (variant) => path.join(variant.root, "index.html");
const casePath = (variant, slug) => path.join(variant.root, "case-studies", slug, "index.html");
const pageUrl = (variant, slug = "") => {
  const languagePrefix = variant.root ? `/${variant.root}` : "";
  return `${SITE_URL}${languagePrefix}${slug ? `/case-studies/${slug}` : ""}/`;
};
const localHref = (variant, slug = "") => new URL(pageUrl(variant, slug)).pathname;

const extractAttribute = (html, selectorPattern, attribute) => {
  const attributePattern = attribute ? `[^>]*\\b${attribute}="([^"]+)"` : "";
  const match = html.match(new RegExp(`<${selectorPattern}${attributePattern}[^>]*>`, "i"));
  return match?.[1];
};

const meta = (html, attribute, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<meta[^>]+${attribute}="${escaped}"[^>]+content="([^"]+)"[^>]*>`, "i"));
  return match?.[1];
};

const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">\s*({[\s\S]*?})\s*<\/script>/g)]
  .map((match) => JSON.parse(match[1]));

const slugsFor = (variant) => {
  const root = path.join(ROOT, variant.root, "case-studies");
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "index.html")))
    .map((entry) => entry.name)
    .sort();
};

const validateLocalReferences = (relative, html) => {
  const documentDirectory = path.dirname(path.join(ROOT, relative));
  for (const match of html.matchAll(/\b(?:href|src|data)="([^"]+)"/g)) {
    const value = match[1];
    if (/^(?:https?:|mailto:|#|data:)/.test(value)) continue;
    const clean = value.split(/[?#]/, 1)[0];
    if (!clean) continue;
    let target = clean.startsWith("/")
      ? path.join(ROOT, clean.slice(1))
      : path.resolve(documentDirectory, clean);
    if (clean.endsWith("/")) target = path.join(target, "index.html");
    assert.ok(fs.existsSync(target), `${relative} references missing local resource ${value}`);
  }
};

const validatePage = (variant, relative, slug = "") => {
  assert.ok(fs.existsSync(path.join(ROOT, relative)), `Missing ${relative}`);
  const html = read(relative);
  const expectedUrl = pageUrl(variant, slug);
  assert.equal(extractAttribute(html, "html", "lang"), variant.htmlLang, `${relative} lang`);
  assert.equal(
    extractAttribute(html, 'link[^>]+rel="canonical"', "href"),
    expectedUrl,
    `${relative} canonical`,
  );

  const alternates = Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)]
    .map((match) => [match[1], match[2]]));
  const expectedAlternates = Object.fromEntries(variants.map((candidate) => [candidate.hreflang, pageUrl(candidate, slug)]));
  expectedAlternates["x-default"] = pageUrl(variants[0], slug);
  assert.deepEqual(alternates, expectedAlternates, `${relative} reciprocal hreflang`);
  assert.ok(!html.includes('hreflang="es-419"'), `${relative} must use hreflang=es`);

  assert.match(html, /<title>[^<]+<\/title>/i, `${relative} title`);
  assert.ok(meta(html, "name", "description"), `${relative} description`);
  for (const property of ["og:title", "og:description", "og:url", "og:image"]) {
    assert.ok(meta(html, "property", property), `${relative} ${property}`);
  }
  assert.equal(meta(html, "property", "og:url"), expectedUrl, `${relative} og:url`);
  for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    assert.ok(meta(html, "name", name), `${relative} ${name}`);
  }

  const switcher = html.match(/<div class="language-switcher"[^>]*aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(switcher, `${relative} language switcher`);
  assert.equal(switcher[1], variant.label, `${relative} localized language label`);
  for (const candidate of variants) {
    assert.ok(switcher[2].includes(`href="${localHref(candidate, slug)}"`), `${relative} link to ${candidate.key}`);
  }
  const currentLinks = [...switcher[2].matchAll(/<a[^>]*aria-current="page"[^>]*>/g)];
  assert.equal(currentLinks.length, 1, `${relative} active language count`);
  assert.ok(currentLinks[0][0].includes(`href="${localHref(variant, slug)}"`), `${relative} active language`);

  const payloads = jsonLd(html);
  assert.ok(payloads.length > 0, `${relative} valid JSON-LD`);
  if (slug) {
    const article = payloads.find((payload) => {
      const types = Array.isArray(payload["@type"]) ? payload["@type"] : [payload["@type"]];
      return types.includes("Article") && types.includes("TechArticle");
    });
    assert.ok(article, `${relative} TechArticle JSON-LD`);
    assert.equal(article.url, expectedUrl, `${relative} JSON-LD URL`);
    assert.equal(article.inLanguage, variant.htmlLang, `${relative} JSON-LD language`);
    for (const field of ["headline", "author", "datePublished", "dateModified", "image"]) {
      assert.ok(article[field], `${relative} JSON-LD ${field}`);
    }
  } else {
    const graph = payloads[0]["@graph"];
    assert.ok(Array.isArray(graph), `${relative} JSON-LD graph`);
    for (const type of ["WebSite", "ProfilePage", "Person"]) {
      assert.ok(graph.some((node) => node["@type"] === type), `${relative} JSON-LD ${type}`);
    }
    const profile = graph.find((node) => node["@type"] === "ProfilePage");
    assert.equal(profile.url, expectedUrl, `${relative} JSON-LD profile URL`);
    assert.equal(profile.inLanguage, variant.htmlLang, `${relative} JSON-LD profile language`);
  }

  assert.ok(!/href="javascript:/i.test(html), `${relative} unsafe javascript URL`);
  for (const anchor of html.matchAll(/<a[^>]+target="_blank"[^>]*>/g)) {
    assert.match(anchor[0], /rel="[^"]*noreferrer[^"]*"/, `${relative} external link rel`);
  }
  validateLocalReferences(relative, html);
};

assert.equal(resolveSiteLanguage("pt-BR"), "pt-BR");
assert.equal(resolveSiteLanguage("en"), "en");
assert.equal(resolveSiteLanguage("es-419"), "es-419");
assert.equal(resolveSiteLanguage("es-MX"), "es-419");
assert.equal(resolveSiteLanguage(""), "pt-BR");
assert.deepEqual(SITE_LANGUAGE_LABELS["es-419"], {
  openNavigation: "Abrir navegación",
  closeNavigation: "Cerrar navegación",
  primaryNavigation: "Navegación principal",
});
for (const language of variants.map((variant) => variant.key)) {
  for (const label of Object.values(SITE_LANGUAGE_LABELS[language])) {
    assert.ok(label.length > 0, `${language} must have complete navigation labels`);
  }
}

const slugSets = variants.map(slugsFor);
assert.equal(slugSets[0].length, 5, "Exactly five PT-BR case studies are expected");
for (const [index, slugs] of slugSets.entries()) {
  assert.deepEqual(slugs, slugSets[0], `${variants[index].key} case-study coverage`);
}

for (const variant of variants) {
  validatePage(variant, homePath(variant));
  for (const slug of slugSets[0]) validatePage(variant, casePath(variant, slug), slug);
  const home = read(homePath(variant));
  for (const slug of slugSets[0]) {
    assert.ok(home.includes(`href="${localHref(variant, slug)}"`), `${variant.key} homepage link to ${slug}`);
  }
}

const redirect = read("pt-br/index.html");
assert.match(redirect, /<meta name="robots" content="noindex,\s*follow">/);
assert.match(redirect, new RegExp(`<link rel="canonical" href="${SITE_URL}/">`));

const articleUrls = (html) => [...html.matchAll(/<a class="text-link" href="(https:\/\/www\.linkedin\.com\/pulse\/[^"]+)"/g)]
  .map((match) => match[1]);
assert.deepEqual(articleUrls(read("es/index.html")), articleUrls(read("index.html")), "Spanish homepage must preserve external article identities");
assert.equal(jsonLd(read("es/index.html"))[0]["@graph"].filter((node) => node["@type"] === "Article").length, 0, "Spanish JSON-LD must not claim untranslated articles");

const sitemapEntries = [...read("sitemap.xml").matchAll(/<url>\s*([\s\S]*?)\s*<\/url>/g)].map((match) => {
  const block = match[1];
  return {
    loc: block.match(/<loc>([^<]+)<\/loc>/)?.[1],
    lastmod: block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1],
    alternates: Object.fromEntries([...block.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)]
      .map((alternate) => [alternate[1], alternate[2]])),
  };
});
const expectedPages = variants.flatMap((variant) => [
  pageUrl(variant),
  ...slugSets[0].map((slug) => pageUrl(variant, slug)),
]);
assert.equal(sitemapEntries.length, expectedPages.length, "Sitemap URL count");
assert.deepEqual(new Set(sitemapEntries.map((entry) => entry.loc)), new Set(expectedPages), "Sitemap URL correspondence and uniqueness");
for (const entry of sitemapEntries) {
  assert.match(entry.lastmod ?? "", /^\d{4}-\d{2}-\d{2}$/, `${entry.loc} sitemap lastmod`);
  const slug = entry.loc.includes("/case-studies/") ? entry.loc.split("/case-studies/")[1].replace(/\/$/, "") : "";
  const expectedAlternates = Object.fromEntries(variants.map((variant) => [variant.hreflang, pageUrl(variant, slug)]));
  expectedAlternates["x-default"] = pageUrl(variants[0], slug);
  assert.deepEqual(entry.alternates, expectedAlternates, `${entry.loc} sitemap alternates`);
}

console.log(`Validated 3 homepages, ${slugSets[0].length * 3} localized case studies, legacy redirect, metadata, navigation, local resources, and sitemap.`);
