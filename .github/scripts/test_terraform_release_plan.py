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

    def test_output_only_change_is_not_a_noop(self):
        result = module.analyze({"output_changes": {
            "function_app_health_url": {"actions": ["update"], "before": "old", "after": "new"}
        }})
        self.assertEqual(result["changes"], [])
        self.assertTrue(result["has_changes"])
        self.assertTrue(result["has_output_changes"])

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
                [sys.executable, str(Path(__file__).with_name("terraform-release-plan.py")), str(plan_file),
                 "--workload-mode", "full"],
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

    @staticmethod
    def workload_plan(address="azurerm_storage_account.functions", resource_type="azurerm_storage_account",
                      action="create", mode="managed"):
        return {
            "complete": True,
            "errored": False,
            "applyable": action not in ("no-op", "read"),
            "resource_changes": [{
                "address": address,
                "mode": mode,
                "type": resource_type,
                "change": {"actions": [action]},
            }],
        }

    def test_workload_scope_accepts_reviewed_modes_and_actions(self):
        for action in ("create", "update", "no-op"):
            with self.subTest(action=action):
                module.validate_workload_plan(self.workload_plan(action=action), False, False)
        module.validate_workload_plan(
            self.workload_plan("data.azurerm_resource_group.web_push", "azurerm_resource_group", "read", "data"),
            False,
            False,
        )
        function = self.workload_plan("azapi_resource.function_app[0]", "azapi_resource")
        module.validate_workload_plan(function, True, False)
        with self.assertRaises(ValueError):
            module.validate_workload_plan(function, False, False)

    def test_workload_scope_rejects_unexpected_resources_and_actions(self):
        mutations = (
            lambda p: p.update(complete=False),
            lambda p: p.update(errored=True),
            lambda p: p.update(applyable=False),
            lambda p: p.update(deferred_changes=[{}]),
            lambda p: p.update(action_invocations=[{}]),
            lambda p: p["resource_changes"].append(copy.deepcopy(p["resource_changes"][0])),
            lambda p: p["resource_changes"][0].update(address="azurerm_storage_account.extra"),
            lambda p: p["resource_changes"][0].update(type="azurerm_key_vault"),
            lambda p: p["resource_changes"][0].update(mode="data"),
            lambda p: p["resource_changes"][0].update(previous_address="old"),
            lambda p: p["resource_changes"][0]["change"].update(importing={"id": "secret"}),
            lambda p: p["resource_changes"][0]["change"].update(actions=["read"]),
            lambda p: p["resource_changes"][0]["change"].update(actions=["forget"]),
        )
        for index, mutation in enumerate(mutations):
            with self.subTest(index=index):
                plan = self.workload_plan()
                mutation(plan)
                with self.assertRaises(ValueError):
                    module.validate_workload_plan(plan, False, False)

    def test_workload_scope_gates_destructive_actions(self):
        for actions in (["delete"], ["delete", "create"], ["create", "delete"]):
            with self.subTest(actions=actions):
                plan = self.workload_plan()
                plan["resource_changes"][0]["change"]["actions"] = actions
                with self.assertRaises(ValueError):
                    module.validate_workload_plan(plan, False, False)
                module.validate_workload_plan(plan, False, True)

    def test_workload_scope_validates_output_only_plan(self):
        plan = {
            "complete": True,
            "errored": False,
            "applyable": True,
            "resource_changes": [],
            "output_changes": {"function_app_health_url": {"actions": ["update"]}},
        }
        module.validate_workload_plan(plan, True, False)
        for name, actions in (("private_output", ["update"]), ("function_app_health_url", ["delete"])):
            with self.subTest(name=name, actions=actions), self.assertRaises(ValueError):
                invalid = copy.deepcopy(plan)
                invalid["output_changes"] = {name: {"actions": actions}}
                module.validate_workload_plan(invalid, True, False)

    def test_workload_cli_marks_output_only_plan_as_changed(self):
        with tempfile.TemporaryDirectory() as directory:
            plan_file = Path(directory) / "plan.json"
            output = Path(directory) / "output"
            summary = Path(directory) / "summary"
            plan = {"complete": True, "errored": False, "applyable": True,
                    "resource_changes": [], "output_changes": {
                        "function_app_health_url": {"actions": ["update"]}
                    }}
            plan_file.write_text(json.dumps(plan), encoding="utf-8")
            env = {**os.environ, "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(summary)}
            result = subprocess.run([
                sys.executable, str(Path(__file__).with_name("terraform-release-plan.py")),
                str(plan_file), "--workload-mode", "full",
            ], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            self.assertIn("has_changes=true", output.read_text(encoding="utf-8"))
            rendered = summary.read_text(encoding="utf-8")
            self.assertIn("output changes are present", rendered)
            self.assertNotIn("No workload changes", rendered)


    def diagnostic_plan(self, include_function=False, action="create"):
        addresses = module.FOUNDATION_DIAGNOSTICS | ({module.FUNCTION_DIAGNOSTIC} if include_function else set())
        return {"complete": True, "errored": False, "applyable": action != "no-op",
                "resource_changes": [
                    {"address": address, "mode": "managed", "type": module.DIAGNOSTIC_TYPE,
                     "change": {"actions": [action]}} for address in sorted(addresses)
                ]}

    def test_diagnostic_scope_valid(self):
        for include in (False, True):
            for action in ("create", "update", "no-op"):
                with self.subTest(include=include, action=action):
                    module.validate_diagnostic_plan(self.diagnostic_plan(include, action), include)

    def test_diagnostic_scope_rejects_unsafe_plans(self):
        mutations = (
            lambda p: p.update(complete=False),
            lambda p: p.update(errored=True),
            lambda p: p.update(applyable=False),
            lambda p: p.update(deferred_changes=[{}]),
            lambda p: p.update(action_invocations=[{}]),
            lambda p: p["resource_changes"].pop(),
            lambda p: p["resource_changes"].append(copy.deepcopy(p["resource_changes"][0])),
            lambda p: p["resource_changes"][0].update(address="PRIVATE_CANARY"),
            lambda p: p["resource_changes"][0].update(mode="data"),
            lambda p: p["resource_changes"][0].update(type="azurerm_key_vault"),
            lambda p: p["resource_changes"][0].update(previous_address="old"),
            lambda p: p["resource_changes"][0]["change"].update(importing={"id": "secret"}),
            lambda p: p["resource_changes"][0]["change"].update(actions=["delete"]),
            lambda p: p["resource_changes"][0]["change"].update(actions=["create", "delete"]),
            lambda p: p["resource_changes"][0]["change"].update(actions=["forget"]),
        )
        for mutation in mutations:
            plan = self.diagnostic_plan()
            mutation(plan)
            with self.assertRaises(ValueError):
                module.validate_diagnostic_plan(plan, False)
        with self.assertRaises(ValueError):
            module.validate_diagnostic_plan(self.diagnostic_plan(True), False)
        with self.assertRaises(ValueError):
            module.validate_diagnostic_plan(self.diagnostic_plan(False), True)

    def test_diagnostic_cli_blocks_destruction_and_unexpected_addresses(self):
        with tempfile.TemporaryDirectory() as directory:
            plan_file = Path(directory) / "plan.json"
            output = Path(directory) / "output"
            summary = Path(directory) / "summary"
            env = {**os.environ, "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(summary)}
            plan = self.diagnostic_plan()
            plan["resource_changes"][0]["address"] = "PRIVATE_CANARY"
            plan_file.write_text(json.dumps(plan), encoding="utf-8")
            cmd = [sys.executable, str(Path(__file__).with_name("terraform-release-plan.py")),
                   str(plan_file), "--scope", "diagnostics"]
            result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())
            self.assertFalse(summary.exists())
            self.assertNotIn("PRIVATE_CANARY", result.stdout + result.stderr)
            plan_file.write_text(json.dumps(self.diagnostic_plan()), encoding="utf-8")
            result = subprocess.run(cmd + ["--allow-destructive"], env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
