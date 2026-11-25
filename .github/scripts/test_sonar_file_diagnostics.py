import importlib.util
import io
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("sonar_diagnostics", Path(__file__).with_name("sonar-file-diagnostics.py"))
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


class SecurityDiagnosticsTests(unittest.TestCase):
    def test_only_security_metadata_is_returned(self):
        result = {"paging": {"total": 2}, "issues": [
            {"rule": "terraform:S123", "component": diagnostics.PROJECT + ":infra/main.tf",
             "line": 10, "message": "do not publish this", "impacts": [{"softwareQuality": "SECURITY", "severity": "MEDIUM"}]},
            {"rule": "js:S456", "component": diagnostics.PROJECT + ":app.js",
             "impacts": [{"softwareQuality": "MAINTAINABILITY", "severity": "HIGH"}]},
        ]}
        with patch.object(diagnostics, "get", return_value=result) as get:
            rows, truncated = diagnostics.security_findings({"pullRequest": "188"})
        self.assertEqual(rows, [{"rule": "terraform:S123", "file": "infra/main.tf", "line": 10, "severity": "MEDIUM"}])
        self.assertFalse(truncated)
        self.assertEqual(get.call_args.kwargs["pullRequest"], "188")
        self.assertEqual(get.call_args.kwargs["impactSoftwareQualities"], "SECURITY")

    def test_api_failure_does_not_hide_quality_gate(self):
        with patch.object(diagnostics, "security_findings", side_effect=RuntimeError("sensitive response")), patch.dict(
            diagnostics.os.environ, {"GITHUB_STEP_SUMMARY": "unused"}
        ), patch("builtins.open", unittest.mock.mock_open()) as opened, patch("sys.stdout", new_callable=io.StringIO) as stdout:
            diagnostics.report_security({"pullRequest": "188"})
            self.assertIn("unavailable", stdout.getvalue())
            self.assertNotIn("sensitive response", stdout.getvalue())
            opened().write.assert_called()


if __name__ == "__main__":
    unittest.main()
