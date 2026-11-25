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

def main():
    scope = {"pullRequest": os.environ["SONAR_PR"]} if os.environ.get("SONAR_PR") else {"branch": os.environ["SONAR_BRANCH"]}
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
