"""Exercise the internal-doc classification and real Git comparison."""
import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "select_docs_impact", Path(__file__).with_name("select-docs-impact.py"))
impact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(impact)


class DocumentationImpactTests(unittest.TestCase):
    def test_allowlist_and_public_docs(self):
        for path in (b"docs/adr/0022.md", b"docs/privacy/web-push/consent/1.0.0.md",
                     b"docs/validation/report.md", b"AGENTS.md", b".github/AUTOMATION.md"):
            self.assertTrue(impact.is_internal(path), path)
        for path in (b"README.md", b"docs/pwa.md", b"docs/accessibility-audit.md",
                     b"docs/webmcp.pt-BR.md", b"docs/contracts/webmcp-services.v1.json",
                     b"docs/adr/unsafe.html", b"docs/adr/../pwa.md",
                     b".github/skills/portfolio-ci-automation/SKILL.md",
                     b".github/workflows/deploy-pages.yml", b"index.html",
                     b"sitemap.xml", b".well-known/ard.json", b"assets/data/articles.json",
                     b"unknown/file.md"):
            self.assertFalse(impact.is_internal(path), path)

    def test_real_diff_and_fail_closed_fallback(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=root,
                                               stderr=subprocess.DEVNULL).decode().strip()
            def commit(message):
                git("add", "-A")
                git("commit", "-m", message)
                return git("rev-parse", "HEAD")
            git("init")
            git("config", "user.name", "Fixture")
            git("config", "user.email", "fixture@example.invalid")
            (root / "index.html").write_text("<main>Test</main>")
            (root / "docs/adr").mkdir(parents=True)
            base = commit("base")
            (root / "docs/adr/example.md").write_text("ADR")
            docs = commit("documentation")
            self.assertFalse(impact.should_run("pull_request", base, docs, root))
            self.assertTrue(impact.should_run("push", base, docs, root))
            self.assertTrue(impact.should_run("workflow_dispatch", base, docs, root))
            self.assertTrue(impact.should_run("pull_request", docs, docs, root))
            self.assertTrue(impact.should_run("pull_request", None, docs, root))
            self.assertTrue(impact.should_run("pull_request", "a" * 40, docs, root))
            (root / "index.html").write_text("<main>Changed</main>")
            mixed = commit("mixed")
            self.assertTrue(impact.should_run("pull_request", base, mixed, root))
            git("mv", "index.html", "docs/adr/archived.md")
            renamed = commit("rename to internal")
            self.assertTrue(impact.should_run("pull_request", mixed, renamed, root))
            (root / "docs/adr/example.md").unlink()
            deleted = commit("delete internal documentation")
            self.assertFalse(impact.should_run("pull_request", renamed, deleted, root))


if __name__ == "__main__":
    unittest.main()
