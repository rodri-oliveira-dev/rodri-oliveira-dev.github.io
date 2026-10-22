"""Regression coverage for deterministic sitemap lastmod generation."""

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("sync-seo.py")
SPEC = importlib.util.spec_from_file_location("sync_seo", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)


class SitemapLastModifiedTests(unittest.TestCase):
    def setUp(self):
        self.path = Path("case-studies/example/index.html")
        self.url = "https://rodri-oliveira-dev.github.io/case-studies/example/"
        self.existing = {self.url: "2026-10-21"}

    @patch.object(sync, "git_last_modified", return_value="2026-10-22")
    @patch.object(sync, "file_was_dirty", return_value=False)
    def test_clean_page_preserves_committed_lastmod_across_days(
        self,
        _dirty,
        _git_last_modified,
    ):
        result = sync.page_lastmod(
            self.url,
            self.path,
            "2026-10-22",
            self.existing,
        )

        self.assertEqual(result, "2026-10-21")

    @patch.object(sync, "git_last_modified", return_value="2026-10-20")
    @patch.object(sync, "file_was_dirty", return_value=True)
    def test_dirty_page_uses_generation_date(self, _dirty, _git_last_modified):
        result = sync.page_lastmod(
            self.url,
            self.path,
            "2026-10-22",
            self.existing,
        )

        self.assertEqual(result, "2026-10-22")

    @patch.object(sync, "git_last_modified", return_value="2026-10-20")
    @patch.object(sync, "file_was_dirty", return_value=False)
    def test_new_clean_page_falls_back_to_git_date(
        self,
        _dirty,
        _git_last_modified,
    ):
        result = sync.page_lastmod(
            self.url,
            self.path,
            "2026-10-22",
            {},
        )

        self.assertEqual(result, "2026-10-20")


if __name__ == "__main__":
    unittest.main()
