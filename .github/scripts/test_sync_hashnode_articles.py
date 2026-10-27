"""Tests for deterministic and isolated Hashnode article synchronization."""

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("sync-hashnode-articles.py")
SPEC = importlib.util.spec_from_file_location("sync_hashnode_articles", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)

HOMEPAGE = """<!doctype html>
<html lang="es-419"><head>
  <link rel="alternate" hreflang="x-default" href="https://rodri-oliveira-dev.github.io/">
</head><body>
    <section class="section writing-section" id="writing">
      <div class="container writing-grid">
        <div class="section-heading"><p>Texto editorial preservado.</p></div>
        <div class="writing-cards article-list">
        <!-- HASHNODE_ARTICLES:START -->
          <article>Anterior</article>
        <!-- HASHNODE_ARTICLES:END -->
        </div>
      </div>
    </section>
    <section class="section about-section"><p>Contenido no relacionado.</p></section>
</body></html>
"""


def rss_item(title: str, url: str, published: str) -> str:
    return f"""<item><title>{title}</title><link>{url}</link>
      <description>Descripción &amp; detalles.</description>
      <category>Arquitectura</category><pubDate>{published}</pubDate></item>"""


class HashnodeParsingTests(unittest.TestCase):
    def test_parses_deduplicates_and_sorts_rss(self):
        older = rss_item("Anterior", "https://rodri-oliveira-dev.hashnode.dev/anterior", "Sun, 25 Oct 2026 10:00:00 GMT")
        newer = rss_item("¿Qué cambió &amp; por qué?", "https://rodri-oliveira-dev.hashnode.dev/nuevo", "Mon, 26 Oct 2026 10:00:00 GMT")
        articles = sync.parse_feed(f"<rss><channel>{older}{newer}{older}</channel></rss>".encode())
        self.assertEqual([article["url"] for article in articles], [
            "https://rodri-oliveira-dev.hashnode.dev/nuevo",
            "https://rodri-oliveira-dev.hashnode.dev/anterior",
        ])
        self.assertEqual(articles[0]["title"], "¿Qué cambió & por qué?")
        self.assertEqual(articles[0]["tags"], ["Arquitectura"])

    def test_supports_atom_and_rejects_invalid_dates_and_origins(self):
        atom = b"""<feed xmlns="http://www.w3.org/2005/Atom">
          <entry><title>Valid</title><published>2026-10-26T10:00:00Z</published><link rel="alternate" href="https://rodri-oliveira-dev.hashnode.dev/valid" /></entry>
          <entry><title>Bad date</title><published>never</published><link href="https://rodri-oliveira-dev.hashnode.dev/bad" /></entry>
          <entry><title>Bad host</title><published>2026-10-26T10:00:00Z</published><link href="https://example.com/external" /></entry>
        </feed>"""
        articles = sync.parse_feed(atom)
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]["title"], "Valid")

    def test_rejects_empty_invalid_and_unsupported_feeds(self):
        for payload in (b"<rss><channel /></rss>", b"not xml", b"<other />"):
            with self.subTest(payload=payload), self.assertRaises(SystemExit):
                sync.parse_feed(payload)

    def test_fetch_failure_does_not_replace_existing_catalog(self):
        with tempfile.TemporaryDirectory() as directory:
            catalog = Path(directory) / "catalog.json"
            catalog.write_text('[{"title":"preservado"}]\n', encoding="utf-8")
            with patch.object(sync, "DATA_PATH", catalog), patch.object(sync, "fetch_feed", side_effect=SystemExit("temporary failure")):
                with self.assertRaises(SystemExit):
                    sync.main()
            self.assertEqual(catalog.read_text(encoding="utf-8"), '[{"title":"preservado"}]\n')

    def test_homepage_validation_failure_does_not_replace_existing_catalog(self):
        payload = (
            "<rss><channel>"
            + rss_item(
                "Artículo válido",
                "https://rodri-oliveira-dev.hashnode.dev/valido",
                "Mon, 26 Oct 2026 10:00:00 GMT",
            )
            + "</channel></rss>"
        ).encode()
        with tempfile.TemporaryDirectory() as directory:
            catalog = Path(directory) / "catalog.json"
            homepage = Path(directory) / "index.html"
            catalog.write_text('[{"title":"preservado"}]\n', encoding="utf-8")
            homepage.write_text(HOMEPAGE.replace(sync.START, ""), encoding="utf-8")
            with (
                patch.object(sync, "DATA_PATH", catalog),
                patch.object(sync, "ES_INDEX", homepage),
                patch.object(sync, "fetch_feed", return_value=payload),
            ):
                with self.assertRaises(SystemExit):
                    sync.main()
            self.assertEqual(catalog.read_text(encoding="utf-8"), '[{"title":"preservado"}]\n')


class HashnodeRenderingTests(unittest.TestCase):
    @staticmethod
    def article(index: int) -> dict:
        return {
            "title": f"Artículo <{index}> & arquitectura",
            "url": f"https://rodri-oliveira-dev.hashnode.dev/articulo-{index}",
            "publishedAt": f"2026-10-{index + 10:02d}T10:00:00Z",
        }

    def test_renders_at_most_four_articles_and_escapes_titles(self):
        result = sync.synchronize_writing_section(HOMEPAGE, [self.article(index) for index in range(5)])
        self.assertEqual(result.count("<article>"), 4)
        self.assertIn("Artículo &lt;0&gt; &amp; arquitectura", result)
        self.assertNotIn("articulo-4", result)
        self.assertIn('lang="es-419"', result)
        self.assertIn('hreflang="es"', result)

    def test_rendering_and_rss_discovery_are_idempotent(self):
        once = sync.synchronize_writing_section(HOMEPAGE, [self.article(1)])
        self.assertEqual(sync.synchronize_writing_section(once, [self.article(1)]), once)
        discovered = sync.synchronize_rss_discovery(HOMEPAGE)
        self.assertEqual(sync.synchronize_rss_discovery(discovered), discovered)
        self.assertIn(sync.FEED_URL, discovered)

    def test_rejects_missing_or_reversed_markers(self):
        cases = (
            HOMEPAGE.replace(sync.START, ""), HOMEPAGE.replace(sync.END, ""),
            HOMEPAGE.replace(sync.START, "PLACEHOLDER").replace(sync.END, sync.START).replace("PLACEHOLDER", sync.END),
        )
        for document in cases:
            with self.subTest(document=document), self.assertRaises(SystemExit):
                sync.synchronize_writing_section(document, [self.article(1)])


if __name__ == "__main__":
    unittest.main()
