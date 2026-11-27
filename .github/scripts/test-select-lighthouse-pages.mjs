import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseNameStatus, planForEvent, selectAffectedPages } = require("./select-lighthouse-pages.cjs");

const pages = [
  { file: "index.html", url: "http://127.0.0.1:8080/" },
  { file: "en/index.html", url: "http://127.0.0.1:8080/en/" },
];
const head = new Map([
  ["index.html", '<link rel="stylesheet" href="assets/global.css"><script src="assets/app.js"></script>'],
  ["en/index.html", '<link rel="stylesheet" href="../assets/global.css"><script src="../assets/app.js"></script>'],
  ["assets/global.css", 'body{background:url("images/background.webp")}'],
  ["assets/app.js", 'fetch("data/content.json")'],
  ["assets/images/background.webp", "binary"],
  ["assets/data/content.json", "{}"],
]);
const reader = (snapshot) => (file) => snapshot.get(file) ?? null;
const select = (changes, base = head) => selectAffectedPages({
  changes,
  pages,
  headReader: reader(head),
  baseReader: reader(base),
});

test("one changed HTML page selects only that page and two runs", () => {
  const result = select([{ status: "M", paths: ["en/index.html"] }]);
  assert.equal(result.mode, "incremental");
  assert.equal(result.runs, 2);
  assert.deepEqual(result.pages.map((page) => page.file), ["en/index.html"]);
});

test("shared CSS and JavaScript select every dependent page", () => {
  for (const file of ["assets/global.css", "assets/app.js"]) {
    const result = select([{ status: "M", paths: [file] }]);
    assert.equal(result.mode, "incremental");
    assert.deepEqual(result.pages, pages);
  }
});

test("documentation-only changes pass without measurements", () => {
  const result = select([{ status: "M", paths: ["README.md"] }]);
  assert.equal(result.mode, "none");
  assert.equal(result.runs, 0);
});

test("an unmapped published resource falls back to a full audit", () => {
  const result = select([{ status: "A", paths: ["assets/new-runtime-input"] }]);
  assert.equal(result.mode, "full");
  assert.deepEqual(result.pages, pages);
});

test("Lighthouse configuration changes force a full audit", () => {
  const result = select([{ status: "M", paths: ["lighthouserc.cjs"] }]);
  assert.equal(result.mode, "full");
  assert.deepEqual(result.pages, pages);
});

test("renamed and deleted dependencies use both old and new paths", () => {
  const renamedHead = new Map(head);
  renamedHead.set("index.html", head.get("index.html").replace("global.css", "site.css"));
  renamedHead.set("en/index.html", head.get("en/index.html").replace("global.css", "site.css"));
  renamedHead.set("assets/site.css", renamedHead.get("assets/global.css"));
  renamedHead.delete("assets/global.css");
  const renamed = selectAffectedPages({
    changes: [{ status: "R100", paths: ["assets/global.css", "assets/site.css"] }],
    pages,
    headReader: reader(renamedHead),
    baseReader: reader(head),
  });
  assert.equal(renamed.mode, "incremental");
  assert.deepEqual(renamed.pages, pages);

  const deleted = select([{ status: "D", paths: ["assets/images/background.webp"] }]);
  assert.equal(deleted.mode, "incremental");
  assert.deepEqual(deleted.pages, pages);
});

test("name-status parser preserves rename and deletion records", () => {
  const parsed = parseNameStatus(Buffer.from("R100\0old.css\0new.css\0D\0gone.js\0"));
  assert.deepEqual(parsed, [
    { status: "R100", paths: ["old.css", "new.css"] },
    { status: "D", paths: ["gone.js"] },
  ]);
});

test("scheduled and manual events run all pages three times", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lighthouse-pages-"));
  try {
    fs.writeFileSync(path.join(root, "index.html"), "<!doctype html>");
    for (const eventName of ["schedule", "workflow_dispatch"]) {
      const result = planForEvent({ eventName, root });
      assert.equal(result.mode, "full");
      assert.equal(result.runs, 3);
      assert.equal(result.pages.length, 1);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a failed Git comparison falls back to a full PR audit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lighthouse-diff-"));
  try {
    fs.writeFileSync(path.join(root, "index.html"), "<!doctype html>");
    const result = planForEvent({ eventName: "pull_request", root, base: "missing-base", head: "missing-head" });
    assert.equal(result.mode, "full");
    assert.equal(result.runs, 2);
    assert.equal(result.pages.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("workflow preserves required behavior and post-failure artifacts", () => {
  const workflow = fs.readFileSync(new URL("../workflows/lighthouse.yml", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.match(workflow, /name: Lighthouse quality/);
  assert.match(workflow, /cron: '0 0 \* \* \*'/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /include-hidden-files: true/);
  assert.match(workflow, /if-no-files-found: ignore/);
  assert.match(workflow, /continue-on-error: true[\s\S]+Assert Lighthouse budgets/);
  assert.match(workflow, /Enforce Lighthouse result/);
});
