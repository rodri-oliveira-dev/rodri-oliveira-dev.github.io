"""Emit a value-free Terraform plan manifest and fail closed on destructive actions."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path


def canonical_relevant_attributes(value: object) -> list:
    """Normalize only the outer unordered collection; keep complete records.

    Terraform v1.17.2 jsonplan.marshalRelevantAttrs explicitly states that
    record order is immaterial. Attribute paths themselves are ordered.
    """
    if not isinstance(value, list):
        raise ValueError("Invalid relevant_attributes collection")
    for record in value:
        if (
            not isinstance(record, dict)
            or not isinstance(record.get("resource"), str)
            or not record["resource"]
            or not isinstance(record.get("attribute"), list)
        ):
            raise ValueError("Invalid relevant_attributes record")
    return sorted(
        value,
        key=lambda record: json.dumps(
            record, separators=(",", ":"), sort_keys=True, allow_nan=False
        ),
    )


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
    stable_plan = {key: value for key, value in plan.items() if key != "timestamp"}
    if "relevant_attributes" in stable_plan:
        stable_plan["relevant_attributes"] = canonical_relevant_attributes(
            stable_plan["relevant_attributes"]
        )
    encoded = json.dumps(stable_plan, separators=(",", ":"), sort_keys=True).encode()
    return {
        "changes": changes,
        "fingerprint": hashlib.sha256(encoded).hexdigest(),
        "destructive": any("delete" in item["actions"] for item in changes),
    }


DIAGNOSTIC_TYPE = "azurerm_monitor_diagnostic_setting"
FOUNDATION_DIAGNOSTICS = {
    f"{DIAGNOSTIC_TYPE}.cosmos_audit",
    f"{DIAGNOSTIC_TYPE}.key_vault_audit",
    f"{DIAGNOSTIC_TYPE}.queue_service",
}
FUNCTION_DIAGNOSTIC = f"{DIAGNOSTIC_TYPE}.function_app[0]"


def validate_diagnostic_plan(plan: dict, include_function: bool) -> None:
    """Fail closed before emitting any address or fingerprint for an invalid plan."""
    if plan.get("complete") is not True or plan.get("errored") is not False:
        raise ValueError("Incomplete diagnostic plan")
    allowed = FOUNDATION_DIAGNOSTICS | ({FUNCTION_DIAGNOSTIC} if include_function else set())
    changes = plan.get("resource_changes", [])
    if not isinstance(changes, list):
        raise ValueError("Invalid diagnostic changes")
    seen = set()
    for resource in changes:
        address = resource["address"]
        change = resource["change"]
        if (
            address not in allowed or address in seen
            or resource["type"] != DIAGNOSTIC_TYPE
            or resource.get("mode") != "managed"
            or resource.get("previous_address") is not None
            or change.get("importing") is not None
            or change.get("actions") not in (["no-op"], ["create"], ["update"])
        ):
            raise ValueError("Unexpected diagnostic resource or action")
        seen.add(address)
        if change["actions"] != ["no-op"] and plan.get("applyable") is not True:
            raise ValueError("Diagnostic plan is not applyable")
    if seen != allowed:
        raise ValueError("Missing required diagnostic addresses")
    if plan.get("deferred_changes") or plan.get("action_invocations"):
        raise ValueError("Unexpected deferred changes or invocations")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("plan_json", type=Path)
    parser.add_argument("--allow-destructive", action="store_true")
    parser.add_argument("--scope", choices=("workload", "diagnostics"), default="workload")
    parser.add_argument("--include-function", action="store_true")
    args = parser.parse_args()
    try:
        plan = json.loads(args.plan_json.read_text(encoding="utf-8"))
        if args.scope == "diagnostics":
            if args.allow_destructive:
                raise ValueError("Diagnostic destruction is never allowed")
            validate_diagnostic_plan(plan, args.include_function)
        elif args.include_function:
            raise ValueError("Diagnostic scope is required")
        result = analyze(plan)
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        raise SystemExit("Invalid Terraform plan; raw output withheld.") from None

    # A legacy setting requires explicit reconciliation, never deletion by release.
    if args.scope == "workload" and any(item["type"] == DIAGNOSTIC_TYPE for item in result["changes"]):
        raise SystemExit("Diagnostic setting change in workload plan; reconcile separate State before release.")

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
            handle.write(f"No {args.scope} changes.\n")
        else:
            handle.write("| Address | Actions |\n|---|---|\n")
            for item in result["changes"]:
                handle.write(f"| `{item['address']}` | `{','.join(item['actions'])}` |\n")

    if result["destructive"] and not args.allow_destructive:
        raise SystemExit("Terraform delete or replacement requires explicit release approval")


if __name__ == "__main__":
    main()
