"""Regression tests for article descriptions recovered from external metadata."""

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("import-newsletter.py")
SPEC = importlib.util.spec_from_file_location("import_newsletter", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
newsletter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(newsletter)


class DescriptionImportTests(unittest.TestCase):
    def test_linkedin_300_character_preview_ends_on_word_boundary(self):
        clipped = (
            "Durante minhas férias, resolvi dedicar parte do tempo a estudar melhor "
            "o Model Context Protocol, ou simplesmente MCP. Eu já vinha acompanhando "
            "o assunto e tinha algumas implementações nos meus projetos open source, "
            "mas queria entender melhor o protocolo, experimentar algumas possibilidades e, princi"
        )
        self.assertEqual(len(clipped), 300)

        value, source, automatic = newsletter.choose_description(
            [("og:description", clipped)], ""
        )

        self.assertTrue(value.endswith("protocolo, experimentar algumas possibilidades…"))
        self.assertNotIn("princi", value)
        self.assertEqual(source, "og:description (prévia normalizada)")
        self.assertTrue(automatic)

    def test_prefers_complete_alternative_to_truncated_open_graph(self):
        clipped = "Texto descritivo " + "exemplo " * 40 + "parci"
        self.assertTrue(newsletter.is_likely_truncated_description(clipped))
        self.assertEqual(
            newsletter.choose_description(
                [
                    ("og:description", clipped),
                    ("JSON-LD description", "Descrição completa do artigo."),
                ],
                "",
            ),
            ("Descrição completa do artigo.", "JSON-LD description", True),
        )

    def test_manual_fallback_is_preferred_to_truncated_metadata(self):
        clipped = "Descrição de teste " + "conteúdo " * 36 + "incomp"
        self.assertTrue(newsletter.is_likely_truncated_description(clipped))
        self.assertEqual(
            newsletter.choose_description(
                [("og:description", clipped)], "Resumo manual revisado."
            ),
            ("Resumo manual revisado.", "fallback manual informado", False),
        )

    def test_preserves_short_description_without_terminal_period(self):
        self.assertEqual(
            newsletter.choose_description(
                [("og:description", "Descrição curta sem ponto final")], ""
            ),
            ("Descrição curta sem ponto final", "og:description", True),
        )

    def test_preserves_long_description_with_terminal_punctuation(self):
        value = "Descrição longa de exemplo. " * 16
        self.assertGreater(len(value.strip()), 280)
        self.assertEqual(
            newsletter.choose_description([("og:description", value)], ""),
            (value.strip(), "og:description", True),
        )

    def test_160_character_metadata_preview_is_also_normalized(self):
        clipped = "Um resumo sobre arquitetura, decisões de projeto e documentação. "
        clipped += "Cenários e alternativas " * 3
        clipped = (clipped + "texto " * 40)[:155] + "princ"
        self.assertEqual(len(clipped), 160)
        value, source, _ = newsletter.choose_description(
            [("meta description", clipped)], ""
        )
        self.assertTrue(value.endswith("…"))
        self.assertNotIn("princ", value)
        self.assertIn("normalizada", source)



class DuplicateImportTests(unittest.TestCase):
    def test_equivalent_linkedin_domains_are_duplicates(self):
        articles = [{
            "url": "https://www.linkedin.com/pulse/example-article/",
            "title": "Existing article",
        }]
        found = newsletter.find_existing_article(
            articles, "https://pt.linkedin.com/pulse/example-article/"
        )
        self.assertIs(found, articles[0])

    def test_redirect_target_already_imported_is_duplicate(self):
        articles = [{
            "url": "https://www.linkedin.com/pulse/existing/",
            "title": "Existing article",
        }]
        found = newsletter.find_existing_article(
            articles,
            "https://example.com/link",
            "https://www.linkedin.com/pulse/existing/",
        )
        self.assertIs(found, articles[0])

    def test_new_article_is_not_duplicate(self):
        self.assertIsNone(
            newsletter.find_existing_article([], "https://example.com/new")
        )

    def test_duplicate_import_is_noop_without_fetching_external_page(self):
        import json
        import tempfile
        from unittest.mock import patch

        url = "https://www.linkedin.com/pulse/already-imported/"
        catalog = [{
            "url": url, "finalUrl": url, "title": "Already imported",
            "description": "Existing description", "publishedAt": "2026-11-03",
        }]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "newsletter-articles.json"
            path.write_text(json.dumps(catalog, ensure_ascii=False) + "\n", encoding="utf-8")
            initial_content = path.read_bytes()
            output_path = root / "github-output.txt"
            summary_path = root / "summary.md"
            with (
                patch.object(newsletter, "DATA_PATH", path),
                patch.object(newsletter, "OUTPUT_PATH", str(output_path)),
                patch.object(newsletter, "SUMMARY_PATH", str(summary_path)),
                patch.dict(newsletter.os.environ, {
                    "ARTICLE_URL": url,
                    "FALLBACK_TITLE": "",
                    "FALLBACK_DESCRIPTION": "",
                    "FALLBACK_PUBLISHED_AT": "",
                }),
                patch.object(newsletter.urllib.request, "urlopen", side_effect=AssertionError("Unexpected network access")),
            ):
                newsletter.main()

            self.assertEqual(path.read_bytes(), initial_content)
            self.assertIn("json_action=duplicate", output_path.read_text(encoding="utf-8"))
            self.assertIn("sem alterações", summary_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
