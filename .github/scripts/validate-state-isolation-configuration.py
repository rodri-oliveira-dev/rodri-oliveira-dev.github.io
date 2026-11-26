"""Fail-closed, sanitized validation for protected State isolation jobs."""
import os
import re
import sys
from pathlib import Path


CHECKS = (
    ("CLIENT_SECRET_PRESENT", "ClientSecretPresent"),
    ("CLIENT_VARIABLE_PRESENT", "ClientVariablePresent"),
    ("CLIENT_ID_MATCH", "ClientIdMatch"),
    ("TENANT_SECRET_PRESENT", "TenantSecretPresent"),
    ("TENANT_VARIABLE_PRESENT", "TenantVariablePresent"),
    ("TENANT_ID_MATCH", "TenantIdMatch"),
    ("SUBSCRIPTION_SECRET_PRESENT", "SubscriptionSecretPresent"),
    ("SUBSCRIPTION_VARIABLE_PRESENT", "SubscriptionVariablePresent"),
    ("SUBSCRIPTION_ID_MATCH", "SubscriptionIdMatch"),
)
EXPECTED = ("EXPECTED_CLIENT", "EXPECTED_TENANT", "EXPECTED_SUBSCRIPTION")
UUID = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def evaluate(environment):
    """Return sanitized boolean results without retaining identifier values."""
    results = [(label, environment.get(name) == "true") for name, label in CHECKS]
    identifiers_valid = all(UUID.fullmatch(environment.get(name, "")) for name in EXPECTED)
    return results, identifiers_valid and all(value for _, value in results)


def main():
    results, valid = evaluate(os.environ)
    lines = [f"{label}: {str(value)}" for label, value in results]
    lines.extend(["", f"ConfigurationValidated: {str(valid)}", ""])
    report = "\n".join(lines)
    try:
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a", encoding="utf-8") as output:
            output.write("### Protected identity configuration\n\n")
            output.write(report)
    except Exception:
        print("Unable to write sanitized configuration report.")
        return 1
    print(report)
    return 0 if valid else 1


if __name__ == "__main__":
    sys.exit(main())
