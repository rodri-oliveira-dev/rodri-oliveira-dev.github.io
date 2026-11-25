"""Read-only gate for the documented dev runtime identity and four direct assignments."""
import json
import os
import subprocess

RG = "rg-portfolio-push-workload-dev"
SUFFIX = "1350159615"
STORAGE = f"stportpushdev{SUFFIX}"
VAULT = f"kv-push-dev-{SUFFIX}"
COSMOS = f"cos-portpush-dev-{SUFFIX}"
IDENTITY = "id-portfolio-push-runtime-dev"
ROLES = {
    "blob": "b7e6dc6d-f1e8-4753-8033-0f276bb0955b",
    "queue": "974c5e8b-45b9-4653-ba55-5f855dd0fb88",
    "vault": "4633458b-17de-408a-b874-0445c86b69e6",
}
COSMOS_DATA_CONTRIBUTOR = "00000000-0000-0000-0000-000000000002"


def az_json(*args):
    return json.loads(subprocess.check_output(["az", *args, "--only-show-errors", "-o", "json"], text=True))


def has_role(assignments, principal, scope, role):
    return any(
        row.get("principalId", "").lower() == principal.lower()
        and row.get("scope", "").lower() == scope.lower()
        and row.get("roleDefinitionId", "").lower().rsplit("/", 1)[-1] == role
        and not row.get("condition")
        for row in assignments
    )


def main():
    subscription = os.environ["ARM_SUBSCRIPTION_ID"]
    rg_scope = f"/subscriptions/{subscription}/resourceGroups/{RG}"
    storage_scope = f"{rg_scope}/providers/Microsoft.Storage/storageAccounts/{STORAGE}"
    vault_scope = f"{rg_scope}/providers/Microsoft.KeyVault/vaults/{VAULT}"
    cosmos_scope = f"{rg_scope}/providers/Microsoft.DocumentDB/databaseAccounts/{COSMOS}"
    principal = az_json("identity", "show", "-g", RG, "-n", IDENTITY, "--query", "principalId")
    if not principal:
        raise SystemExit("Runtime identity is absent; complete foundation bootstrap first")
    assignments = []
    for scope in (storage_scope, vault_scope):
        assignments.extend(az_json("role", "assignment", "list", "--assignee-object-id", principal, "--scope", scope))
    missing = [
        name for name, scope in (("blob", storage_scope), ("queue", storage_scope), ("vault", vault_scope))
        if not has_role(assignments, principal, scope, ROLES[name])
    ]
    cosmos_assignments = az_json("cosmosdb", "sql", "role", "assignment", "list", "-g", RG, "-a", COSMOS)
    relative = "/dbs/notifications/colls/subscriptions"
    if not any(has_role([row], principal, scope, COSMOS_DATA_CONTRIBUTOR)
               for row in cosmos_assignments for scope in (relative, cosmos_scope + relative)):
        missing.append("cosmos")
    if missing:
        raise SystemExit("Runtime IAM incomplete: " + ", ".join(missing) + ". Complete the separate operator IAM step.")
    print("Four direct runtime assignments verified; no data-plane access or secret values read.")


if __name__ == "__main__":
    main()
