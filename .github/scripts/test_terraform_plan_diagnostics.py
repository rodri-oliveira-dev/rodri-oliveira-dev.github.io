"""Regression tests for the public Terraform failure summary."""
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "diagnostics", Path(__file__).with_name("terraform-plan-diagnostics.py")
)
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


def event(detail, address="azapi_resource.cosmos_account", **extra):
    return json.dumps({"type": "diagnostic", "diagnostic": {
        "severity": "error", "summary": "Provider returned an error",
        "detail": detail, "address": address, **extra,
    }})


class DiagnosticsTests(unittest.TestCase):
    def test_authorization(self):
        action = "Microsoft.DocumentDB/databaseAccounts/read"
        items = diagnostics.analyze([event(
            "unexpected status 403 (403 Forbidden) with error: AuthorizationFailed: "
            "does not have authorization to perform action '" + action + "'"
        )], {action})
        self.assertEqual(items, [{
            "category": "authorization", "http": ["403"],
            "codes": ["AuthorizationFailed"], "actions": [action],
            "address": "azapi_resource.cosmos_account",
        }])

    def test_json_azure_code(self):
        items = diagnostics.analyze([event('HTTP 400 {"error":{"code":"RequestDisallowedByPolicy"}}')], set())
        self.assertEqual(items[0]["category"], "policy")
        self.assertEqual(items[0]["codes"], ["RequestDisallowedByPolicy"])

    def test_unknown_tokens_and_secrets_are_never_emitted(self):
        text = "CANARY_PRIVATE_SECRET /subscriptions/SECRET-ID https://private.example/?sig=SECRET"
        rows = [event(text + " Code: UnknownSecretCode action 'Microsoft.Secret/secret/read'",
                      'azapi_resource.function_app["SECRET"]', snippet={"code": text}),
                "unstructured " + text,
                json.dumps({"type": "log", "message": text})]
        output = diagnostics.render(diagnostics.analyze(rows, set()), 1)
        for forbidden in ["CANARY", "SECRET", "private.example", "UnknownSecretCode", "Microsoft.Secret", "snippet"]:
            self.assertNotIn(forbidden, output)
        self.assertIn("unclassified", output)
        self.assertIn("Terraform address: unknown", output)

    def test_apply_json_ui_diagnostic(self):
        address = "azurerm_monitor_diagnostic_setting.cosmos_audit"
        rows = [
            json.dumps({"type": "apply_start", "hook": {"resource": {"addr": address}}}),
            json.dumps({"type": "apply_errored", "hook": {"resource": {"addr": address}}}),
            event('unexpected status 400 (Bad Request) with error: BadRequest: '
                  'Category AllMetrics is not supported. CANARY_PRIVATE_SECRET',
                  address, snippet={"code": "CANARY_PRIVATE_SECRET"}),
        ]
        output = diagnostics.render(diagnostics.analyze(rows, set()), 1)
        self.assertIn("Category: validation", output)
        self.assertIn("HTTP: 400", output)
        self.assertIn("Azure code: BadRequest", output)
        self.assertIn("Terraform address: " + address, output)
        self.assertNotIn("CANARY_PRIVATE_SECRET", output)
        self.assertNotIn("AllMetrics", output)

    def test_apply_cli_summary_and_stdout_are_sanitized(self):
        address = "azurerm_monitor_diagnostic_setting.queue_service"
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / "apply.log"
            summary = Path(directory) / "summary.md"
            log.write_text("\n".join([
                json.dumps({"type": "apply_start", "hook": {"id_value": "CANARY_SECRET"}}),
                event("HTTP 403 Code: AuthorizationFailed action "
                      "'Microsoft.Insights/diagnosticSettings/write' CANARY_SECRET",
                      address, snippet={"code": "CANARY_SECRET"}),
                "unstructured CANARY_SECRET",
            ]), encoding="utf-8")
            result = subprocess.run([
                sys.executable, str(Path(__file__).with_name("terraform-plan-diagnostics.py")),
                str(log), "--exit-code", "7", "--summary", str(summary),
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            output = summary.read_text(encoding="utf-8")
            self.assertIn("Terraform exit code: 7.", output)
            self.assertIn("Microsoft.Insights/diagnosticSettings/write", output)
            self.assertIn("Terraform address: " + address, output)
            self.assertNotIn("CANARY_SECRET", output + result.stdout + result.stderr)
            self.assertEqual(output, result.stdout)

    def test_state_lock(self):
        items = diagnostics.analyze([event("Error acquiring the state lock")], set())
        self.assertEqual(items[0]["category"], "state-lock")

    def test_extra_action_not_in_role(self):
        items = diagnostics.analyze([event(
            "StatusCode=403 Code=AuthorizationFailed action 'Microsoft.Storage/storageAccounts/listKeys/action'"
        )], set())
        self.assertEqual(items[0]["actions"], ["Microsoft.Storage/storageAccounts/listKeys/action"])

    def test_warning_and_invalid_input_are_ignored(self):
        rows = [event("HTTP 403", severity="warning"), "not JSON", "[]", "{}"]
        self.assertEqual(diagnostics.analyze(rows, set()), [])
        self.assertIn("raw output withheld", diagnostics.render([], 1))

    def test_deduplication_and_limit(self):
        row = event("HTTP 403")
        self.assertEqual(len(diagnostics.analyze([row] * 50, set())), 1)
        rows = [event(f"HTTP {n}") for n in range(400, 450)]
        self.assertEqual(len(diagnostics.analyze(rows, set())), diagnostics.MAX_EVENTS)

    def test_oversized_line_is_ignored(self):
        self.assertEqual(diagnostics.analyze(["x" * (diagnostics.MAX_LINE + 1)], set()), [])

    def test_case_insensitive_canonical_output(self):
        items = diagnostics.analyze([event("status code: 403 code: authorizationfailed action 'microsoft.web/sites/read'")],
                                    {"Microsoft.Web/sites/read"})
        self.assertEqual(items[0]["codes"], ["AuthorizationFailed"])
        self.assertEqual(items[0]["actions"], ["Microsoft.Web/sites/read"])


if __name__ == "__main__":
    unittest.main()
