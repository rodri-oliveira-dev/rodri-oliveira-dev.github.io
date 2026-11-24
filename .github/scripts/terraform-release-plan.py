"""Emit a value-free Terraform plan manifest and fail closed on destructive actions."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path


def analyze(plan: dict) -> dict:
    changes = []
    for change in plan.get("resource_changes", []):
        actions = change.get("change", {}).get("actions", [])
        if actions == ["no-op"]:
            continue
        changes.append({
            "address": change["address"],
            "type": change["type"],
            "actions": actions,
        })
    changes.sort(key=lambda item: item["address"])
    # Hash the entire plan so a value-only drift cannot pass approval. Only the
    # digest and the value-free action manifest leave the ephemeral runner.
    encoded = json.dumps(plan, separators=(",", ":"), sort_keys=True).encode()
    return {
        "changes": changes,
        "fingerprint": hashlib.sha256(encoded).hexdigest(),
        "destructive": any("delete" in item["actions"] for item in changes),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("plan_json", type=Path)
    parser.add_argument("--allow-destructive", action="store_true")
    args = parser.parse_args()
    result = analyze(json.loads(args.plan_json.read_text(encoding="utf-8")))

    output = Path(os.environ["GITHUB_OUTPUT"])
    with output.open("a", encoding="utf-8") as handle:
        handle.write(f"fingerprint={result['fingerprint']}\n")
        handle.write(f"has_changes={str(bool(result['changes'])).lower()}\n")
        handle.write(f"destructive={str(result['destructive']).lower()}\n")

    summary = Path(os.environ["GITHUB_STEP_SUMMARY"])
    with summary.open("a", encoding="utf-8") as handle:
        handle.write("### Terraform action manifest\n\n")
        handle.write(f"Fingerprint: `{result['fingerprint']}`\n\n")
        if not result["changes"]:
            handle.write("No workload changes.\n")
        else:
            handle.write("| Address | Actions |\n|---|---|\n")
            for item in result["changes"]:
                handle.write(f"| `{item['address']}` | `{','.join(item['actions'])}` |\n")

    if result["destructive"] and not args.allow_destructive:
        raise SystemExit("Terraform delete or replacement requires explicit release approval")


if __name__ == "__main__":
    main()
