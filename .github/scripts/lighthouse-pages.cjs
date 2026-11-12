const fs = require("node:fs");
const path = require("node:path");

const ORIGIN = "http://127.0.0.1:8080";

function toUrl(file) {
  const normalized = file.split(path.sep).join("/");
  const route = normalized === "index.html"
    ? "/"
    : `/${normalized.replace(/index\.html$/, "")}`;
  return `${ORIGIN}${route}`;
}

function discoverLighthousePages(root = process.cwd()) {
  const fixed = [
    "index.html",
    "en/index.html",
    "es/index.html",
    "curriculo/index.html",
    "servicos/index.html",
    "en/services/index.html",
    "es/servicios/index.html",
  ];
  const pages = fixed.filter((file) => fs.existsSync(path.join(root, file)));

  for (const languageRoot of ["case-studies", "en/case-studies", "es/case-studies"]) {
    const absoluteRoot = path.join(root, languageRoot);
    if (!fs.existsSync(absoluteRoot)) continue;
    for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
      const file = path.posix.join(languageRoot, entry.name, "index.html");
      if (entry.isDirectory() && fs.existsSync(path.join(root, file))) pages.push(file);
    }
  }

  return [...new Set(pages)].sort().map((file) => ({ file, url: toUrl(file) }));
}

module.exports = { ORIGIN, discoverLighthousePages, toUrl };
