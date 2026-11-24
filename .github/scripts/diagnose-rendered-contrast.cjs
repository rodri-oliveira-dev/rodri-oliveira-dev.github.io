// Diagnostic only: retain the original Pa11y gate and report raw axe outcomes.
const path = require("node:path");
const puppeteer = require("puppeteer");
const axe = require(require.resolve("axe-core", { paths: [path.dirname(require.resolve("pa11y"))] }));
const { urls } = require("../../.pa11yci.cjs");
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    for (const url of urls) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 1280, height: 1024 });
        await page.setBypassCSP(true); // Local diagnostic injection only; deployed CSP unchanged.
        await page.goto(url, { waitUntil: "load" });
        await page.addScriptTag({ content: axe.source });
        const result = await page.evaluate(async () => {
          const { violations, incomplete } = await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } });
          return { violations, incomplete };
        });
        for (const [status, rules] of Object.entries(result)) {
          for (const rule of rules) {
            for (const node of rule.nodes) {
              console.log(JSON.stringify({ url, status, rule: rule.id, target: node.target, summary: node.failureSummary, checks: [...node.any, ...node.all, ...node.none].map(check => ({ id: check.id, data: check.data, message: check.message, relatedNodes: check.relatedNodes?.map(n => n.target) })) }));
            }
          }
        }
        console.log(JSON.stringify({ url, axe: axe.version, violations: result.violations.flatMap(r => r.nodes).length, incomplete: result.incomplete.flatMap(r => r.nodes).length }));
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
