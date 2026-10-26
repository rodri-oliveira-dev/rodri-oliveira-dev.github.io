const assert = require("node:assert/strict");
const { SITE_LANGUAGE_LABELS, resolveSiteLanguage } = require("../../assets/js/site.js");

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

for (const language of ["pt-BR", "en", "es-419"]) {
  for (const label of Object.values(SITE_LANGUAGE_LABELS[language])) {
    assert.ok(label.length > 0, `${language} must have complete navigation labels`);
  }
}

console.log("Site language resolution and navigation labels are valid.");
