const { discoverLighthousePages } = require("./.github/scripts/lighthouse-pages.cjs");

const configuredUrls = process.env.LHCI_URLS
  ? JSON.parse(process.env.LHCI_URLS)
  : discoverLighthousePages().map((page) => page.url);
const numberOfRuns = Number.parseInt(process.env.LHCI_NUMBER_OF_RUNS ?? "3", 10);

module.exports = {
  ci: {
    collect: {
      url: configuredUrls,
      numberOfRuns,
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
