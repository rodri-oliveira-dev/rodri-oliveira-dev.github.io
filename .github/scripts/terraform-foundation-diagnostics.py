"""Report foundation plan actions and known Cosmos paths without exposing values."""
from __future__ import annotations

import argparse
import json
import runpy
from pathlib import Path

HERE = Path(__file__).resolve().parent
ADDRESSES = runpy.run_path(str(HERE / "terraform-plan-diagnostics.py"))["ADDRESSES"]
validate = runpy.run_path(str(HERE / "terraform-fingerprint-diagnostics.py"))["validate"]

COSMOS = {
    "azapi_resource.cosmos_account",
    "azapi_resource.subscriptions_container",
}
ACTIONS = {
    ("no-op",), ("read",), ("create",), ("update",), ("delete",),
    ("create", "delete"), ("delete", "create"),
}
# Only these static paths may appear in the report. Arrays are compared as
# ordered values; arbitrary map keys, indices and provider values are withheld.
TOP = (
    "body", "output", "tags", "location", "name", "parent_id", "id", "type",
    "identity", "locks", "response_export_values", "ignore_missing_property",
    "ignore_null_property", "schema_validation_enabled",
)
ACCOUNT = (
    "kind", "properties", "properties.backupPolicy",
    "properties.backupPolicy.type",
    "properties.backupPolicy.periodicModeProperties",
    "properties.backupPolicy.periodicModeProperties.backupIntervalInMinutes",
    "properties.backupPolicy.periodicModeProperties.backupRetentionIntervalInHours",
    "properties.backupPolicy.periodicModeProperties.backupStorageRedundancy",
    "properties.capabilities", "properties.consistencyPolicy",
    "properties.consistencyPolicy.defaultConsistencyLevel",
    "properties.databaseAccountOfferType",
    "properties.disableKeyBasedMetadataWriteAccess",
    "properties.disableLocalAuth", "properties.enableAnalyticalStorage",
    "properties.enableAutomaticFailover", "properties.enableFreeTier",
    "properties.enableMultipleWriteLocations", "properties.ipRules",
    "properties.isVirtualNetworkFilterEnabled", "properties.locations",
    "properties.minimalTlsVersion", "properties.networkAclBypass",
    "properties.networkAclBypassResourceIds", "properties.publicNetworkAccess",
    "properties.virtualNetworkRules",
)
CONTAINER = (
    "properties", "properties.options", "properties.resource",
    "properties.resource.defaultTtl", "properties.resource.id",
    "properties.resource.indexingPolicy",
    "properties.resource.indexingPolicy.automatic",
    "properties.resource.indexingPolicy.indexingMode",
    "properties.resource.indexingPolicy.includedPaths",
    "properties.resource.indexingPolicy.excludedPaths",
    "properties.resource.partitionKey",
    "properties.resource.partitionKey.kind",
    "properties.resource.partitionKey.paths",
    "properties.resource.partitionKey.version",
)
MISSING = object()


def lookup(obj, path):
    for key in path:
        if not isinstance(obj, dict):
            return MISSING
        obj = obj.get(key, MISSING)
    return obj


def encoded(value):
    if value is MISSING:
        return None
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def unknown(value):
    if value is True:
        return True
    if isinstance(value, dict):
        return any(unknown(v) for v in value.values())
    if isinstance(value, list):
        return any(unknown(v) for v in value)
    return False


def unknown_at(mask, path):
    for key in path:
        if mask is True:
            return True
        if not isinstance(mask, dict):
            return False
        mask = mask.get(key, False)
    return unknown(mask)


def body_object(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return MISSING
    return value


def differences(address, change):
    before, after = change.get("before"), change.get("after")
    if not isinstance(before, dict) or not isinstance(after, dict):
        return [("resource (aggregate)", "not comparable")]
    mask = change.get("after_unknown", {})
    result = []
    for key in TOP:
        if unknown_at(mask, (key,)):
            result.append((key, "contains unknown"))
        elif encoded(lookup(before, (key,))) != encoded(lookup(after, (key,))):
            result.append((key, "differs"))
    left = body_object(before.get("body", MISSING))
    right = body_object(after.get("body", MISSING))
    paths = ACCOUNT if address.endswith(".cosmos_account") else CONTAINER
    if isinstance(left, dict) and isinstance(right, dict):
        for path in paths:
            parts = tuple(path.split("."))
            if unknown_at(mask, ("body", *parts)):
                result.append(("body." + path, "contains unknown"))
            elif encoded(lookup(left, parts)) != encoded(lookup(right, parts)):
                result.append(("body." + path, "differs"))
    elif encoded(left) != encoded(right):
        result.append(("body (aggregate)", "not comparable"))
    # Catch unclassified top-level attributes without rendering their names.
    other = lambda obj: {k: v for k, v in obj.items() if k not in TOP}
    if unknown(other(mask) if isinstance(mask, dict) else mask):
        result.append(("other attributes (aggregate)", "contains unknown"))
    elif encoded(other(before)) != encoded(other(after)):
        result.append(("other attributes (aggregate)", "differs"))
    return result or [("known paths", "no difference detected")]


def rows(plan, section):
    records = plan.get(section, [])
    if not isinstance(records, list):
        raise ValueError("invalid records")
    result = []
    seen = set()
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("invalid record")
        address = record.get("address")
        change = record.get("change")
        if not isinstance(address, str) or not isinstance(change, dict):
            raise ValueError("invalid change")
        actions = change.get("actions")
        if not isinstance(actions, list) or not all(isinstance(a, str) for a in actions):
            raise ValueError("invalid actions")
        if tuple(actions) not in ACTIONS:
            raise ValueError("unsupported actions")
        identity = (address, record.get("deposed"))
        if identity in seen:
            raise ValueError("duplicate record")
        seen.add(identity)
        if actions == ["no-op"]:
            continue
        safe = address if address in ADDRESSES else "unrecognized address"
        result.append((safe, ",".join(actions), differences(address, change)
                       if address in COSMOS and actions == ["update"] else []))
    return sorted(result)


def render(plan):
    validate(plan)
    if plan.get("complete") is False or plan.get("deferred_changes"):
        raise ValueError("incomplete plan")
    lines = ["### Terraform foundation diagnostic (plan only)", "",
             "Not an approval manifest. No values, arbitrary paths, plans or State published.", ""]
    for section, title in (("resource_changes", "Planned actions"),
                           ("resource_drift", "Refresh drift")):
        entries = rows(plan, section)
        lines.extend([f"#### {title}", "", "| Address | Actions |", "|---|---|"])
        if not entries:
            lines.append("| None | — |")
        lines.extend(f"| `{address}` | `{actions}` |" for address, actions, _ in entries)
        lines.append("")
        for address, _, paths in entries:
            if paths:
                lines.extend([f"**{address}**", "", "| Known path | Observation |", "|---|---|"])
                lines.extend(f"| `{path}` | {status} |" for path, status in paths)
                lines.append("")
    lines.append("Differences may reflect normalization, ordering or unknown values; no Apply is authorized.")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("plan_json", type=Path)
    parser.add_argument("--summary", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = render(json.loads(args.plan_json.read_text(encoding="utf-8")))
        with args.summary.open("a", encoding="utf-8") as handle:
            handle.write(report)
        print(report, end="")
    except Exception:
        raise SystemExit("Safe foundation plan report failed; raw output withheld.") from None


if __name__ == "__main__":
    main()
