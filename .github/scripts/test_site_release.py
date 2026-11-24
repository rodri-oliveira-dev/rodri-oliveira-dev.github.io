import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("site_release", Path(__file__).with_name("site-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def test_semver(self):
        self.assertEqual(release.next_version(["1.9.9", "1.10.2", "v9.0.0"], "patch"), "1.10.3")
        self.assertEqual(release.next_version(["1.10.2"], "minor"), "1.11.0")
        self.assertEqual(release.next_version(["1.10.2"], "major"), "2.0.0")
        self.assertEqual(release.next_version([], "patch"), "0.0.1")
        with self.assertRaises(ValueError):
            release.next_version([], "invalid")

    def test_missing_required_gate_fails_closed(self):
        with patch.object(release, "api", return_value='{"workflow_runs": []}'):
            with self.assertRaisesRegex(RuntimeError, "Missing validation"):
                release.check_runs("owner/repo", "sha")

    def test_non_main_is_rejected(self):
        with patch.dict(release.os.environ, {"GITHUB_REF": "refs/heads/feature"}):
            with self.assertRaisesRegex(RuntimeError, "restricted to main"):
                release.require_main("owner/repo", "sha")

    def test_stale_sha_is_rejected(self):
        with patch.dict(release.os.environ, {"GITHUB_REF": "refs/heads/main"}):
            with patch.object(release, "api", return_value="new-sha"):
                with self.assertRaisesRegex(RuntimeError, "main advanced"):
                    release.require_main("owner/repo", "old-sha")


if __name__ == "__main__":
    unittest.main()
