const fs = require("node:fs");
const path = require("node:path");

const languageRoots = ["", "en", "es"];
const pageUrls = languageRoots
  .map((root) => `http://127.0.0.1:8080/${root ? `${root}/` : ""}`);
const caseStudyUrls = languageRoots
  .map((root) => path.join(root, "case-studies"))
  .filter((root) => fs.existsSync(root))
  .flatMap((root) => fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "index.html")))
    .map((entry) => `http://127.0.0.1:8080/${root.split(path.sep).join("/")}/${entry.name}/`))
  .sort();

module.exports = {
  ci: {
    collect: {
      url: [
        ...pageUrls,
        ...caseStudyUrls,
      ],
      numberOfRuns: 3,
      settings: {
        chromeFlags: "--no-sandbox --disable-dev-shm-usage --disable-gpu",
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.8, aggregationMethod: "median" }],
        "categories:accessibility": ["error", { minScore: 1.0, aggregationMethod: "median" }],
        "categories:best-practices": ["error", { minScore: 0.95, aggregationMethod: "median" }],
        "categories:seo": ["error", { minScore: 0.95, aggregationMethod: "median" }],
      },
    },
  },
};
