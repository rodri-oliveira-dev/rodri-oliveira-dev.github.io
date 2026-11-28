import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("web_push_release", Path(__file__).with_name("web-push-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

SHA = "a" * 40


def fixture_api(*, deployment_sha=SHA, status="success", with_release=True, deployment_ref="main"):
    def fake(repo, endpoint):
        if endpoint.startswith("deployments?"):
            return [{
                "id": 42,
                "sha": deployment_sha,
                "environment": "github-pages",
                "ref": deployment_ref,
                "task": "deploy",
            }]
        if endpoint == "deployments/42/statuses?per_page=1":
            return [{"state": status, "created_at": "2026-11-27T18:00:00Z"}]
        if endpoint == "releases?per_page=100":
            return [{"tag_name": "1.2.3", "draft": False, "prerelease": False}] if with_release else []
        if endpoint == "git/ref/tags/1.2.3":
            return {"object": {"type": "commit", "sha": deployment_sha}}
        if endpoint.startswith("issues/"):
            return {"state": "closed"}
        raise AssertionError(endpoint)
    return fake


class WebPushReleaseTests(unittest.TestCase):
    def catalog_root(self):
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        (root / "assets/data").mkdir(parents=True)
        (root / "assets/data/newsletter-articles.json").write_text('[{"title":"pt"}]', encoding="utf-8")
        (root / "assets/data/devto-articles.json").write_text('[{"title":"en"},{"title":"en2"}]', encoding="utf-8")
        (root / "assets/data/hashnode-articles.json").write_text('[]', encoding="utf-8")
        return temporary, root

    def test_effective_publication_uses_durable_deployment_and_release(self):
        temporary, root = self.catalog_root()
        self.addCleanup(temporary.cleanup)
        with patch.object(release, "api", side_effect=fixture_api()):
            evidence, counts, _ = release.build_evidence("owner/repo", root, SHA)
        self.assertEqual(SHA, evidence["sha"])
        self.assertEqual(42, evidence["sequence"])
        self.assertEqual({"pt-BR": 1, "en": 2, "es-419": 0}, counts)

    def test_incomplete_publication_and_merge_without_release_are_rejected(self):
        temporary, root = self.catalog_root()
        self.addCleanup(temporary.cleanup)
        with patch.object(release, "api", side_effect=fixture_api(status="failure")):
            with self.assertRaisesRegex(RuntimeError, "Nenhuma publicação"):
                release.build_evidence("owner/repo", root, SHA)
        with patch.object(release, "api", side_effect=fixture_api(with_release=False)):
            with self.assertRaisesRegex(RuntimeError, "não possui GitHub Release"):
                release.build_evidence("owner/repo", root, SHA)

    def test_wrong_or_superseded_sha_is_rejected(self):
        temporary, root = self.catalog_root()
        self.addCleanup(temporary.cleanup)
        with patch.object(release, "api", side_effect=fixture_api()):
            with self.assertRaisesRegex(RuntimeError, "superado"):
                release.build_evidence("owner/repo", root, "b" * 40)

    def test_non_main_pages_deployment_is_rejected(self):
        temporary, root = self.catalog_root()
        self.addCleanup(temporary.cleanup)
        with patch.object(release, "api", side_effect=fixture_api(deployment_ref="feature")):
            with self.assertRaisesRegex(RuntimeError, "main"):
                release.build_evidence("owner/repo", root, SHA)

    def test_real_gate_requires_closed_issues_and_both_switches(self):
        with patch.object(release, "api", side_effect=fixture_api()):
            release.real_processing_gate("owner/repo", "ENQUEUE", "true", "true")
        for values in (("dry-run", "true", "true"), ("ENQUEUE", "false", "true"), ("ENQUEUE", "true", "false")):
            with self.subTest(values=values), self.assertRaises(RuntimeError):
                release.real_processing_gate("owner/repo", *values)
        with patch.object(release, "api", return_value={"state": "open"}):
            with self.assertRaisesRegex(RuntimeError, "#155"):
                release.real_processing_gate("owner/repo", "ENQUEUE", "true", "true")

    def test_dry_run_summary_declares_no_azure_effects(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "summary.md"
            release.write_summary(path, {"sha": SHA, "sequence": 42}, {"pt-BR": 1, "en": 2, "es-419": 0}, {"tag_name": "1.2.3"}, "dry-run")
            text = path.read_text(encoding="utf-8")
            self.assertIn("nenhum", text)
            self.assertNotIn("endpoint", text.lower())

    def test_public_launch_gate_requires_exact_confirmations_enqueue_and_closed_issues(self):
        with patch.object(release, "api", side_effect=fixture_api()):
            release.public_launch_gate("owner/repo", "ENABLE-PUBLIC-WEB-PUSH", "enqueue", "ENQUEUE")
        for values in (
            ("wrong", "enqueue", "ENQUEUE"),
            ("ENABLE-PUBLIC-WEB-PUSH", "dry-run", "ENQUEUE"),
            ("ENABLE-PUBLIC-WEB-PUSH", "enqueue", "wrong"),
        ):
            with self.subTest(values=values), self.assertRaises(RuntimeError):
                release.public_launch_gate("owner/repo", *values)
        with self.assertRaisesRegex(RuntimeError, "bootstrap"):
            release.public_launch_gate("owner/repo", "ENABLE-PUBLIC-WEB-PUSH", "enqueue", "ENQUEUE", "true")
        with patch.object(release, "api", return_value={"state": "open"}):
            with self.assertRaisesRegex(RuntimeError, "#155"):
                release.public_launch_gate("owner/repo", "ENABLE-PUBLIC-WEB-PUSH", "enqueue", "ENQUEUE")


if __name__ == "__main__":
    unittest.main()
