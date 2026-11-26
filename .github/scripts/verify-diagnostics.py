"""Verify required dev diagnostic settings via read-only ARM GETs."""
import argparse
import json
import os
import subprocess
import uuid


def expected(subscription, include_function=False):
    rg = f"/subscriptions/{subscription}/resourceGroups/rg-portfolio-push-workload-dev/providers"
    workspace = f"{rg}/Microsoft.OperationalInsights/workspaces/log-portfolio-push-dev"
    specs = [
        ("cosmos", f"{rg}/Microsoft.DocumentDB/databaseAccounts/cos-portpush-dev-1350159615",
         "send-audit-to-log-analytics", {("categoryGroup", "audit")}, set()),
        ("vault", f"{rg}/Microsoft.KeyVault/vaults/kv-push-dev-1350159615",
         "send-audit-to-log-analytics", {("categoryGroup", "audit")}, {"AllMetrics"}),
        ("queue", f"{rg}/Microsoft.Storage/storageAccounts/stportpushdev1350159615/queueServices/default",
         "send-queue-audit-to-log-analytics",
         {("category", "StorageRead"), ("category", "StorageWrite"), ("category", "StorageDelete")}, {"Transaction"}),
    ]
    if include_function:
        specs.append(("function", f"{rg}/Microsoft.Web/sites/func-portpush-dev-1350159615",
                      "send-runtime-to-log-analytics", {("categoryGroup", "allLogs")}, {"AllMetrics"}))
    return workspace, specs


def enabled(rows, fields):
    if not isinstance(rows, list):
        raise ValueError("invalid rows")
    result = []
    for row in rows:
        if not isinstance(row, dict) or type(row.get("enabled")) is not bool:
            raise ValueError("invalid row")
        if row["enabled"]:
            entries = [(key, row[key]) for key in fields if row.get(key)]
            if len(entries) != 1 or not isinstance(entries[0][1], str):
                raise ValueError("invalid category")
            result.append(entries[0])
    if len(result) != len(set(result)):
        raise ValueError("duplicate category")
    return set(result)


def matches(payload, workspace, name, logs, metrics):
    if not isinstance(payload, dict) or payload.get("name") != name:
        return False
    p = payload.get("properties")
    if not isinstance(p, dict) or not isinstance(p.get("workspaceId"), str):
        return False
    if p["workspaceId"].lower() != workspace.lower():
        return False
    if any(p.get(key) for key in ("storageAccountId", "eventHubAuthorizationRuleId",
                                   "eventHubName", "marketplacePartnerId", "serviceBusRuleId")):
        return False
    return (enabled(p.get("logs", []), ("category", "categoryGroup")) == logs
            and enabled(p.get("metrics", []), ("category",)) == {("category", m) for m in metrics})


def get_setting(target, name):
    url = f"https://management.azure.com{target}/providers/Microsoft.Insights/diagnosticSettings/{name}?api-version=2021-05-01-preview"
    response = subprocess.run(["az", "rest", "--method", "get", "--url", url,
                               "--only-show-errors", "-o", "json"], capture_output=True,
                              text=True, check=True, timeout=60)
    return json.loads(response.stdout)


def verify(subscription, include_function, fetch=get_setting):
    workspace, specs = expected(str(uuid.UUID(subscription)), include_function)
    failures = []
    for label, target, name, logs, metrics in specs:
        try:
            valid = matches(fetch(target, name), workspace, name, logs, metrics)
        except (OSError, ValueError, TypeError, subprocess.SubprocessError):
            valid = False
        if not valid:
            failures.append(label)
    return failures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--include-function", action="store_true")
    args = parser.parse_args()
    try:
        failures = verify(os.environ["ARM_SUBSCRIPTION_ID"], args.include_function)
    except (KeyError, ValueError):
        raise SystemExit("Diagnostic verification configuration invalid; raw details withheld.") from None
    if failures:
        raise SystemExit("Missing or incorrect diagnostics: " + ", ".join(failures) + ". Raw ARM output withheld.")
    print("Required diagnostic settings verified by ARM GET; no keys, State or data-plane access.")


if __name__ == "__main__":
    main()
