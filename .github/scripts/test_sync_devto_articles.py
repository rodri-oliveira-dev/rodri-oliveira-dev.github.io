"""Regression coverage for curated English copy during DEV Community sync."""

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("sync-devto-articles.py")
SPEC = importlib.util.spec_from_file_location("sync_devto_articles", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)

HOMEPAGE = """<!doctype html>
<html lang="en">
    <section class="section writing-section" id="writing">
      <div class="container writing-grid">
        <div class="section-heading">
          <p class="eyebrow">Newsletter</p>
          <h2>Articles and publications</h2>
          <p>Carefully curated Café com código newsletter copy.</p>
          <a href="https://dev.to/rodri-oliveira-dev">Read more</a>
        </div>
        <div class="writing-cards article-list">
        <!-- COMMUNITY_ARTICLES:START -->
          <article>Previous article</article>
        <!-- COMMUNITY_ARTICLES:END -->
        </div>
      </div>
    </section>
    <section class="section about-section" id="about">
      <p>Unrelated page content stays untouched.</p>
    </section>
</html>
"""

ARTICLES = [
    {
        "title": "First & second",
        "url": "https://dev.to/rodri-oliveira-dev/first",
        "publishedAt": "2026-10-07T00:00:00Z",
    },
    {
        "title": "Another article",
        "url": "https://dev.to/rodri-oliveira-dev/second",
        "publishedAt": "2026-09-29T00:00:00Z",
    },
]


class EnglishArticleSynchronizationTests(unittest.TestCase):
    def test_preserves_everything_outside_generated_article_markers(self):
        result = sync.synchronize_writing_section(HOMEPAGE, ARTICLES)

        original_prefix, original_rest = HOMEPAGE.split(sync.START, 1)
        original_suffix = original_rest.split(sync.END, 1)[1]
        updated_prefix, updated_rest = result.split(sync.START, 1)
        updated_suffix = updated_rest.split(sync.END, 1)[1]

        self.assertEqual(original_prefix, updated_prefix)
        self.assertEqual(original_suffix, updated_suffix)
        self.assertIn("<h2>Articles and publications</h2>", result)
        self.assertIn("Carefully curated Café com código", result)
        self.assertEqual(result.count("<article>"), 2)
        self.assertNotIn("Previous article", result)
        self.assertIn("First &amp; second", result)

    def test_repeated_sync_does_not_change_the_document(self):
        once = sync.synchronize_writing_section(HOMEPAGE, ARTICLES)
        twice = sync.synchronize_writing_section(once, ARTICLES)
        self.assertEqual(once, twice)

    def test_rejects_missing_duplicated_and_reversed_markers(self):
        cases = (
            HOMEPAGE.replace(sync.START, ""),
            HOMEPAGE.replace(sync.END, ""),
            HOMEPAGE.replace(sync.START, sync.START + "\n" + sync.START),
            HOMEPAGE.replace(sync.END, sync.END + "\n" + sync.END),
            HOMEPAGE.replace(sync.START, "PLACEHOLDER")
            .replace(sync.END, sync.START)
            .replace("PLACEHOLDER", sync.END),
        )
        for document in cases:
            with self.subTest(document=document):
                with self.assertRaises(SystemExit):
                    sync.synchronize_writing_section(document, ARTICLES)

    def test_escapes_untrusted_article_titles_and_urls(self):
        articles = [{
            "title": "<script>alert('x')</script>",
            "url": "https://dev.to/rodri-oliveira-dev/safe?x=1&y=2",
            "publishedAt": "2026-10-07T00:00:00Z",
        }]
        result = sync.synchronize_writing_section(HOMEPAGE, articles)
        self.assertIn("&lt;script&gt;", result)
        self.assertNotIn("<script>", result)
        self.assertIn("?x=1&amp;y=2", result)


if __name__ == "__main__":
    unittest.main()
