const fs = require("node:fs");
const { inspect } = require("node:util");

// Run independent scenarios to completion, keeping dependent actions fail-fast.
function createResults(suite) {
  const results = [];
  async function run(label, check) {
    const previousCount = results.length;
    try {
      await check();
      // A grouping scenario containing individual checks is not another pass.
      if (results.length === previousCount) results.push({ label, status: "PASS" });
    } catch (error) {
      const details = inspect(error, { depth: 5, maxArrayLength: null, maxStringLength: 4000, colors: false });
      results.push({ label, status: "FAIL", details });
      console.error("FAIL " + label + "\n" + details);
    }
  }
  function finish() {
    const failed = results.filter(result => result.status === "FAIL");
    const passed = results.length - failed.length;
    const summary = "## " + suite + "\n\n" + passed + " passed / " + failed.length + " failed / " + results.length + " executed\n\n";
    const escape = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body = failed.map(result => "<details><summary>" + escape(result.label) + "</summary>\n\n<pre>" + escape(result.details) + "</pre>\n\n</details>\n\n").join("");
    console.log(suite + ": " + passed + " passed, " + failed.length + " failed");
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + body);
    if (failed.length || !results.length) process.exitCode = 1;
  }
  return { run, finish };
}
module.exports = { createResults };
