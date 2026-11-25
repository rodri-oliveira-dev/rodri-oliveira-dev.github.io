import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("terraform-fingerprint-diagnostics.py")
spec = importlib.util.spec_from_file_location("fingerprint_diagnostics", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def plan():
    return {
        "format_version": "1.2",
        "terraform_version": "1.17.2",
        "errored": False,
        "configuration": {},
        "planned_values": {"root_module": {"resources": []}},
        "timestamp": "2026-11-25T19:12:00Z",
        "resource_changes": [
            {
                "address": "example.resource[SECRET_ADDRESS]",
                "type": "example",
                "change": {"actions": ["create"], "after": {"list": ["SECRET_VALUE", "other"]}},
            },
            {
                "address": "example.second",
                "type": "example",
                "change": {"actions": ["create"], "after_unknown": {"id": True}},
            },
        ],
    }


class FingerprintDiagnosticsTests(unittest.TestCase):
    def test_timestamp_only(self):
        first = plan()
        second = copy.deepcopy(first)
        second["timestamp"] = "2026-11-25T19:13:00Z"
        result = module.diagnose(first, second)
        self.assertTrue(result["fingerprints_equal"])
        self.assertTrue(result["manifests_equal"])

    def test_independent_resource_order(self):
        first = plan()
        second = copy.deepcopy(first)
        second["resource_changes"].reverse()
        result = module.diagnose(first, second)
        self.assertFalse(result["fingerprints_equal"])
        self.assertTrue(result["manifests_equal"])
        self.assertEqual(result["sections"]["resource_changes"], "array order differs (candidate only)")
        self.assertEqual(result["change_fields"]["after"], "identical")

    def test_nested_order_is_not_approval(self):
        first = plan()
        second = copy.deepcopy(first)
        second["resource_changes"][0]["change"]["after"]["list"].reverse()
        result = module.diagnose(first, second)
        self.assertFalse(result["fingerprints_equal"])
        self.assertEqual(result["change_fields"]["after"], "array order differs (candidate only)")

    def test_value_only_drift_and_no_leak(self):
        first = plan()
        second = copy.deepcopy(first)
        second["resource_changes"][0]["change"]["after"]["list"][0] = "SECRET_NEW"
        second["SECRET_UNKNOWN_FIELD"] = {"SECRET_KEY": "SECRET_NEW"}
        result = module.diagnose(first, second)
        self.assertFalse(result["fingerprints_equal"])
        self.assertTrue(result["manifests_equal"])
        self.assertEqual(result["change_fields"]["after"], "content differs")
        self.assertEqual(result["sections"]["other top-level fields (aggregate)"], "content differs")
        self.assertNotIn("SECRET", module.render(result))
        self.assertNotIn("SECRET", str(result))

    def test_action_order_preserved(self):
        first = plan()
        second = copy.deepcopy(first)
        first["resource_changes"][0]["change"]["actions"] = ["delete", "create"]
        second["resource_changes"][0]["change"]["actions"] = ["create", "delete"]
        result = module.diagnose(first, second)
        self.assertFalse(result["fingerprints_equal"])
        self.assertFalse(result["manifests_equal"])

    def test_missing_null_type_and_multiplicity(self):
        self.assertEqual(module.classify(module.MISSING, None), "presence differs")
        self.assertEqual(module.classify(True, 1), "content differs")
        self.assertEqual(module.classify([1, 1, 2], [1, 2, 2]), "content differs")

    def test_unknown_and_sensitive_masks(self):
        first = plan()
        second = copy.deepcopy(first)
        second["resource_changes"][1]["change"]["after_unknown"]["id"] = False
        second["resource_changes"][0]["change"]["after_sensitive"] = {"list": True}
        result = module.diagnose(first, second)
        self.assertFalse(result["fingerprints_equal"])
        self.assertEqual(result["change_fields"]["after_unknown"], "content differs")
        self.assertEqual(result["change_fields"]["after_sensitive"], "content differs")

    def test_invalid_and_duplicate_plan_rejected(self):
        for invalid in ({}, {"format_version": "2.0"}, []):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                module.diagnose(invalid, plan())
        duplicate = plan()
        duplicate["resource_changes"].append(duplicate["resource_changes"][0])
        with self.assertRaises(ValueError):
            module.diagnose(duplicate, plan())

    def test_cli_summary_and_safe_error(self):
        with tempfile.TemporaryDirectory() as directory:
            first, second, summary = (Path(directory) / name for name in ("first.json", "second.json", "summary.md"))
            first.write_text(json.dumps(plan()), encoding="utf-8")
            second.write_text(json.dumps(plan()), encoding="utf-8")
            command = [sys.executable, str(SCRIPT), str(first), str(second), "--summary", str(summary)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            self.assertNotIn("SECRET", summary.read_text(encoding="utf-8"))
            second.write_text("{SECRET_INVALID", encoding="utf-8")
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("SECRET", result.stdout + result.stderr)
            self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
