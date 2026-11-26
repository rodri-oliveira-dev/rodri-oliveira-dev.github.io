"""Credential-free contract checks for candidate diagnostics role definitions."""
import json
from pathlib import Path
import unittest

RBAC = Path(__file__).resolve().parents[2] / "infra" / "terraform" / "rbac"
SCOPE = "/subscriptions/{subscriptionId}/resourceGroups/rg-portfolio-push-workload-dev"
SHARED_KEYS = "Microsoft.OperationalInsights/workspaces/sharedKeys/action"
DIAGNOSTIC_READ = "Microsoft.Insights/diagnosticSettings/read"
DIAGNOSTIC_WRITE = "Microsoft.Insights/diagnosticSettings/write"
FUNCTION_CONFIG = {
    "Microsoft.Web/sites/config/read",
    "Microsoft.Web/sites/config/write",
}
SOURCE = [
    "Microsoft.Insights/diagnosticSettings/read",
    "Microsoft.Insights/diagnosticSettings/write",
    "Microsoft.Insights/diagnosticSettingsCategories/read",
]
LINKER = ["Microsoft.OperationalInsights/workspaces/read", SHARED_KEYS]


def load(name):
    return json.loads((RBAC / name).read_text(encoding="utf-8"))


class DiagnosticsRbacTests(unittest.TestCase):
    def check_definition(self, filename, name, actions):
        role = load(filename)
        self.assertEqual(set(role), {
            "Name", "IsCustom", "Description", "Actions", "NotActions",
            "DataActions", "NotDataActions", "AssignableScopes",
        })
        self.assertEqual(role["Name"], name)
        self.assertIs(role["IsCustom"], True)
        self.assertTrue(isinstance(role["Description"], str) and role["Description"].strip())
        self.assertCountEqual(role["Actions"], actions)
        self.assertEqual(role["AssignableScopes"], [SCOPE])
        for key in ("NotActions", "DataActions", "NotDataActions"):
            self.assertEqual(role[key], [])

    def test_source_operator(self):
        self.check_definition(
            "diagnostics-source-operator.role.template.json",
            "Portfolio Push Diagnostics Source Operator", SOURCE,
        )

    def test_workspace_linker(self):
        self.check_definition(
            "diagnostics-workspace-linker.role.template.json",
            "Portfolio Push Diagnostics Workspace Linker", LINKER,
        )

    def test_provisioner_has_no_shared_keys_or_wildcard(self):
        role = load("provisioner-candidate.json")
        for action in role["actions"]:
            self.assertNotEqual(action.casefold(), SHARED_KEYS.casefold())
            self.assertNotIn("*", action)
        self.assertEqual(role["dataActions"], [])

    def test_effective_provisioner_keeps_read_without_diagnostics_write(self):
        role = load("provisioner-candidate.json")
        self.assertEqual(role["status"], "approved-effective")
        self.assertEqual(role["dataActions"], [])
        self.assertIn(DIAGNOSTIC_READ, role["actions"])
        self.assertNotIn(DIAGNOSTIC_WRITE, role["actions"])
        self.assertTrue(FUNCTION_CONFIG.issubset(role["actions"]))
        self.assertEqual(len(role["actions"]), 42)
        self.assertEqual(len(role["actions"]), len(set(role["actions"])))


if __name__ == "__main__":
    unittest.main()
