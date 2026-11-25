"""Best-effort diagnostics; the analysis-specific gate remains authoritative."""
import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HOST = "https://sonarcloud.io"
PROJECT = "rodri-oliveira-dev_rodri-oliveira-dev.github.io"

def get(endpoint, **params):
    req = Request(HOST + endpoint + "?" + urlencode(params),
                  headers={"Authorization": "Bearer " + os.environ["SONAR_TOKEN"]})
    with urlopen(req, timeout=15) as response:
        return json.load(response)

def value(measures, key):
    for item in measures:
        if item.get("metric") == key:
            period = item.get("period") or {}
            periods = item.get("periods") or []
            raw = item.get("value", period.get("value", periods[0].get("value", "0") if periods else "0"))
            return int(float(raw or "0"))
    return 0

def clean(text):
    return str(text).replace("|", "&#124;").replace("\n", " ").replace("\r", " ").replace("<", "&lt;").replace(">", "&gt;")

def security_findings(scope):
    """Return only safe metadata for open security findings in the analyzed scope."""
    page_size = 100
    rows = []
    for page in range(1, 11):
        response = get("/api/issues/search", componentKeys=PROJECT, issueStatuses="OPEN",
                       impactSoftwareQualities="SECURITY", ps=page_size, p=page, **scope)
        issues = response["issues"]
        total = response["paging"]["total"]
        for issue in issues:
            impacts = [impact for impact in issue.get("impacts", [])
                       if impact.get("softwareQuality") == "SECURITY"]
            if not impacts:
                continue
            # Do not include source snippets, issue messages, tokens or arbitrary API fields.
            rows.append({
                "rule": issue.get("rule", ""),
                "file": issue.get("component", "").removeprefix(PROJECT + ":"),
                "line": issue.get("line"),
                "severity": ",".join(sorted({i.get("severity", "") for i in impacts})),
            })
        if page * page_size >= total:
            return rows, False
    return rows, True

def report_security(scope):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
        summary.write("\n### Open security findings (latest branch/PR snapshot)\n\n")
        try:
            rows, truncated = security_findings(scope)
        except Exception:
            summary.write("Security findings unavailable via API; consult SonarCloud.\n")
            print("Sonar security findings unavailable via API; consult SonarCloud.")
            return
        if not rows:
            summary.write("No open security findings returned by this query; the analysis-specific gate remains authoritative.\n")
            print("Sonar security findings query returned no matching open issues.")
            return
        summary.write("| Rule | File | Line | Security impact |\n| --- | --- | ---: | --- |\n")
        for row in rows:
            summary.write("| " + " | ".join(clean(row[k]) for k in ("rule", "file", "line", "severity")) + " |\n")
            # JSON escaping and a constant prefix prevent untrusted data from becoming workflow commands.
            print("Sonar security finding: " + json.dumps(row, ensure_ascii=True))
        if truncated:
            summary.write("\nResults truncated after 1000 issues; consult SonarCloud.\n")

def main():
    scope = {"pullRequest": os.environ["SONAR_PR"]} if os.environ.get("SONAR_PR") else {"branch": os.environ["SONAR_BRANCH"]}
    report_security(scope)
    result = get("/api/measures/component_tree", component=PROJECT, qualifiers="FIL",
                 metricKeys="new_duplicated_lines,new_lines_to_cover,new_uncovered_lines", ps=500, **scope)
    rows = []
    for component in result.get("components", []):
        measures = component.get("measures", [])
        duplicated = value(measures, "new_duplicated_lines")
        uncovered = value(measures, "new_uncovered_lines")
        if duplicated or uncovered:
            rows.append((component.get("path", component["key"]), duplicated, uncovered,
                         value(measures, "new_lines_to_cover"), component["key"]))
    rows.sort(key=lambda row: (-row[1], -row[2], row[0]))
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
        summary.write("\n### File-level diagnostics (latest branch/PR snapshot)\n\n")
        summary.write("| File | New duplicated lines | New uncovered lines | New lines to cover |\n| --- | ---: | ---: | ---: |\n")
        for file, duplicated, uncovered, cover, key in rows:
            summary.write(f"| {clean(file)} | {duplicated} | {uncovered} | {cover} |\n")
        if result.get("paging", {}).get("total", 0) > 500:
            summary.write("\nFirst 500 files only; consult SonarCloud for the complete list.\n")
        for file, duplicated, _, _, key in [r for r in rows if r[1]][:5]:
            try:
                data = get("/api/duplications/show", key=key, **scope)
                files = data.get("files", {})
                summary.write(f"\n**Duplication blocks: {clean(file)}** (includes existing code)\n\n")
                for group in data.get("duplications", [])[:10]:
                    blocks = []
                    for block in group.get("blocks", []):
                        ref = files.get(str(block.get("_ref")), {})
                        blocks.append(f"{clean(ref.get('name', ref.get('key', file)))}: {block.get('from')}–{block.get('from', 0) + block.get('size', 0) - 1}")
                    summary.write("- " + "; ".join(blocks) + "\n")
            except Exception:
                summary.write("\nDetailed duplication blocks unavailable; consult SonarCloud.\n")
if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("::notice::Sonar file-level diagnostics unavailable; consult the project dashboard.")
