const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

// Skip only positively identified internal inputs. Unknown paths are relevant
// by default, including new site directories and accessibility tooling.
const INTERNAL_FILES = new Set([
  "AGENTS.md", "README.md", "README.en.md", "README.es.md", "LICENSE",
  ".github/AUTOMATION.md",
  ".github/workflows/azure-oidc-validation.yml",
  ".github/workflows/terraform-validation.yml",
  ".github/workflows/adr-guard.yml",
  ".github/workflows/actions-security.yml",
]);

function isInternal(file) {
  return INTERNAL_FILES.has(file)
    || file.startsWith("infra/terraform/")
    || file.startsWith(".agents/skills/")
    || file.startsWith(".github/skills/")
    || /^docs\/.*\.md$/.test(file);
}

function planForEvent({ eventName, base, head, root = process.cwd() }) {
  if (eventName !== "pull_request") {
    return { run: true, reason: "Non-PR event requires a complete audit" };
  }
  if (!/^[0-9a-f]{40}$/i.test(base ?? "") || !/^[0-9a-f]{40}$/i.test(head ?? "")) {
    return { run: true, reason: "Comparison context is unavailable" };
  }

  // Three-dot comparison matches the PR diff. Disabling rename detection
  // reports both the old and new paths, including deletions.
  const diff = spawnSync("git", [
    "diff", "--no-ext-diff", "--no-renames", "--name-only", "-z",
    `${base}...${head}`, "--",
  ], { cwd: root, maxBuffer: 8 * 1024 * 1024 });

  if (diff.error || diff.status !== 0 || !Buffer.isBuffer(diff.stdout)) {
    return { run: true, reason: "Git comparison failed; complete audit required" };
  }
  const raw = diff.stdout.toString("utf8");
  if (raw && !raw.endsWith("\0")) {
    return { run: true, reason: "Incomplete file list; complete audit required" };
  }
  const files = raw ? raw.slice(0, -1).split("\0") : [];
  if (files.some((file) => !isInternal(file))) {
    return { run: true, reason: "At least one change may affect accessibility" };
  }
  return { run: false, reason: "Only known internal files changed; no accessibility scan required" };
}

if (require.main === module) {
  const plan = planForEvent({
    eventName: process.env.GITHUB_EVENT_NAME,
    base: process.env.BASE_SHA,
    head: process.env.HEAD_SHA,
  });
  console.log(plan.reason);
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.");
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${plan.run}\nreason=${plan.reason}\n`);
}

module.exports = { isInternal, planForEvent };
