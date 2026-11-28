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
    output_changes = plan.get("output_changes", {})
    if not isinstance(output_changes, dict):
        raise ValueError("Invalid output changes")
    has_output_changes = any(
        change.get("actions") != ["no-op"] for change in output_changes.values()
    )
    return {
        "changes": changes,
        "fingerprint": hashlib.sha256(encoded).hexdigest(),
        "destructive": any("delete" in item["actions"] for item in changes),
        "has_changes": bool(changes) or has_output_changes,
        "has_output_changes": has_output_changes,
    }


DIAGNOSTIC_TYPE = "azurerm_monitor_diagnostic_setting"
FOUNDATION_DIAGNOSTICS = {
    f"{DIAGNOSTIC_TYPE}.cosmos_audit",
    f"{DIAGNOSTIC_TYPE}.key_vault_audit",
    f"{DIAGNOSTIC_TYPE}.queue_service",
}
FUNCTION_DIAGNOSTIC = f"{DIAGNOSTIC_TYPE}.function_app[0]"
FOUNDATION_WORKLOAD = {
    "azapi_resource.cosmos_account": "azapi_resource",
    "azapi_resource.cosmos_database": "azapi_resource",
    "azapi_resource.log_analytics_workspace": "azapi_resource",
    "azapi_resource.subscriptions_container": "azapi_resource",
    "azurerm_key_vault.vapid": "azurerm_key_vault",
    "azurerm_service_plan.functions": "azurerm_service_plan",
    "azurerm_storage_account.functions": "azurerm_storage_account",
    "azurerm_storage_container.function_releases": "azurerm_storage_container",
    "azurerm_storage_queue.campaigns": "azurerm_storage_queue",
    "azurerm_storage_queue.campaigns_poison": "azurerm_storage_queue",
    "azurerm_user_assigned_identity.functions_runtime": "azurerm_user_assigned_identity",
    "data.azurerm_resource_group.web_push": "azurerm_resource_group",
}
FUNCTION_WORKLOAD = {
    "azapi_resource.function_app[0]": "azapi_resource",
    'azapi_update_resource.function_publishing_policy["ftp"]': "azapi_update_resource",
    'azapi_update_resource.function_publishing_policy["scm"]': "azapi_update_resource",
    "azapi_update_resource.function_tls_config[0]": "azapi_update_resource",
}
WORKLOAD_OUTPUTS = {
    "cosmos_account_endpoint",
    "cosmos_subscriptions_container_id",
    "function_app_health_url",
    "function_app_name",
    "function_campaign_queue_id",
    "function_storage_account_id",
    "functions_runtime_identity_id",
    "key_vault_uri",
    "log_analytics_workspace_id",
    "resource_group_id",
    "resource_group_location",
}
SAFE_MANAGED_ACTIONS = {("no-op",), ("create",), ("update",)}
DESTRUCTIVE_MANAGED_ACTIONS = {("delete",), ("delete", "create"), ("create", "delete")}


def validate_workload_plan(plan: dict, create_function_app: bool, allow_destructive: bool) -> None:
    """Limit a protected workload apply to the reviewed root and execution mode."""
    if plan.get("complete") is not True or plan.get("errored") is not False:
        raise ValueError("Incomplete workload plan")
    allowed = FOUNDATION_WORKLOAD | (FUNCTION_WORKLOAD if create_function_app else {})
    changes = plan.get("resource_changes", [])
    if not isinstance(changes, list):
        raise ValueError("Invalid workload changes")
    seen = set()
    has_resource_changes = False
    for resource in changes:
        address = resource["address"]
        change = resource["change"]
        actions = tuple(change.get("actions", []))
        mode = resource.get("mode")
        allowed_actions = {("no-op",), ("read",)} if mode == "data" else SAFE_MANAGED_ACTIONS.copy()
        if allow_destructive and mode == "managed":
            allowed_actions |= DESTRUCTIVE_MANAGED_ACTIONS
        if (
            address not in allowed or address in seen
            or resource["type"] != allowed[address]
            or mode not in ("managed", "data")
            or (mode == "data") != address.startswith("data.")
            or resource.get("previous_address") is not None
            or change.get("importing") is not None
            or actions not in allowed_actions
        ):
            raise ValueError("Unexpected workload resource or action")
        seen.add(address)
        has_resource_changes |= actions not in (("no-op",), ("read",))

    output_changes = plan.get("output_changes", {})
    if not isinstance(output_changes, dict):
        raise ValueError("Invalid workload output changes")
    has_output_changes = False
    for name, change in output_changes.items():
        actions = tuple(change.get("actions", []))
        if name not in WORKLOAD_OUTPUTS or actions not in SAFE_MANAGED_ACTIONS:
            raise ValueError("Unexpected workload output or action")
        has_output_changes |= actions != ("no-op",)

    if (has_resource_changes or has_output_changes) and plan.get("applyable") is not True:
        raise ValueError("Workload plan is not applyable")
    if plan.get("deferred_changes") or plan.get("action_invocations"):
        raise ValueError("Unexpected deferred changes or invocations")


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
    parser.add_argument("--workload-mode", choices=("foundation", "full"))
    args = parser.parse_args()
    try:
        plan = json.loads(args.plan_json.read_text(encoding="utf-8"))
        if args.scope == "diagnostics":
            if args.allow_destructive or args.workload_mode:
                raise ValueError("Diagnostic destruction is never allowed")
            validate_diagnostic_plan(plan, args.include_function)
        else:
            if args.include_function or not args.workload_mode:
                raise ValueError("Valid workload mode is required")
            validate_workload_plan(
                plan,
                create_function_app=args.workload_mode == "full",
                allow_destructive=args.allow_destructive,
            )
        result = analyze(plan)
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        raise SystemExit("Invalid Terraform plan; raw output withheld.") from None

    # A legacy setting requires explicit reconciliation, never deletion by release.
    if args.scope == "workload" and any(item["type"] == DIAGNOSTIC_TYPE for item in result["changes"]):
        raise SystemExit("Diagnostic setting change in workload plan; reconcile separate State before release.")

    output = Path(os.environ["GITHUB_OUTPUT"])
    with output.open("a", encoding="utf-8") as handle:
        handle.write(f"fingerprint={result['fingerprint']}\n")
        handle.write(f"has_changes={str(result['has_changes']).lower()}\n")
        handle.write(f"destructive={str(result['destructive']).lower()}\n")

    summary = Path(os.environ["GITHUB_STEP_SUMMARY"])
    with summary.open("a", encoding="utf-8") as handle:
        handle.write("### Terraform action manifest\n\n")
        handle.write(f"Fingerprint: `{result['fingerprint']}`\n\n")
        if not result["has_changes"]:
            handle.write(f"No {args.scope} changes.\n")
        elif not result["changes"]:
            handle.write(f"{args.scope.title()} output changes are present; names and values withheld.\n")
        else:
            handle.write("| Address | Actions |\n|---|---|\n")
            for item in result["changes"]:
                handle.write(f"| `{item['address']}` | `{','.join(item['actions'])}` |\n")
            if result["has_output_changes"]:
                handle.write("\nOutput changes are also present; names and values withheld.\n")

    if result["destructive"] and not args.allow_destructive:
        raise SystemExit("Terraform delete or replacement requires explicit release approval")


if __name__ == "__main__":
    main()
