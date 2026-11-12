const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { discoverLighthousePages } = require("./lighthouse-pages.cjs");

const FORCE_FULL = new Set([
  ".github/workflows/lighthouse.yml",
  ".github/scripts/lighthouse-pages.cjs",
  ".github/scripts/select-lighthouse-pages.cjs",
  ".github/scripts/summarize-lighthouse.mjs",
  ".github/scripts/test-select-lighthouse-pages.mjs",
  "lighthouserc.cjs",
]);

const normalize = (file) => file.replaceAll("\\", "/").replace(/^\.\//, "");

function resolveReference(reference, fromFile) {
  const clean = reference.trim().replace(/[?#].*$/, "");
  if (!clean || /^(?:[a-z]+:|#|\/\/)/i.test(clean)) return null;
  const decoded = decodeURIComponent(clean);
  const resolved = decoded.startsWith("/")
    ? decoded.slice(1)
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), decoded));
  return normalize(resolved.endsWith("/") ? `${resolved}index.html` : resolved);
}

function extractReferences(content, file) {
  const references = new Set();
  const add = (value) => {
    try {
      const resolved = resolveReference(value, file);
      if (resolved && !resolved.startsWith("../")) references.add(resolved);
    } catch {
      // An invalid URL in a changed site resource is handled conservatively later.
    }
  };

  if (file.endsWith(".html")) {
    for (const match of content.matchAll(/<(?!a\b)[^>]+\b(?:src|href)=["']([^"']+)["']/gi)) add(match[1]);
    for (const match of content.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
      for (const candidate of match[1].split(",")) add(candidate.trim().split(/\s+/)[0]);
    }
  }
  if (/\.(?:css|html)$/i.test(file)) {
    for (const match of content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(match[1]);
    for (const match of content.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)) add(match[1]);
  }
  if (/\.(?:[cm]?js|html)$/i.test(file)) {
    for (const match of content.matchAll(/(?:import|export)\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g)) add(match[1]);
    for (const match of content.matchAll(/\b(?:fetch|new\s+Worker)\(\s*["']([^"']+)["']/g)) add(match[1]);
  }
  return references;
}

function workingTreeReader(root) {
  return (file) => {
    try { return fs.readFileSync(path.join(root, file), "utf8"); } catch { return null; }
  };
}

function gitReader(root, revision) {
  return (file) => {
    if (!revision) return null;
    const result = spawnSync("git", ["show", `${revision}:${file}`], { cwd: root, encoding: "utf8" });
    return result.status === 0 ? result.stdout : null;
  };
}

function dependencyMap(pages, readFile) {
  const result = new Map();
  for (const page of pages) {
    const seen = new Set();
    const pending = [page.file];
    while (pending.length > 0) {
      const file = pending.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      const content = readFile(file);
      if (content === null) continue;
      for (const reference of extractReferences(content, file)) {
        if (!seen.has(reference)) pending.push(reference);
      }
    }
    result.set(page.file, seen);
  }
  return result;
}

function isPotentialSiteInput(file) {
  return /^(?:assets|case-studies|curriculo|en|es|pt-br|servicos)(?:\/|$)/.test(file)
    || ["index.html", "favicon.svg", "site.webmanifest", "robots.txt", "sitemap.xml", ".nojekyll", "CNAME"].includes(file);
}

function fullResult(pages, reason, runs = 2) {
  return { mode: "full", reason, runs, pages };
}

function selectAffectedPages({ changes, root = process.cwd(), baseRevision = null, pages = discoverLighthousePages(root), headReader, baseReader }) {
  const normalizedChanges = changes.map((change) => ({
    status: change.status,
    paths: change.paths.map(normalize),
  }));
  if (normalizedChanges.some((change) => change.paths.some((file) => FORCE_FULL.has(file)))) {
    return fullResult(pages, "Lighthouse configuration or tooling changed");
  }

  const readHead = headReader ?? workingTreeReader(root);
  const readBase = baseReader ?? gitReader(root, baseRevision);
  const headDependencies = dependencyMap(pages, readHead);
  const baseDependencies = dependencyMap(pages, readBase);
  const selected = new Set();
  let uncertain = false;

  for (const change of normalizedChanges) {
    for (const changedFile of change.paths) {
      let matched = false;
      for (const page of pages) {
        if (headDependencies.get(page.file)?.has(changedFile) || baseDependencies.get(page.file)?.has(changedFile)) {
          selected.add(page.file);
          matched = true;
        }
      }
      if (!matched && isPotentialSiteInput(changedFile)) uncertain = true;
    }
  }

  if (uncertain) return fullResult(pages, "Site impact could not be mapped safely");
  const affected = pages.filter((page) => selected.has(page.file));
  return affected.length > 0
    ? { mode: "incremental", reason: "Mapped changed files to dependent pages", runs: 2, pages: affected }
    : { mode: "none", reason: "No published page is affected", runs: 0, pages: [] };
}

function parseNameStatus(buffer) {
  const fields = buffer.toString("utf8").split("\0").filter(Boolean);
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const count = /^[RC]/.test(status) ? 2 : 1;
    changes.push({ status, paths: fields.slice(index, index + count) });
    index += count;
  }
  return changes;
}

function planForEvent({ eventName, root = process.cwd(), base, head }) {
  const pages = discoverLighthousePages(root);
  if (["schedule", "workflow_dispatch"].includes(eventName)) {
    return fullResult(pages, `${eventName} requires a complete audit`, 3);
  }
  if (eventName !== "pull_request" || !base || !head) {
    return fullResult(pages, "Comparison context is unavailable");
  }
  const diff = spawnSync("git", ["diff", "--name-status", "-z", "--find-renames", `${base}...${head}`], { cwd: root });
  if (diff.status !== 0) return fullResult(pages, "Git comparison failed; failing open");
  return selectAffectedPages({ changes: parseNameStatus(diff.stdout), root, baseRevision: base, pages });
}

function writeOutput(plan, outputFile) {
  const values = {
    run: String(plan.mode !== "none"),
    mode: plan.mode,
    reason: plan.reason,
    runs: String(plan.runs),
    urls: JSON.stringify(plan.pages.map((page) => page.url)),
    page_files: JSON.stringify(plan.pages.map((page) => page.file)),
  };
  const body = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
  fs.appendFileSync(outputFile, body, "utf8");
}

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []));
  const plan = planForEvent({ eventName: args.event, base: args.base, head: args.head });
  console.log(`${plan.mode}: ${plan.reason} (${plan.pages.length} page(s), ${plan.runs} run(s) each)`);
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.");
  writeOutput(plan, process.env.GITHUB_OUTPUT);
}

module.exports = { dependencyMap, extractReferences, parseNameStatus, planForEvent, selectAffectedPages };
