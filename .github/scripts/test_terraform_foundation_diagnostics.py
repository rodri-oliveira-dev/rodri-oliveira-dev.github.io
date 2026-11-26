"""Credential-free regression tests for the foundation report."""
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("terraform-foundation-diagnostics.py")
render = runpy.run_path(str(SCRIPT))["render"]
ACCOUNT = "azapi_resource.cosmos_account"
CONTAINER = "azapi_resource.subscriptions_container"


def change(address, before, after, actions=None, mask=None):
    return {"address": address, "type": "azapi_resource",
            "change": {"actions": actions or ["update"], "before": before,
                       "after": after, "after_unknown": mask or {}}}


def plan(changes=(), drift=()):
    return {"format_version": "1.2", "terraform_version": "1.17.2",
            "errored": False, "complete": True, "planned_values": {},
            "configuration": {}, "resource_changes": list(changes),
            "resource_drift": list(drift)}


class FoundationReportTests(unittest.TestCase):
    def test_known_paths_and_separate_drift(self):
        before = {"body": {"properties": {"disableLocalAuth": False}}}
        after = {"body": {"properties": {"disableLocalAuth": True}}}
        text = render(plan([change(ACCOUNT, before, after)],
                           [change(CONTAINER, {"body": {"properties": {"resource": {"defaultTtl": 1}}}},
                                   {"body": {"properties": {"resource": {"defaultTtl": -1}}}})]))
        self.assertIn("body.properties.disableLocalAuth", text)
        self.assertIn("body.properties.resource.defaultTtl", text)
        self.assertLess(text.index("Planned actions"), text.index("Refresh drift"))
        self.assertNotIn("False", text)

    def test_unknown_and_no_difference(self):
        body = {"body": {"properties": {"disableLocalAuth": True}}}
        text = render(plan([change(ACCOUNT, body, body, mask={"body": True}),
                            change(CONTAINER, {}, {})]))
        self.assertIn("contains unknown", text)
        self.assertIn("no difference detected", text)

    def test_string_body_and_order(self):
        first = {"body": json.dumps({"properties": {"locations": [1, 2]}})}
        second = {"body": json.dumps({"properties": {"locations": [2, 1]}})}
        self.assertIn("body.properties.locations", render(plan([change(ACCOUNT, first, second)])))

    def test_noop_and_creates(self):
        text = render(plan([change(ACCOUNT, {}, {}, ["no-op"]),
                            change("azurerm_monitor_diagnostic_setting.cosmos_audit", None, {}, ["create"])]))
        self.assertNotIn(ACCOUNT, text)
        self.assertIn("cosmos_audit` | `create", text)

    def test_canary_never_published(self):
        canary = "PRIVATE_CANARY"
        before = {"body": {"properties": {canary: canary}}, canary: canary}
        after = {"body": {"properties": {canary: "other"}}, canary: "other"}
        data = plan([change(ACCOUNT, before, after), change(canary, None, {}, ["create"])])
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "plan.json"
            summary = Path(directory) / "summary.md"
            source.write_text(json.dumps(data), encoding="utf-8")
            result = subprocess.run([sys.executable, str(SCRIPT), str(source),
                                     "--summary", str(summary)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            text = summary.read_text(encoding="utf-8")
            self.assertEqual(text, result.stdout)
            self.assertNotIn(canary, text + result.stderr)
            self.assertIn("unrecognized address", text)
            self.assertIn("other attributes (aggregate)", text)

    def test_invalid_and_incomplete(self):
        for data in (plan([change(ACCOUNT, {}, {}, ["PRIVATE_CANARY"])]),
                     dict(plan(), complete=False), dict(plan(), errored=True)):
            with self.assertRaises(ValueError):
                render(data)


if __name__ == "__main__":
    unittest.main()
