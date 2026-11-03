"""Regression tests for fail-closed newsletter quality-gate polling."""

import importlib.util
import io
import urllib.error
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("wait-newsletter-checks.py")
SPEC = importlib.util.spec_from_file_location("wait_newsletter_checks", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
monitor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(monitor)


def check(name, status="completed", conclusion="success", run_id=1, app="github-actions"):
    return {
        "id": run_id, "name": name, "status": status,
        "conclusion": conclusion, "app": {"slug": app},
    }


def all_successful():
    return {"check_runs": [check(name, run_id=i) for i, name in enumerate(monitor.REQUIRED_CHECKS, 1)]}


class NewsletterQualityGateTests(unittest.TestCase):
    def test_passes_only_when_all_expected_checks_succeed(self):
        result, summary = monitor.evaluate_checks(all_successful())
        self.assertEqual(result, "success")
        self.assertIn("Lighthouse quality: success", summary)

    def test_missing_check_is_pending_not_success(self):
        payload = all_successful()
        payload["check_runs"].pop()
        state, summary = monitor.evaluate_checks(payload)
        self.assertEqual(state, "pending")
        self.assertIn("zizmor security audit: missing", summary)

    def test_in_progress_lighthouse_is_pending(self):
        payload = all_successful()
        payload["check_runs"][3]["status"] = "in_progress"
        payload["check_runs"][3]["conclusion"] = None
        self.assertEqual(monitor.evaluate_checks(payload)[0], "pending")

    def test_failed_required_check_blocks_merge(self):
        payload = all_successful()
        payload["check_runs"][0]["conclusion"] = "failure"
        self.assertEqual(monitor.evaluate_checks(payload)[0], "failure")

    def test_skipped_required_check_is_not_accepted(self):
        payload = all_successful()
        payload["check_runs"][0]["conclusion"] = "skipped"
        self.assertEqual(monitor.evaluate_checks(payload)[0], "failure")

    def test_skipped_third_party_check_does_not_block_required_gates(self):
        payload = all_successful()
        payload["check_runs"].append(check("CodeRabbit", conclusion="skipped", run_id=20, app="coderabbitai"))
        self.assertEqual(monitor.evaluate_checks(payload)[0], "success")

    def test_newer_successful_rerun_overrides_older_failure(self):
        payload = all_successful()
        payload["check_runs"].append(check("Site validation", conclusion="failure", run_id=0))
        self.assertEqual(monitor.evaluate_checks(payload)[0], "success")

    @patch.object(monitor.time, "sleep")
    @patch.object(monitor.urllib.request, "urlopen")
    def test_temporary_http_503_is_retried(self, urlopen, sleep):
        error = urllib.error.HTTPError(
            "https://api.github.com/test", 503, "Service Unavailable", None, None
        )
        urlopen.side_effect = [error, io.BytesIO(b'{"check_runs": []}')]

        result = monitor.api_get("test", "token")

        self.assertEqual(result, {"check_runs": []})
        self.assertEqual(urlopen.call_count, 2)
        sleep.assert_called_once_with(monitor.POLL_SECONDS)

    @patch.object(monitor.time, "sleep")
    @patch.object(monitor.urllib.request, "urlopen")
    def test_authentication_error_is_not_retried(self, urlopen, sleep):
        urlopen.side_effect = urllib.error.HTTPError(
            "https://api.github.com/test", 401, "Unauthorized", None, None
        )
        with self.assertRaises(urllib.error.HTTPError):
            monitor.api_get("test", "token")
        sleep.assert_not_called()

    def test_non_github_action_cannot_impersonate_required_check(self):
        payload = all_successful()
        payload["check_runs"][0]["app"]["slug"] = "other"
        self.assertEqual(monitor.evaluate_checks(payload)[0], "pending")


if __name__ == "__main__":
    unittest.main()
