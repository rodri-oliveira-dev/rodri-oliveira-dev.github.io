"""Credential-free tests for protected State isolation configuration."""
import importlib.util
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("validate-state-isolation-configuration.py")
spec = importlib.util.spec_from_file_location("configuration", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
UUID = "00000000-0000-0000-0000-000000000000"


def valid_environment():
    environment = {name: "true" for name, _ in m.CHECKS}
    environment.update({name: UUID for name in m.EXPECTED})
    return environment


class ConfigurationTests(unittest.TestCase):
    def test_all_checks_and_identifiers_are_required(self):
        environment = valid_environment()
        results, valid = m.evaluate(environment)
        self.assertTrue(valid)
        self.assertTrue(all(value for _, value in results))

        for name in [name for name, _ in m.CHECKS] + list(m.EXPECTED):
            with self.subTest(name=name):
                candidate = environment.copy()
                candidate.pop(name)
                self.assertFalse(m.evaluate(candidate)[1])

    def test_only_exact_true_and_strict_uuid_are_accepted(self):
        for name, _ in m.CHECKS:
            candidate = valid_environment()
            candidate[name] = "True"
            self.assertFalse(m.evaluate(candidate)[1])
        for value in ("", "not-a-uuid", "0" * 36, UUID + "0"):
            candidate = valid_environment()
            candidate["EXPECTED_CLIENT"] = value
            self.assertFalse(m.evaluate(candidate)[1])

    def test_report_contains_only_sanitized_booleans(self):
        environment = valid_environment()
        with tempfile.TemporaryDirectory() as temp:
            report = Path(temp) / "summary"
            environment["GITHUB_STEP_SUMMARY"] = str(report)
            with patch.dict(os.environ, environment, clear=True), \
                    patch("sys.stdout", new_callable=io.StringIO) as stdout:
                self.assertEqual(m.main(), 0)
            emitted = report.read_text(encoding="utf-8") + stdout.getvalue()
        self.assertIn("ConfigurationValidated: True", emitted)
        self.assertNotIn(UUID, emitted)

    def test_workflow_defers_environment_comparisons_to_protected_steps(self):
        workflow = Path(__file__).parents[1] / "workflows" / "terraform-state-isolation.yml"
        text = workflow.read_text(encoding="utf-8")
        self.assertNotIn("EXPECTED_CONFIGURATION_MATCH", text)
        self.assertNotIn("SOURCE_CLIENT", text)
        self.assertEqual(text.count("CLIENT_SECRET_PRESENT: ${{ secrets."), 2)
        self.assertEqual(text.count("CLIENT_VARIABLE_PRESENT: ${{ vars."), 2)
        self.assertEqual(text.count("CLIENT_ID_MATCH: ${{ secrets."), 2)
        self.assertEqual(text.count("TENANT_ID_MATCH: ${{ secrets."), 2)
        self.assertEqual(text.count("SUBSCRIPTION_ID_MATCH: ${{ secrets."), 2)
        self.assertEqual(text.count("validate-state-isolation-configuration.py"), 2)


if __name__ == "__main__":
    unittest.main()
