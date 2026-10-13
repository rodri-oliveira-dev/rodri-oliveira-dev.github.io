#!/usr/bin/env python3
"""Regression tests for DEV Community article synchronization."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("sync-devto-articles.py")
SPEC = importlib.util.spec_from_file_location("sync_devto_articles", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load {SCRIPT}")
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)

SAMPLE_HTML = f"""<!doctype html>
<html lang="en">
  <head><title>Editorial homepage</title></head>
  <body>
    <section class="section writing-section" id="writing">
      <div class="container writing-grid">
        <div class="section-heading">
          <p class="eyebrow">Updated editorial label</p>
          <h2>My own Writing headline</h2>
          <p>Copy that must survive automated updates.</p>
        </div>
        <div class="writing-cards article-list">
{sync.START}
          <article>Previous card</article>
{sync.END}
        </div>
      </div>
    </section>
    <footer>Do not change the footer</footer>
  </body>
</html>
"""


def sample_articles(count: int = 1) -> list[dict]:
    return [
        {
            "title": f"Article {index} & engineering",
            "url": f"https://dev.to/rodri-oliveira-dev/article-{index}",
            "publishedAt": "2026-10-07T00:00:00Z",
        }
        for index in range(count)
    ]


class DevtoSyncTests(unittest.TestCase):
    def test_replaces_only_content_between_article_markers(self) -> None:
        updated = sync.synchronize_writing_section(SAMPLE_HTML, sample_articles())

        before_start, after_start = SAMPLE_HTML.split(sync.START, 1)
        _, after_end = after_start.split(sync.END, 1)
        self.assertTrue(updated.startswith(before_start + sync.START))
        self.assertTrue(updated.endswith(sync.END + after_end))
        self.assertIn("My own Writing headline", updated)
        self.assertIn("Copy that must survive automated updates.", updated)
        self.assertIn("<footer>Do not change the footer</footer>", updated)
        self.assertNotIn("Previous card", updated)
        self.assertIn("Article 0 &amp; engineering", updated)

    def test_rerender_is_idempotent(self) -> None:
        articles = sample_articles(2)
        once = sync.synchronize_writing_section(SAMPLE_HTML, articles)
        twice = sync.synchronize_writing_section(once, articles)
        self.assertEqual(once, twice)

    def test_renders_up_to_four_cards(self) -> None:
        updated = sync.synchronize_writing_section(SAMPLE_HTML, sample_articles(5))
        cards = updated.split(sync.START, 1)[1].split(sync.END, 1)[0]
        self.assertEqual(cards.count("<article>"), 4)
        self.assertNotIn("Article 4", cards)

    def test_missing_or_duplicated_markers_fail_closed(self) -> None:
        for document in (
            SAMPLE_HTML.replace(sync.START, ""),
            SAMPLE_HTML.replace(sync.END, ""),
            SAMPLE_HTML.replace(sync.START, sync.START + "\n" + sync.START),
        ):
            with self.subTest(document=document):
                with self.assertRaises(SystemExit):
                    sync.synchronize_writing_section(document, sample_articles())

    def test_markers_must_be_ordered_and_inside_writing_section(self) -> None:
        reversed_markers = SAMPLE_HTML.replace(sync.START, "PLACEHOLDER").replace(
            sync.END, sync.START
        ).replace("PLACEHOLDER", sync.END)
        outside_section = (
            SAMPLE_HTML.replace(sync.START, "").replace(sync.END, "")
            + sync.START + "\n" + sync.END
        )
        for document in (reversed_markers, outside_section):
            with self.subTest(document=document):
                with self.assertRaises(SystemExit):
                    sync.synchronize_writing_section(document, sample_articles())


if __name__ == "__main__":
    unittest.main()
