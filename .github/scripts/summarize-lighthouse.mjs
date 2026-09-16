import fs from "node:fs";
import path from "node:path";

const directory = ".lighthouseci";

if (!fs.existsSync(directory)) {
  throw new Error("Lighthouse report directory was not created.");
}

const reports = fs
  .readdirSync(directory)
  .filter((file) => file.endsWith(".json"))
  .map((file) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    } catch {
      return null;
    }
  })
  .filter((report) => report?.categories && report?.finalUrl);

if (reports.length === 0) {
  throw new Error("No Lighthouse reports were found.");
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const percent = (score) => `${Math.round(score * 100)}%`;
const byUrl = new Map();

for (const report of reports) {
  const url = report.finalUrl;
  const entry = byUrl.get(url) ?? {
    performance: [],
    accessibility: [],
    bestPractices: [],
    seo: [],
    seoFailures: new Map(),
  };

  entry.performance.push(report.categories.performance.score);
  entry.accessibility.push(report.categories.accessibility.score);
  entry.bestPractices.push(report.categories["best-practices"].score);
  entry.seo.push(report.categories.seo.score);

  for (const reference of report.categories.seo.auditRefs ?? []) {
    if (!reference.weight) continue;
    const audit = report.audits?.[reference.id];
    if (!audit || audit.score === 1 || audit.scoreDisplayMode === "notApplicable") continue;

    entry.seoFailures.set(reference.id, {
      title: audit.title,
      score: audit.score,
      displayValue: audit.displayValue,
    });
  }

  byUrl.set(url, entry);
}

const lines = [
  "## Lighthouse CI",
  "",
  "| URL | Performance | Accessibility | Best Practices | SEO |",
  "| --- | ---: | ---: | ---: | ---: |",
];

for (const [url, entry] of byUrl) {
  lines.push(
    `| ${url} | ${percent(median(entry.performance))} | ${percent(median(entry.accessibility))} | ${percent(median(entry.bestPractices))} | ${percent(median(entry.seo))} |`,
  );
}

const failures = [...byUrl.entries()].filter(([, entry]) => entry.seoFailures.size > 0);
if (failures.length > 0) {
  lines.push("", "### SEO audits below full score");
  for (const [url, entry] of failures) {
    lines.push("", `**${url}**`);
    for (const [id, audit] of entry.seoFailures) {
      const detail = audit.displayValue ? ` — ${audit.displayValue}` : "";
      lines.push(`- \`${id}\`: ${audit.title}${detail}`);
    }
  }
}

const summary = `${lines.join("\n")}\n`;
console.log(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
}
