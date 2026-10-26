const fs = require("node:fs");
const path = require("node:path");

const localOrigin = "http://127.0.0.1:8080";
const languageRoots = ["", "en", "es"];
const pageUrls = languageRoots
  .filter((root) => fs.existsSync(path.join(root, "index.html")))
  .map((root) => `${localOrigin}/${root ? `${root}/` : ""}`);
const caseStudyUrls = languageRoots
  .map((root) => path.join(root, "case-studies"))
  .filter((root) => fs.existsSync(root))
  .flatMap((root) => fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "index.html")))
    .map((entry) => `${localOrigin}/${root.split(path.sep).join("/")}/${entry.name}/`))
  .sort();

module.exports = {
  defaults: {
    standard: "WCAG2AA",
    runners: ["axe", "htmlcs"],
    ignore: ["color-contrast"],
    timeout: 30000,
    wait: 250,
    chromeLaunchConfig: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  urls: [
    ...pageUrls,
    ...caseStudyUrls,
  ],
};
