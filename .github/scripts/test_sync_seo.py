"""Regression coverage for deterministic sitemap lastmod generation."""

import importlib.util
import json
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
    def test_person_uses_official_senior_role_in_every_language(self):
        senior_terms = {
            "pt-BR": "Sênior",
            "en": "Senior",
            "es-419": "Senior",
        }
        for language, senior_term in senior_terms.items():
            person = sync.person_node(language, True)

            self.assertEqual(person["jobTitle"], "Senior Software Architect")
            self.assertIn(senior_term, person["description"])

    def test_person_exposes_visible_architecture_competencies_in_every_language(self):
        expected_topics = {
            "pt-BR": {
                "Integração de Sistemas e APIs",
                "Modernização de Sistemas Legados",
                "Cloud Computing",
                "Segurança de Software",
                "Manutenibilidade",
            },
            "en": {
                "Systems Integration and APIs",
                "Legacy System Modernization",
                "Cloud Computing",
                "Software Security",
                "Maintainability",
            },
            "es-419": {
                "Integración de Sistemas y APIs",
                "Modernización de Sistemas Legados",
                "Cloud Computing",
                "Seguridad de Software",
                "Mantenibilidad",
            },
        }
        for language, topics in expected_topics.items():
            person = sync.person_node(language, True)
            self.assertTrue(topics.issubset(set(person["knowsAbout"])))

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

    def test_spanish_rss_and_hashnode_articles_are_structured_from_catalog(self):
        articles = [{
            "title": "Arquitectura & código",
            "url": "https://rodri-oliveira-dev.hashnode.dev/arquitectura",
            "publishedAt": "2026-10-26T20:50:14Z",
            "description": "Contenido original en español.",
        }]
        payload = sync.structured_data("es-419", [], True, ("pt-BR", "en", "es-419"), articles)
        profile = next(node for node in payload["@graph"] if node["@type"] == "ProfilePage")
        article = next(node for node in payload["@graph"] if node["@type"] == "Article")
        person = next(node for node in payload["@graph"] if node["@type"] == "Person")
        self.assertEqual(sync.rss_discovery("es-419", True).count(sync.ES_FEED_URL), 1)
        self.assertEqual(profile["hasPart"], [{"@id": article["@id"]}])
        self.assertEqual(article["inLanguage"], "es-419")
        self.assertEqual(article["headline"], "Arquitectura & código")
        self.assertIn(sync.HASHNODE_PROFILE_URL, person["sameAs"])

    def test_hashnode_title_cannot_terminate_json_ld_script(self):
        title = "Arquitectura </script><script>alert(1)</script>"
        articles = [{
            "title": title,
            "url": "https://rodri-oliveira-dev.hashnode.dev/arquitectura-segura",
            "publishedAt": "2026-10-26T20:50:14Z",
            "description": "Contenido original en español.",
        }]

        block = sync.structured_block(
            "es-419", [], True, ("pt-BR", "en", "es-419"), articles
        )
        json_text = block.split('<script type="application/ld+json">\n', 1)[1].rsplit(
            "\n  </script>", 1
        )[0]
        payload = json.loads(json_text)
        article = next(node for node in payload["@graph"] if node["@type"] == "Article")

        self.assertNotIn("</script>", json_text.lower())
        self.assertIn("\\u003c/script>", json_text)
        self.assertEqual(article["headline"], title)

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

    def test_partial_spanish_coverage_requires_explicit_migration_mode(self):
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
                discovered = sync.discover_case_studies(require_complete_spanish=False)

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


class CaseStudyStructuredDataTests(unittest.TestCase):
    def test_case_study_reuses_canonical_author_and_website_entities(self):
        page_url = f"{sync.SITE_URL}case-studies/example/"
        repository = "https://github.com/rodri-oliveira-dev/example"
        payload = {
            "@context": "https://schema.org",
            "@type": ["Article", "TechArticle"],
            "headline": "Example",
            "url": page_url,
            "author": {"@type": "Person", "name": "Rodrigo de Oliveira"},
            "about": {
                "@type": "SoftwareSourceCode",
                "name": "Example",
                "codeRepository": repository,
            },
        }

        result = sync.normalize_case_study_structured_data(payload)

        self.assertEqual(result["@id"], f"{page_url}#article")
        self.assertEqual(result["author"]["@id"], sync.PERSON_ID)
        self.assertEqual(result["author"]["url"], sync.SITE_URL)
        self.assertEqual(result["isPartOf"]["@id"], sync.WEBSITE_ID)
        self.assertEqual(result["mainEntityOfPage"]["@id"], page_url)
        self.assertEqual(
            result["about"]["@id"],
            f"{repository}#software-source-code",
        )

    def test_case_study_rejects_urls_outside_the_portfolio(self):
        with self.assertRaisesRegex(SystemExit, "invalid URL"):
            sync.normalize_case_study_structured_data({
                "url": "https://example.com/case-study/",
            })

    def test_case_study_preserves_topic_list_when_no_source_entity_exists(self):
        topics = ["Software Architecture", "Distributed Systems"]
        payload = {
            "url": f"{sync.SITE_URL}case-studies/example/",
            "about": topics,
        }

        result = sync.normalize_case_study_structured_data(payload)

        self.assertEqual(result["about"], topics)



class ServicePageSeoTests(unittest.TestCase):
    def sample_html(self, language: str) -> str:
        """Provide minimal service-page markup for localized SEO assertions."""
        url = sync.SERVICE_URLS[language]
        return f'''<!doctype html>
<html lang="{language}">
<head>
  <title>Software Architecture Consulting</title>
  <meta name="description" content="Technical reviews and modernization">
  <link rel="canonical" href="{url}">
</head>
<body>
  <h1>Architecture for evolving systems</h1>
  <article class="services-card"><h3>Architecture review</h3></article>
  <article class="services-card"><h3>.NET modernization</h3></article>
  <article class="services-card"><h3>APIs</h3></article>
  <article class="services-card"><h3>Engineering guidance</h3></article>
</body>
</html>'''

    def test_schema_reuses_person_and_site_without_unverified_offers(self):
        """Verify service schema uses canonical identities and no fabricated offers."""
        for language in sync.SERVICE_PAGES:
            payload = sync.service_structured_data(language, self.sample_html(language))
            graph = {node["@type"]: node for node in payload["@graph"]}
            self.assertEqual(set(graph), {"WebPage", "Service", "BreadcrumbList"})
            self.assertEqual(graph["WebPage"]["inLanguage"], language)
            self.assertEqual(graph["WebPage"]["isPartOf"]["@id"], sync.WEBSITE_ID)
            self.assertEqual(graph["Service"]["provider"]["@id"], sync.PERSON_ID)
            self.assertEqual(len(graph["Service"]["serviceType"]), 4)
            self.assertNotIn("offers", graph["Service"])

    def test_hreflang_is_reciprocal_and_generation_is_idempotent(self):
        """Ensure all locale links are reciprocal and serialization is stable."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            for language in sync.SERVICE_PAGES:
                page = Path(temporary_directory) / language / "index.html"
                page.parent.mkdir(parents=True)
                page.write_text(self.sample_html(language), encoding="utf-8")
                sync.synchronize_service_page(language, page)
                generated = page.read_text(encoding="utf-8")
                sync.synchronize_service_page(language, page)
                self.assertEqual(page.read_text(encoding="utf-8"), generated)
                for code, url in sync.SERVICE_URLS.items():
                    hreflang = sync.LANGUAGE_VARIANTS[code]["hreflang"]
                    self.assertIn(
                        f'<link rel="alternate" hreflang="{hreflang}" href="{url}">',
                        generated,
                    )
                self.assertIn('hreflang="x-default"', generated)
                self.assertEqual(generated.count("SEO_SERVICES_STRUCTURED_DATA:START"), 1)

    @patch.object(sync, "git_last_modified", return_value="2026-11-11")
    @patch.object(sync, "page_lastmod", return_value="2026-11-11")
    def test_sitemap_contains_three_reciprocal_urls(self, _lastmod, _git):
        """Check sitemap entry count and language alternates for all services."""
        result = sync.service_sitemap_blocks(sync.SERVICE_PAGES, "2026-11-11", {})
        self.assertEqual(result.count("<url>"), 3)
        self.assertEqual(result.count('hreflang="es"'), 3)
        self.assertEqual(result.count('hreflang="x-default"'), 3)
        for url in sync.SERVICE_URLS.values():
            self.assertIn(f"<loc>{url}</loc>", result)

    @patch.object(sync, "git_last_modified", return_value="2026-11-12")
    @patch.object(sync, "file_was_dirty", return_value=False)
    def test_service_lastmod_advances_after_committed_page_change(self, _dirty, _git):
        """Use the latest committed page date when sitemap entries are older."""
        lastmods = {url: "2026-11-10" for url in sync.SERVICE_URLS.values()}

        result = sync.service_sitemap_blocks(sync.SERVICE_PAGES, "2026-11-13", lastmods)

        self.assertEqual(result.count("<lastmod>2026-11-12</lastmod>"), 3)

    @patch.object(sync, "git_last_modified", return_value="2026-11-09")
    @patch.object(sync, "file_was_dirty", return_value=False)
    def test_service_lastmod_preserves_newer_sitemap_date(self, _dirty, _git):
        """Avoid regressing lastmod if the stored sitemap date is already newer."""
        lastmods = {url: "2026-11-11" for url in sync.SERVICE_URLS.values()}

        result = sync.service_sitemap_blocks(sync.SERVICE_PAGES, "2026-11-13", lastmods)

        self.assertEqual(result.count("<lastmod>2026-11-11</lastmod>"), 3)

    @patch.object(sync, "git_last_modified", return_value="2026-11-10")
    @patch.object(sync, "file_was_dirty", return_value=True)
    def test_service_lastmod_uses_today_for_local_changes(self, _dirty, _git):
        """Use the generation date when service pages have uncommitted edits."""
        lastmods = {url: "2026-11-09" for url in sync.SERVICE_URLS.values()}

        result = sync.service_sitemap_blocks(sync.SERVICE_PAGES, "2026-11-13", lastmods)

        self.assertEqual(result.count("<lastmod>2026-11-13</lastmod>"), 3)

    def test_incomplete_translations_are_rejected(self):
        """Reject any missing service translation rather than indexing partial pages."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            pt = Path(temporary_directory) / "servicos/index.html"
            pt.parent.mkdir(parents=True)
            pt.touch()
            pages = {"pt-BR": pt, "en": Path(temporary_directory) / "missing-en",
                     "es-419": Path(temporary_directory) / "missing-es"}
            with patch.object(sync, "SERVICE_PAGES", pages):
                with self.assertRaisesRegex(SystemExit, "incomplete"):
                    sync.existing_service_variants()


if __name__ == "__main__":
    unittest.main()
