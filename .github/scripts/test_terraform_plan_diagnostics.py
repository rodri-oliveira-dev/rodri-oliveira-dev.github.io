"""Regression tests for the public Terraform failure summary."""
import importlib.util
import json
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
