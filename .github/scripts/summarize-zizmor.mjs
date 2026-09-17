import fs from "node:fs";

const reportPath = ".zizmor/report.json";
const exitCodePath = ".zizmor/exit-code";
const commentPath = ".zizmor/pr-comment.md";

const escapeCell = (value) =>
  String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();

const titleCase = (value) => {
  const text = String(value ?? "unknown").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const primaryLocation = (finding) => {
  const locations = Array.isArray(finding.locations) ? finding.locations : [];
  const location =
    locations.find((item) => item?.symbolic?.kind === "Primary") ??
    locations[0];

  if (!location) return "—";

  const path =
    location?.symbolic?.key?.Local?.verbatim_path ??
    location?.symbolic?.key?.Remote?.verbatim_path ??
    "unknown";
  const row = location?.concrete?.location?.start_point?.row;
  const line = Number.isInteger(row) ? row + 1 : null;

  return line ? `${path}:${line}` : path;
};

let findings = [];
let parseError = null;

try {
  findings = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (!Array.isArray(findings)) {
    throw new Error("zizmor JSON output is not an array");
  }
} catch (error) {
  parseError = error instanceof Error ? error.message : String(error);
}

const exitCode = fs.existsSync(exitCodePath)
  ? Number.parseInt(fs.readFileSync(exitCodePath, "utf8").trim(), 10)
  : null;

const hasExitCode = Number.isInteger(exitCode);
const operationalFailure =
  parseError !== null ||
  !hasExitCode ||
  exitCode > 1 ||
  (exitCode !== 0 && findings.length === 0);
const failed = operationalFailure || findings.length > 0;
const gate = failed ? "❌ FAIL" : "✅ PASS";

const severityCounts = new Map();
const confidenceCounts = new Map();
for (const finding of findings) {
  const severity = titleCase(finding?.determinations?.severity);
  const confidence = titleCase(finding?.determinations?.confidence);
  severityCounts.set(severity, (severityCounts.get(severity) ?? 0) + 1);
  confidenceCounts.set(confidence, (confidenceCounts.get(confidence) ?? 0) + 1);
}

const counts = (map) =>
  map.size === 0
    ? "0"
    : [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}: ${value}`)
        .join(" · ");

const lines = [
  "## zizmor · GitHub Actions security",
  "",
  `**Security gate:** ${gate}`,
  "",
  "Policy: findings with **severity ≥ Medium** and **confidence ≥ Medium** are blocking.",
  "",
  "| Metric | Result |",
  "| --- | ---: |",
  `| Blocking findings | ${findings.length} |`,
  `| By severity | ${counts(severityCounts)} |`,
  `| By confidence | ${counts(confidenceCounts)} |`,
];

if (operationalFailure) {
  const statusDetail = hasExitCode ? ` (scanner exit ${exitCode})` : "";
  lines.push(
    "",
    "### Scanner status",
    "",
    `The authoritative zizmor scan could not be completed reliably${statusDetail}${parseError ? `: ${escapeCell(parseError)}` : "."}`,
  );
}

if (findings.length > 0) {
  lines.push(
    "",
    "### Blocking findings",
    "",
    "| Audit | Severity | Confidence | Location | Description |",
    "| --- | --- | --- | --- | --- |",
  );

  for (const finding of findings.slice(0, 20)) {
    const ident = escapeCell(finding.ident ?? "unknown");
    const audit = finding.url ? `[${ident}](${finding.url})` : `\`${ident}\``;
    lines.push(
      `| ${audit} | ${titleCase(finding?.determinations?.severity)} | ${titleCase(finding?.determinations?.confidence)} | \`${escapeCell(primaryLocation(finding))}\` | ${escapeCell(finding.desc ?? "")} |`,
    );
  }

  if (findings.length > 20) {
    lines.push("", `_Showing the first 20 of ${findings.length} blocking findings._`);
  }
} else if (!operationalFailure) {
  lines.push("", "No blocking zizmor findings were detected.");
}

if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID) {
  lines.push(
    "",
    `[Open zizmor workflow run](${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID})`,
  );
}

const summary = `${lines.join("\n")}\n`;
console.log(summary);

fs.mkdirSync(".zizmor", { recursive: true });
fs.writeFileSync(commentPath, `<!-- zizmor-security-report -->\n${summary}`, "utf8");

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
}
