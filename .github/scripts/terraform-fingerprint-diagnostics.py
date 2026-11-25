"""Compare two ephemeral Terraform plans without disclosing their contents.

This is a diagnostic, not an approval fingerprint or equivalence validator.
"""
from __future__ import annotations

import argparse
import json
import runpy
from pathlib import Path

analyze = runpy.run_path(str(Path(__file__).with_name("terraform-release-plan.py")))["analyze"]

SECTIONS = (
    "format_version", "terraform_version", "applyable", "complete", "errored",
    "variables", "planned_values", "proposed_unknown", "resource_changes",
    "resource_drift", "relevant_attributes", "output_changes", "prior_state",
    "configuration", "checks", "deferred_changes", "action_invocations",
)
CHANGE_FIELDS = (
    "actions", "before", "after", "after_unknown", "before_sensitive",
    "after_sensitive", "replace_paths", "importing", "generated_config",
)
MISSING = object()


def encoded(value):
    return json.dumps(value, separators=(",", ":"), sort_keys=True, allow_nan=False)


def unordered(value):
    # Deliberately ignore all array ordering only to classify a possible cause.
    # This must never be used to approve a plan: some arrays are ordered.
    if isinstance(value, dict):
        return {key: unordered(item) for key, item in value.items()}
    if isinstance(value, list):
        return sorted((unordered(item) for item in value), key=encoded)
    return value


def classify(left, right):
    if left is MISSING or right is MISSING:
        return "absent in both" if left is right else "presence differs"
    if encoded(left) == encoded(right):
        return "identical"
    if encoded(unordered(left)) == encoded(unordered(right)):
        return "array order differs (candidate only)"
    return "content differs"


def validate(plan):
    if not isinstance(plan, dict):
        raise ValueError("invalid plan")
    version = plan.get("format_version")
    if not isinstance(version, str) or version.split(".")[0] != "1":
        raise ValueError("unsupported plan format")
    if not isinstance(plan.get("terraform_version"), str):
        raise ValueError("missing Terraform version")
    if plan.get("errored") is not False or not isinstance(plan.get("planned_values"), dict):
        raise ValueError("not a successful plan")
    if not isinstance(plan.get("configuration"), dict):
        raise ValueError("missing configuration")
    changes = plan.get("resource_changes", [])
    if not isinstance(changes, list):
        raise ValueError("invalid changes")
    seen = set()
    for record in changes:
        if not isinstance(record, dict):
            raise ValueError("invalid change")
        address = record.get("address")
        deposed = record.get("deposed")
        change = record.get("change")
        if not isinstance(address, str) or not isinstance(record.get("type"), str):
            raise ValueError("invalid address")
        if deposed is not None and not isinstance(deposed, str):
            raise ValueError("invalid deposed key")
        if not isinstance(change, dict) or not isinstance(change.get("actions"), list):
            raise ValueError("invalid actions")
        if not change["actions"] or not all(isinstance(item, str) for item in change["actions"]):
            raise ValueError("invalid action")
        identity = (address, deposed)
        if identity in seen:
            raise ValueError("duplicate change identity")
        seen.add(identity)


def change_projection(plan, field):
    # Align by identity internally; never render addresses or deposed keys.
    result = []
    for record in plan.get("resource_changes", []):
        change = record["change"]
        item = {"identity": [record["address"], record.get("deposed")]}
        if field in change:
            item["value"] = change[field]
        result.append(item)
    return sorted(result, key=lambda item: encoded(item["identity"]))


def diagnose(left, right):
    validate(left)
    validate(right)
    first, second = analyze(left), analyze(right)
    sections = {
        field: classify(left.get(field, MISSING), right.get(field, MISSING))
        for field in SECTIONS
    }
    excluded = set(SECTIONS) | {"timestamp"}
    sections["other top-level fields (aggregate)"] = classify(
        {key: value for key, value in left.items() if key not in excluded},
        {key: value for key, value in right.items() if key not in excluded},
    )
    fields = {
        field: classify(change_projection(left, field), change_projection(right, field))
        for field in CHANGE_FIELDS
    }
    # The action list inside a change remains ordered. Only the manifest
    # records are sorted for this diagnostic comparison.
    return {
        "fingerprints_equal": first["fingerprint"] == second["fingerprint"],
        "manifests_equal": sorted(map(encoded, first["changes"])) == sorted(map(encoded, second["changes"])),
        "sections": sections,
        "change_fields": fields,
    }


def render(result):
    lines = [
        "### Terraform fingerprint diagnosis (plan only)",
        "",
        "Existing release fingerprints equal: **" + ("yes" if result["fingerprints_equal"] else "no") + "**",
        "Action manifests equal: **" + ("yes" if result["manifests_equal"] else "no") + "**",
        "",
        "Array-order candidates are diagnostic only; they do not establish semantic equivalence.",
        "No values, addresses, arbitrary field names or section hashes are published.",
        "",
        "| Plan section | Comparison |",
        "|---|---|",
    ]
    lines.extend(f"| {field} | {result['sections'][field]} |" for field in (*SECTIONS, "other top-level fields (aggregate)"))
    lines.extend(["", "| Resource change field (aligned by identity) | Comparison |", "|---|---|"])
    lines.extend(f"| {field} | {result['change_fields'][field]} |" for field in CHANGE_FIELDS)
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("first", type=Path)
    parser.add_argument("second", type=Path)
    parser.add_argument("--summary", type=Path, required=True)
    args = parser.parse_args()
    try:
        first = json.loads(args.first.read_text(encoding="utf-8"))
        second = json.loads(args.second.read_text(encoding="utf-8"))
        report = render(diagnose(first, second))
        with args.summary.open("a", encoding="utf-8") as output:
            output.write(report)
    except Exception:
        # JSON errors and validation failures can contain sensitive material.
        raise SystemExit("Safe fingerprint diagnosis failed; raw output withheld.") from None


if __name__ == "__main__":
    main()
