const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { isInternal, planForEvent } = require("./select-accessibility-impact.cjs");

test("only known internal paths are eligible for skip", () => {
  for (const file of [
    "infra/terraform/backend.hcl.example", "infra/terraform/scripts/validate-blob-lease.sh",
    ".github/workflows/azure-oidc-validation.yml", ".github/workflows/terraform-validation.yml",
    ".github/AUTOMATION.md", "docs/adr/0009-example.md", "README.md", ".agents/skills/example/SKILL.md",
  ]) assert.equal(isInternal(file), true, file);
});

test("site, shared inputs, validation tooling and unknown paths require full audit", () => {
  for (const file of [
    "index.html", "offline.html", "en/resume/index.html", "es/case-studies/new/index.html",
    "assets/css/site.css", "assets/js/contrast.js", "assets/data/articles.json",
    "assets/fonts/font.woff2", "sw.js", "site.webmanifest", "newsletter/feed.xml",
    ".pa11yci.cjs", ".github/workflows/accessibility.yml", ".github/workflows/deploy-pages.yml",
    ".github/scripts/test-responsive.cjs", ".github/scripts/check-contrast.mjs",
    ".github/scripts/select-accessibility-impact.cjs", ".github/scripts/test-select-accessibility-impact.cjs",
    "package-lock.json", "new-directory/new-page.html", "docs/example.html",
    "docs/pwa.md", "docs/accessibility-audit.md", "docs/webmcp-services-contract.md",
    "docs/webmcp.en.md", "docs/webmcp.es-419.md", "docs/webmcp.pt-BR.md",
    "docs/contracts/webmcp-services.v1.json",
  ]) assert.equal(isInternal(file), false, file);
});

test("push and manual runs always audit; missing or invalid comparison audits", () => {
  for (const eventName of ["push", "workflow_dispatch", "merge_group", undefined]) {
    assert.equal(planForEvent({ eventName }).run, true);
  }
  assert.equal(planForEvent({ eventName: "pull_request" }).run, true);
  assert.equal(planForEvent({ eventName: "pull_request", base: "--help", head: "a".repeat(40) }).run, true);
});

test("real Git comparison handles internal changes, mixed changes, deletion, rename and failure", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "accessibility-impact-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (file, content) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  const commit = (message) => { git("add", "-A"); git("commit", "-m", message); return git("rev-parse", "HEAD"); };
  git("init");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  write("index.html", "<main>Portfolio</main>");
  write("infra/terraform/main.tf", "# fixture");
  const base = commit("base");
  const run = (from, to) => planForEvent({ eventName: "pull_request", base: from, head: to, root }).run;
  assert.equal(run(base, base), false);

  write("infra/terraform/main.tf", "# internal change");
  write(".github/AUTOMATION.md", "Internal documentation");
  const internal = commit("internal");
  assert.equal(run(base, internal), false);

  write("assets/css/site.css", "body { color: black; }");
  const mixed = commit("mixed");
  assert.equal(run(base, mixed), true);

  fs.rmSync(path.join(root, "assets/css/site.css"));
  const deletion = commit("deletion");
  assert.equal(run(mixed, deletion), true);

  git("mv", "index.html", "infra/terraform/archived.html");
  const rename = commit("rename to internal");
  assert.equal(run(deletion, rename), true);

  git("mv", "infra/terraform/archived.html", "index.html");
  const reverseRename = commit("rename to site");
  assert.equal(run(rename, reverseRename), true);

  assert.equal(run("a".repeat(40), reverseRename), true);
});
