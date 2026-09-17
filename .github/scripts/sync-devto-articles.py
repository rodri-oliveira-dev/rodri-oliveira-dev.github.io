#!/usr/bin/env python3
"""Synchronize the English homepage with Rodrigo's DEV Community RSS feed."""

from __future__ import annotations

import html
import json
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[2]
EN_INDEX = ROOT / "en/index.html"
DATA_PATH = ROOT / "assets/data/devto-articles.json"

FEED_URL = "https://dev.to/feed/rodri-oliveira-dev"
PROFILE_URL = "https://dev.to/rodri-oliveira-dev"
ALLOWED_HOST = "dev.to"
ALLOWED_PATH_PREFIX = "/rodri-oliveira-dev/"

RSS_TAG = (
    '  <link rel="alternate" type="application/rss+xml" '
    'title="Rodrigo de Oliveira on DEV Community — RSS" '
    f'href="{FEED_URL}">'
)
RSS_PATTERN = re.compile(
    r'^\s*<link rel="alternate" type="application/rss\+xml"[^>]*>\s*$',
    re.MULTILINE,
)

SECTION_PATTERN = re.compile(
    r'^    <section class="section writing-section" id="writing">.*?^    </section>',
    re.MULTILINE | re.DOTALL,
)

START = "        <!-- COMMUNITY_ARTICLES:START -->"
END = "        <!-- COMMUNITY_ARTICLES:END -->"

MONTHS_EN = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

TAG_PATTERN = re.compile(r"<[^>]+>")
SPACE_PATTERN = re.compile(r"\s+")


def fetch_feed() -> bytes:
    request = urllib.request.Request(
        FEED_URL,
        headers={
            "Accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
            "User-Agent": (
                "rodri-oliveira-dev.github.io/1.0 "
                "(+https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io)"
            ),
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status = getattr(response, "status", 200)
            if status != 200:
                raise SystemExit(f"DEV Community RSS returned HTTP {status}.")
            payload = response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise SystemExit(f"Could not download DEV Community RSS: {exc}") from exc

    if not payload.strip():
        raise SystemExit("DEV Community RSS returned an empty response.")
    return payload


def normalize_url(value: str) -> str:
    raw = value.strip()
    if not raw:
        return ""

    parts = urlsplit(raw)
    if parts.scheme != "https" or parts.hostname != ALLOWED_HOST:
        return ""
    if not parts.path.startswith(ALLOWED_PATH_PREFIX):
        return ""

    return urlunsplit(("https", ALLOWED_HOST, parts.path.rstrip("/"), "", ""))


def clean_description(value: str, limit: int = 320) -> str:
    text = html.unescape(TAG_PATTERN.sub(" ", value or ""))
    text = SPACE_PATTERN.sub(" ", text).strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}…"


def parse_rss_date(value: str) -> datetime:
    parsed = parsedate_to_datetime(value.strip())
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_atom_date(value: str) -> datetime:
    normalized = value.strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_rss(root: ET.Element) -> list[dict]:
    articles: list[dict] = []
    for item in root.findall("./channel/item"):
        title = (item.findtext("title") or "").strip()
        link = normalize_url(item.findtext("link") or "")
        pub_date = (item.findtext("pubDate") or "").strip()
        description = item.findtext("description") or ""
        tags = [
            (category.text or "").strip()
            for category in item.findall("category")
            if (category.text or "").strip()
        ]

        if not title or not link or not pub_date:
            continue

        try:
            published_at = parse_rss_date(pub_date)
        except (TypeError, ValueError, OverflowError):
            continue

        articles.append(
            {
                "url": link,
                "title": title,
                "description": clean_description(description),
                "publishedAt": iso_utc(published_at),
                "tags": tags,
            }
        )
    return articles


def parse_atom(root: ET.Element) -> list[dict]:
    namespace = "{http://www.w3.org/2005/Atom}"
    articles: list[dict] = []

    for entry in root.findall(f"{namespace}entry"):
        title = (entry.findtext(f"{namespace}title") or "").strip()
        published = (
            entry.findtext(f"{namespace}published")
            or entry.findtext(f"{namespace}updated")
            or ""
        ).strip()
        summary = (
            entry.findtext(f"{namespace}summary")
            or entry.findtext(f"{namespace}content")
            or ""
        )

        link = ""
        for candidate in entry.findall(f"{namespace}link"):
            rel = (candidate.attrib.get("rel") or "alternate").strip()
            href = candidate.attrib.get("href") or ""
            if rel == "alternate":
                link = normalize_url(href)
                if link:
                    break

        if not title or not link or not published:
            continue

        try:
            published_at = parse_atom_date(published)
        except ValueError:
            continue

        tags = [
            category.attrib.get("term", "").strip()
            for category in entry.findall(f"{namespace}category")
            if category.attrib.get("term", "").strip()
        ]
        articles.append(
            {
                "url": link,
                "title": title,
                "description": clean_description(summary),
                "publishedAt": iso_utc(published_at),
                "tags": tags,
            }
        )
    return articles


def parse_feed(payload: bytes) -> list[dict]:
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as exc:
        raise SystemExit(f"DEV Community RSS is not valid XML: {exc}") from exc

    if root.tag == "rss":
        articles = parse_rss(root)
    elif root.tag == "{http://www.w3.org/2005/Atom}feed":
        articles = parse_atom(root)
    else:
        raise SystemExit(f"Unsupported DEV Community feed root element: {root.tag}")

    deduplicated: dict[str, dict] = {}
    for article in articles:
        deduplicated[article["url"]] = article

    normalized = list(deduplicated.values())
    normalized.sort(
        key=lambda article: (article["publishedAt"], article["url"]),
        reverse=True,
    )

    if not normalized:
        raise SystemExit("No valid DEV Community articles were found in the feed.")

    return normalized[:50]


def write_catalog(articles: list[dict]) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(articles, ensure_ascii=False, indent=2) + "\n"
    DATA_PATH.write_text(payload, encoding="utf-8")


def parse_iso_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def format_date(value: str) -> str:
    published = parse_iso_utc(value)
    return f"{MONTHS_EN[published.month - 1]} {published.day}, {published.year}"


def render_article(article: dict) -> str:
    title = html.escape(str(article["title"]).strip(), quote=True)
    url = html.escape(str(article["url"]).strip(), quote=True)
    published_at = format_date(str(article["publishedAt"]).strip())

    return f"""          <article>
            <span>DEV Community · {published_at} · English</span>
            <h3>{title}</h3>
            <a class="text-link" href="{url}" target="_blank" rel="noreferrer">Read on DEV Community ↗</a>
          </article>"""


def render_writing_section(articles: list[dict]) -> str:
    rendered = "\n".join(render_article(article) for article in articles[:4])
    return f"""    <section class="section writing-section" id="writing">
      <div class="container writing-grid">
        <div class="section-heading">
          <p class="eyebrow">Writing &amp; knowledge sharing</p>
          <h2>I write to make complex engineering ideas easier to apply.</h2>
          <p>
            My articles connect architecture theory with implementation reality — especially .NET, distributed systems, Domain-Driven Design, cloud, software quality, and the trade-offs behind technical decisions. My English long-form writing is published on DEV Community.
          </p>
          <a class="text-link" href="{PROFILE_URL}" target="_blank" rel="noreferrer">Read my articles on DEV Community ↗</a>
        </div>

        <div class="writing-cards article-list">
{START}
{rendered}
{END}
        </div>
      </div>
    </section>"""


def synchronize_rss_discovery(document: str) -> str:
    updated, count = RSS_PATTERN.subn(RSS_TAG, document, count=1)
    if count == 1:
        return updated

    anchor = (
        '  <link rel="alternate" hreflang="x-default" '
        'href="https://rodri-oliveira-dev.github.io/">'
    )
    if anchor not in document:
        raise SystemExit("Could not find an anchor for the English RSS discovery tag.")
    return document.replace(anchor, f"{anchor}\n{RSS_TAG}", 1)


def synchronize_writing_section(document: str, articles: list[dict]) -> str:
    section = render_writing_section(articles)
    updated, count = SECTION_PATTERN.subn(section, document, count=1)
    if count != 1:
        raise SystemExit("Could not locate the English writing section in en/index.html.")
    return updated


def synchronize_homepage(articles: list[dict]) -> None:
    document = EN_INDEX.read_text(encoding="utf-8")
    document = synchronize_rss_discovery(document)
    document = synchronize_writing_section(document, articles)
    EN_INDEX.write_text(document, encoding="utf-8")


def main() -> None:
    payload = fetch_feed()
    articles = parse_feed(payload)
    write_catalog(articles)
    synchronize_homepage(articles)

    print(f"Synchronized {len(articles)} DEV Community article(s).")
    print(f"Rendered {min(4, len(articles))} article(s) into en/index.html.")
    for article in articles[:4]:
        print(f"- {article['publishedAt']}: {article['title']}")


if __name__ == "__main__":
    main()
