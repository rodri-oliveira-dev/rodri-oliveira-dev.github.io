import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
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

    def test_top_level_timestamp_does_not_change_fingerprint(self):
        plan = {
            "timestamp": "2026-11-24T12:00:00Z",
            "resource_changes": [{
                "address": "x.y", "type": "x", "change": {"actions": ["create"], "after": {"value": 1}}
            }],
        }
        later = {**plan, "timestamp": "2026-11-24T12:00:01Z"}

        self.assertEqual(module.analyze(plan)["fingerprint"], module.analyze(later)["fingerprint"])

    @staticmethod
    def relevant_plan():
        return {
            "relevant_attributes": [
                {"resource": "data.example.source", "attribute": ["objects", 0, "name"]},
                {"resource": "data.example.source", "attribute": ["objects", 1, "name"]},
                {"resource": "data.example.other", "attribute": ["id"]},
            ],
            "resource_changes": [{
                "address": "example.target", "type": "example",
                "change": {"actions": ["create"], "after": {"ordered": [1, 2]}},
            }],
        }

    def test_outer_relevant_attributes_order_is_normalized(self):
        first = self.relevant_plan()
        second = copy.deepcopy(first)
        second["relevant_attributes"].reverse()
        original = copy.deepcopy(second)
        self.assertEqual(module.analyze(first), module.analyze(second))
        self.assertEqual(second, original)

    def test_attribute_paths_remain_ordered(self):
        first = self.relevant_plan()
        second = copy.deepcopy(first)
        second["relevant_attributes"][0]["attribute"].reverse()
        self.assertNotEqual(module.analyze(first)["fingerprint"], module.analyze(second)["fingerprint"])

    def test_relevant_content_and_multiplicity_remain_hashed(self):
        first = self.relevant_plan()
        expected = module.analyze(first)["fingerprint"]
        mutations = (
            lambda p: p["relevant_attributes"].pop(),
            lambda p: p["relevant_attributes"].append(copy.deepcopy(p["relevant_attributes"][0])),
            lambda p: p["relevant_attributes"][0].update(resource="data.example.changed"),
            lambda p: p["relevant_attributes"][0]["attribute"].__setitem__(1, 1),
            lambda p: p["relevant_attributes"][0]["attribute"].__setitem__(1, "0"),
            lambda p: p["relevant_attributes"][0].update(extra={"ordered": [1, 2]}),
            lambda p: p.pop("relevant_attributes"),
        )
        for index, mutation in enumerate(mutations):
            with self.subTest(index=index):
                second = copy.deepcopy(first)
                mutation(second)
                self.assertNotEqual(expected, module.analyze(second)["fingerprint"])

    def test_other_arrays_and_fields_remain_hashed(self):
        first = self.relevant_plan()
        first["unknown_field"] = {"ordered": ["a", "b"]}
        expected = module.analyze(first)["fingerprint"]
        mutations = (
            lambda p: p["resource_changes"][0]["change"]["after"]["ordered"].reverse(),
            lambda p: p["resource_changes"][0]["change"].update(after_unknown={"ordered": True}),
            lambda p: p["resource_changes"][0]["change"].update(after_sensitive={"ordered": True}),
            lambda p: p["resource_changes"][0]["change"].update(actions=["delete", "create"]),
            lambda p: p["unknown_field"]["ordered"].reverse(),
        )
        for index, mutation in enumerate(mutations):
            with self.subTest(index=index):
                second = copy.deepcopy(first)
                second["relevant_attributes"].reverse()
                mutation(second)
                self.assertNotEqual(expected, module.analyze(second)["fingerprint"])

    def test_absent_and_empty_relevant_attributes_are_distinct(self):
        self.assertNotEqual(
            module.analyze({})["fingerprint"],
            module.analyze({"relevant_attributes": []})["fingerprint"],
        )

    def test_invalid_relevant_attributes_fail_closed(self):
        for value in (None, {}, "SECRET_VALUE", [None], [{"resource": "x"}],
                      [{"resource": "", "attribute": []}],
                      [{"resource": "x", "attribute": "SECRET_VALUE"}]):
            with self.subTest(value_type=type(value)), self.assertRaises(ValueError):
                module.analyze({"relevant_attributes": value})

    def test_invalid_plan_cli_does_not_emit_fingerprint_or_raw_values(self):
        with tempfile.TemporaryDirectory() as directory:
            plan_file = Path(directory) / "plan.json"
            output = Path(directory) / "output"
            summary = Path(directory) / "summary"
            plan_file.write_text(json.dumps({"relevant_attributes": "SECRET_VALUE"}), encoding="utf-8")
            env = {**os.environ, "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(summary)}
            result = subprocess.run(
                [sys.executable, str(Path(__file__).with_name("terraform-release-plan.py")), str(plan_file)],
                env=env, capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())
            self.assertFalse(summary.exists())
            self.assertNotIn("SECRET_VALUE", result.stdout + result.stderr)

    def test_delete_and_replacement_are_destructive(self):
        for actions in (["delete"], ["delete", "create"], ["create", "delete"]):
            with self.subTest(actions=actions):
                result = module.analyze({"resource_changes": [{
                    "address": "x.y", "type": "x", "change": {"actions": actions}
                }]})
                self.assertTrue(result["destructive"])


if __name__ == "__main__":
    unittest.main()
