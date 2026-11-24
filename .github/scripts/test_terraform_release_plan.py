import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "terraform_release_plan", Path(__file__).with_name("terraform-release-plan.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TerraformReleasePlanTests(unittest.TestCase):
    def test_manifest_excludes_values_and_is_deterministic(self):
        plan = {"resource_changes": [{
            "address": "azurerm_key_vault.example",
            "type": "azurerm_key_vault",
            "change": {"actions": ["update"], "before": {"secret": "old"}, "after": {"secret": "new"}},
        }]}
        first = module.analyze(plan)
        second = module.analyze(plan)
        self.assertEqual(first["fingerprint"], second["fingerprint"])
        self.assertNotIn("secret", str(first))
        changed = {"resource_changes": [{
            "address": "azurerm_key_vault.example",
            "type": "azurerm_key_vault",
            "change": {"actions": ["update"], "before": {"secret": "old"}, "after": {"secret": "other"}},
        }]}
        self.assertNotEqual(first["fingerprint"], module.analyze(changed)["fingerprint"])

    def test_noop_is_ignored(self):
        result = module.analyze({"resource_changes": [{
            "address": "x.y", "type": "x", "change": {"actions": ["no-op"]}
        }]})
        self.assertEqual(result["changes"], [])
        self.assertFalse(result["destructive"])

    def test_delete_and_replacement_are_destructive(self):
        for actions in (["delete"], ["delete", "create"], ["create", "delete"]):
            with self.subTest(actions=actions):
                result = module.analyze({"resource_changes": [{
                    "address": "x.y", "type": "x", "change": {"actions": actions}
                }]})
                self.assertTrue(result["destructive"])


if __name__ == "__main__":
    unittest.main()
