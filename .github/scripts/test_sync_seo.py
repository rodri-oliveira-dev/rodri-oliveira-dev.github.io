"""Regression coverage for deterministic sitemap lastmod generation."""

import importlib.util
import tempfile
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


class SpanishInfrastructureTests(unittest.TestCase):
    def test_spanish_uses_latin_american_html_language_and_seo_hreflang(self):
        variant = sync.LANGUAGE_VARIANTS["es-419"]
        payload = sync.structured_data(
            "es-419",
            [],
            False,
            ("pt-BR", "en", "es-419"),
        )
        profile = next(node for node in payload["@graph"] if node["@type"] == "ProfilePage")

        self.assertEqual(variant["html"], "es-419")
        self.assertEqual(variant["hreflang"], "es")
        self.assertEqual(profile["inLanguage"], "es-419")
        self.assertEqual(profile["url"], sync.ES_URL)

    def test_hreflang_never_references_an_absent_spanish_page(self):
        html = """<head>
  <link rel="alternate" hreflang="pt-BR" href="https://example.test/">
  <link rel="alternate" hreflang="en" href="https://example.test/en/">
  <link rel="alternate" hreflang="x-default" href="https://example.test/">
</head>"""

        updated = sync.synchronize_hreflang(
            html,
            {"pt-BR": "https://example.test/", "en": "https://example.test/en/"},
        )

        self.assertNotIn('hreflang="es"', updated)
        self.assertNotIn("/es/", updated)

    @patch.object(sync, "git_last_modified", return_value="2026-10-20")
    @patch.object(sync, "file_was_dirty", return_value=False)
    def test_case_study_sitemap_is_deterministic_and_progressive(
        self,
        _dirty,
        _git_last_modified,
    ):
        paths = {
            "pt-BR": Path("case-studies/example/index.html"),
            "en": Path("en/case-studies/example/index.html"),
            "es-419": Path("es/case-studies/example/index.html"),
        }

        first = sync.case_study_sitemap_block("example", paths, "2026-10-22", {})
        second = sync.case_study_sitemap_block("example", paths, "2026-10-22", {})

        self.assertEqual(first, second)
        self.assertEqual(first.count('hreflang="es"'), 3)
        self.assertIn("/es/case-studies/example/", first)

    def test_case_studies_allow_partial_spanish_coverage(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            variants = {}
            for language, relative in (
                ("pt-BR", "case-studies"),
                ("en", "en/case-studies"),
                ("es-419", "es/case-studies"),
            ):
                variants[language] = dict(sync.LANGUAGE_VARIANTS[language])
                variants[language]["case_root"] = root / relative

            for language in ("pt-BR", "en"):
                for slug in ("translated", "pending"):
                    page = variants[language]["case_root"] / slug / "index.html"
                    page.parent.mkdir(parents=True, exist_ok=True)
                    page.touch()
            spanish_page = variants["es-419"]["case_root"] / "translated/index.html"
            spanish_page.parent.mkdir(parents=True, exist_ok=True)
            spanish_page.touch()

            with patch.object(sync, "LANGUAGE_VARIANTS", variants):
                discovered = sync.discover_case_studies()

            by_slug = dict(discovered)
            self.assertIn("es-419", by_slug["translated"])
            self.assertNotIn("es-419", by_slug["pending"])

    def test_strict_spanish_coverage_is_available_for_final_validation(self):
        with patch.object(sync, "ES_INDEX", Path("missing-es-index.html")):
            with self.assertRaisesRegex(SystemExit, "Spanish coverage is incomplete"):
                sync.discover_case_studies(require_complete_spanish=True)

    def test_home_navigation_exposes_all_languages_and_marks_current_page(self):
        for relative_path in ("index.html", "en/index.html", "es/index.html"):
            html = (sync.ROOT / relative_path).read_text(encoding="utf-8")
            self.assertIn('class="language-switcher"', html)
            self.assertIn('aria-current="page"', html)
            for href in ('href="/"', 'href="/en/"', 'href="/es/"'):
                self.assertIn(href, html)


if __name__ == "__main__":
    unittest.main()
