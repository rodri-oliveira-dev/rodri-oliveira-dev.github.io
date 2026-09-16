#!/usr/bin/env python3
"""Generate the public RSS 2.0 feed for the Café com código newsletter."""

from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from datetime import date, datetime, time, timezone
from email.utils import format_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "assets/data/newsletter-articles.json"
FEED_PATH = ROOT / "newsletter/feed.xml"

FEED_URL = "https://rodri-oliveira-dev.github.io/newsletter/feed.xml"
NEWSLETTER_URL = (
    "https://www.linkedin.com/newsletters/"
    "caf%C3%A9-com-c%C3%B3digo-6880618748047314945/"
)
ATOM_NS = "http://www.w3.org/2005/Atom"

ET.register_namespace("atom", ATOM_NS)


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def article_url(article: dict) -> str:
    return (article.get("finalUrl") or article.get("url") or "").strip()


def rss_date(value: str) -> str:
    published = parse_date(value)
    instant = datetime.combine(published, time.min, tzinfo=timezone.utc)
    return format_datetime(instant, usegmt=True)


def load_articles() -> list[dict]:
    if not DATA_PATH.exists():
        raise SystemExit(f"Arquivo não encontrado: {DATA_PATH}")

    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise SystemExit("newsletter-articles.json deve conter uma lista.")

    valid: list[dict] = []
    for article in raw:
        if not isinstance(article, dict):
            continue

        title = str(article.get("title") or "").strip()
        published_at = str(article.get("publishedAt") or "").strip()
        url = article_url(article)

        if not title or not published_at or not url:
            continue

        try:
            parse_date(published_at)
        except ValueError:
            continue

        valid.append(article)

    valid.sort(
        key=lambda article: (
            str(article["publishedAt"]).strip(),
            article_url(article),
        ),
        reverse=True,
    )

    if not valid:
        raise SystemExit("Nenhum artigo válido encontrado para gerar o RSS.")

    return valid


def build_feed(articles: list[dict]) -> ET.Element:
    rss = ET.Element("rss", {"version": "2.0"})
    channel = ET.SubElement(rss, "channel")

    ET.SubElement(channel, "title").text = "Café com código — Rodrigo de Oliveira"
    ET.SubElement(channel, "link").text = NEWSLETTER_URL
    ET.SubElement(channel, "description").text = (
        "Artigos sobre arquitetura de software, .NET, DDD, cloud e engenharia de software."
    )
    ET.SubElement(
        channel,
        f"{{{ATOM_NS}}}link",
        {
            "href": FEED_URL,
            "rel": "self",
            "type": "application/rss+xml",
        },
    )
    ET.SubElement(channel, "language").text = "pt-BR"

    for article in articles:
        url = article_url(article)
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = str(article["title"]).strip()
        ET.SubElement(item, "link").text = url
        ET.SubElement(item, "guid", {"isPermaLink": "true"}).text = url
        ET.SubElement(item, "pubDate").text = rss_date(
            str(article["publishedAt"]).strip()
        )

        description = str(article.get("description") or "").strip()
        if description:
            ET.SubElement(item, "description").text = description

    return rss


def main() -> None:
    articles = load_articles()
    rss = build_feed(articles)
    ET.indent(rss, space="  ")

    FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    xml = ET.tostring(rss, encoding="unicode")
    FEED_PATH.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n' + xml + "\n",
        encoding="utf-8",
    )

    # Parse the generated file again so malformed output fails the workflow immediately.
    ET.parse(FEED_PATH)

    print(
        f"Generated RSS feed with {len(articles)} article(s): "
        f"{FEED_PATH.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
