"""Extract only predefined diagnostic tokens from Terraform JSON UI events."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CODES = {
    "AuthorizationFailed", "LinkedAuthorizationFailed", "Forbidden",
    "Unauthorized", "AuthenticationFailed", "InvalidAuthenticationToken",
    "AuthorizationPermissionMismatch", "AuthorizationFailure",
    "RequestDisallowedByPolicy", "InvalidTemplate", "InvalidRequestContent",
    "InvalidParameter", "InvalidResourceLocation", "InvalidResourceName",
    "MissingSubscriptionRegistration", "NoRegisteredProviderFound",
    "SubscriptionNotRegistered", "QuotaExceeded", "OperationNotAllowed",
    "SkuNotAvailable", "InsufficientQuota", "ResourceNotFound",
    "ResourceGroupNotFound", "ParentResourceNotFound", "Conflict",
    "TooManyRequests", "PreflightValidationCheckFailed",
    "InvalidResourceType", "NameAlreadyExists", "StorageAccountAlreadyTaken",
    "VaultAlreadyExists", "BadRequest", "InternalServerError",
    "ServiceUnavailable", "GatewayTimeout", "LeaseAlreadyPresent",
    "LeaseIdMissing", "ResourceAlreadyExists",
}
EXTRA_ACTIONS = {
    "Microsoft.Resources/validateResources/action",
    "Microsoft.Resources/deployments/validate/action",
    "Microsoft.Storage/storageAccounts/listKeys/action",
    "Microsoft.Web/checkNameAvailability/action",
    "Microsoft.Web/sites/config/list/action",
    "Microsoft.Web/sites/publish/action",
    "Microsoft.OperationalInsights/workspaces/sharedKeys/action",
    "Microsoft.OperationalInsights/deletedworkspaces/read",
    "Microsoft.KeyVault/locations/deletedVaults/read",
    "Microsoft.Authorization/roleAssignments/write",
}
ADDRESSES = {
    "azapi_resource.cosmos_account", "azapi_resource.cosmos_database",
    "azapi_resource.subscriptions_container", "azapi_resource.function_app[0]",
    "azapi_resource.function_app", "azapi_resource.log_analytics_workspace",
    "azapi_update_resource.function_publishing_policy",
    'azapi_update_resource.function_publishing_policy["ftp"]',
    'azapi_update_resource.function_publishing_policy["scm"]',
    "azurerm_storage_account.functions", "azurerm_storage_container.function_releases",
    "azurerm_storage_queue.campaigns", "azurerm_storage_queue.campaigns_poison",
    "azurerm_service_plan.functions", "azurerm_user_assigned_identity.functions_runtime",
    "data.azurerm_resource_group.web_push", "azurerm_key_vault.vapid",
    "azurerm_monitor_diagnostic_setting.cosmos_audit",
    "azurerm_monitor_diagnostic_setting.key_vault_audit",
    "azurerm_monitor_diagnostic_setting.function_app",
    "azurerm_monitor_diagnostic_setting.function_app[0]",
    "azurerm_monitor_diagnostic_setting.queue_service",
}
MAX_EVENTS = 20
MAX_LINE = 1_000_000
STATUS = re.compile(
    r"\b(?:status(?:\s*code)?|statuscode|http(?:/\d(?:\.\d)?)?)"
    r"\s*[:=]?\s*[\"']?([45]\d{2})\b", re.I
)
CODE = re.compile(
    r"(?<![\w])(?:error\s*code|code|error)[\"']?\s*[:=]\s*[\"']?([A-Za-z][A-Za-z0-9]+)\b",
    re.I,
)
ACTION = re.compile(
    r"\b(?:perform\s+action|action|operation)\s*[:=]?\s*[\"']"
    r"([A-Za-z0-9./_-]+)[\"']", re.I,
)


def category(codes: set[str], statuses: set[str], message: str) -> str:
    if codes & {"RequestDisallowedByPolicy"}:
        return "policy"
    if codes & {"AuthorizationFailed", "LinkedAuthorizationFailed", "Forbidden",
                "AuthorizationPermissionMismatch", "AuthorizationFailure"} or "403" in statuses:
        return "authorization"
    if codes & {"AuthenticationFailed", "InvalidAuthenticationToken", "Unauthorized"} or "401" in statuses:
        return "authentication"
    if "error acquiring the state lock" in message.lower() or codes & {"LeaseAlreadyPresent", "LeaseIdMissing"}:
        return "state-lock"
    if codes & {"MissingSubscriptionRegistration", "NoRegisteredProviderFound", "SubscriptionNotRegistered"}:
        return "provider-registration"
    if codes & {"QuotaExceeded", "InsufficientQuota", "SkuNotAvailable", "OperationNotAllowed"}:
        return "quota-or-availability"
    if "429" in statuses or "TooManyRequests" in codes:
        return "throttling"
    if "404" in statuses or codes & {"ResourceNotFound", "ResourceGroupNotFound", "ParentResourceNotFound"}:
        return "not-found"
    if "409" in statuses or codes & {"Conflict", "ResourceAlreadyExists", "NameAlreadyExists", "StorageAccountAlreadyTaken", "VaultAlreadyExists"}:
        return "conflict"
    if any(s.startswith("5") for s in statuses):
        return "service-error"
    if "400" in statuses or codes & {"InvalidTemplate", "InvalidParameter", "InvalidRequestContent", "BadRequest", "PreflightValidationCheckFailed", "InvalidResourceType", "InvalidResourceLocation", "InvalidResourceName"}:
        return "validation"
    return "unclassified"


def analyze(lines, actions: set[str]) -> list[dict]:
    action_map = {a.lower(): a for a in actions | EXTRA_ACTIONS}
    code_map = {c.lower(): c for c in CODES}
    results = []
    for line in lines:
        if len(line) > MAX_LINE:
            continue
        try:
            event = json.loads(line)
        except (ValueError, RecursionError):
            continue
        if not isinstance(event, dict) or event.get("type") != "diagnostic":
            continue
        d = event.get("diagnostic")
        if not isinstance(d, dict) or d.get("severity") != "error":
            continue
        message = "\n".join(d[k] for k in ("summary", "detail") if isinstance(d.get(k), str))
        statuses = set(STATUS.findall(message))
        codes = {code_map[c.lower()] for c in CODE.findall(message) if c.lower() in code_map}
        # Also recognize provider diagnostics such as "403 (AuthorizationFailed)".
        for c in re.findall(r"\b[45]\d{2}\s*\(([A-Za-z][A-Za-z0-9]+)\)", message):
            if c.lower() in code_map:
                codes.add(code_map[c.lower()])
        operations = {action_map[a.lower()] for a in ACTION.findall(message) if a.lower() in action_map}
        address = d.get("address")
        item = {
            "category": category(codes, statuses, message),
            "http": sorted(statuses),
            "codes": sorted(codes),
            "actions": sorted(operations),
            "address": address if isinstance(address, str) and address in ADDRESSES else "unknown",
        }
        if item not in results:
            results.append(item)
        if len(results) >= MAX_EVENTS:
            break
    return results


def render(items: list[dict], exit_code: int) -> str:
    lines = ["### Terraform failure diagnostics", "", f"Terraform exit code: {exit_code}."]
    if not items:
        lines.append("No recognized structured error diagnostic; raw output withheld.")
    for item in items:
        lines.append(
            "- Category: " + item["category"] + "; HTTP: " + (", ".join(item["http"]) or "unknown")
            + "; Azure code: " + (", ".join(item["codes"]) or "unknown")
            + "; ARM action: " + (", ".join(item["actions"]) or "unknown")
            + "; Terraform address: " + item["address"]
        )
    lines.append("Classification is best-effort; unknown fields are withheld. No raw diagnostics, plans or State published.")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("log", type=Path)
    parser.add_argument("--exit-code", type=int, required=True, choices=range(1, 256))
    parser.add_argument("--summary", type=Path, required=True)
    args = parser.parse_args()
    matrix = json.loads((ROOT / "infra/terraform/rbac/provisioner-candidate.json").read_text(encoding="utf-8"))
    # Intersect repository-derived operations with a strict ARM token grammar.
    actions = {a for a in matrix["actions"] if re.fullmatch(r"Microsoft\.[A-Za-z]+(?:/[A-Za-z0-9]+)+", a)}
    with args.log.open(encoding="utf-8", errors="replace") as handle:
        result = render(analyze(handle, actions), args.exit_code)
    with args.summary.open("a", encoding="utf-8") as handle:
        handle.write(result)
    print(result, end="")


if __name__ == "__main__":
    main()
