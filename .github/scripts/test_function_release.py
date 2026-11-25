import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("function_release", Path(__file__).with_name("function-release.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FunctionReleaseTests(unittest.TestCase):
    SHA = "a" * 40

    def test_round_trip_and_revision(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            package, manifest = root / "app.zip", root / "manifest.json"
            package.write_bytes(b"immutable")
            module.create(package, manifest, self.SHA, "42")
            self.assertEqual(module.verify(package, manifest, self.SHA), self.SHA)

    def test_tampering_and_stale_revision_fail(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            package, manifest = root / "app.zip", root / "manifest.json"
            package.write_bytes(b"immutable")
            module.create(package, manifest, self.SHA, "42")
            with self.assertRaisesRegex(ValueError, "selected release"):
                module.verify(package, manifest, "b" * 40)
            package.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "checksum"):
                module.verify(package, manifest, self.SHA)

    def test_rollback_must_be_a_distinct_ancestor(self):
        with self.assertRaisesRegex(ValueError, "identical"):
            module.verify_lineage(self.SHA, self.SHA)
        with patch.object(module.subprocess, "run", return_value=Mock(returncode=1)):
            with self.assertRaisesRegex(ValueError, "not an ancestor"):
                module.verify_lineage(self.SHA, "b" * 40)
        with patch.object(module.subprocess, "run", return_value=Mock(returncode=0)):
            module.verify_lineage(self.SHA, "b" * 40)


if __name__ == "__main__":
    unittest.main()
