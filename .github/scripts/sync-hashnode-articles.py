#!/usr/bin/env python3
"""Synchronize the Spanish homepage with Rodrigo's Hashnode RSS feed."""

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
ES_INDEX = ROOT / "es/index.html"
DATA_PATH = ROOT / "assets/data/hashnode-articles.json"

FEED_URL = "https://rodri-oliveira-dev.hashnode.dev/rss.xml"
PUBLICATION_URL = "https://rodri-oliveira-dev.hashnode.dev/"
PROFILE_URL = "https://hashnode.com/@rodri-oliveira-dev"
ALLOWED_HOST = "rodri-oliveira-dev.hashnode.dev"
PUBLICATION_NAME = "Arquitectura en Código"

RSS_TAG = (
    '  <link rel="alternate" type="application/rss+xml" '
    f'title="{PUBLICATION_NAME} — RSS" href="{FEED_URL}">'
)
RSS_PATTERN = re.compile(
    r'^\s*<link rel="alternate" type="application/rss\+xml"[^>]*>\s*$',
    re.MULTILINE,
)
SECTION_PATTERN = re.compile(
    r'^    <section class="section writing-section" id="writing">.*?^    </section>',
    re.MULTILINE | re.DOTALL,
)
START = "        <!-- HASHNODE_ARTICLES:START -->"
END = "        <!-- HASHNODE_ARTICLES:END -->"
MONTHS_ES = (
    "ene.", "feb.", "mar.", "abr.", "may.", "jun.",
    "jul.", "ago.", "sept.", "oct.", "nov.", "dic.",
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
                raise SystemExit(f"Hashnode RSS returned HTTP {status}.")
            payload = response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise SystemExit(f"Could not download Hashnode RSS: {exc}") from exc

    if not payload.strip():
        raise SystemExit("Hashnode RSS returned an empty response.")
    return payload


def normalize_url(value: str) -> str:
    raw = value.strip()
    if not raw:
        return ""
    parts = urlsplit(raw)
    if parts.scheme != "https" or parts.hostname != ALLOWED_HOST:
        return ""
    path = parts.path.rstrip("/")
    if not path or path in ("", "/") or path == "/rss.xml":
        return ""
    return urlunsplit(("https", ALLOWED_HOST, path, "", ""))


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
        link = normalize_url(item.findtext("link") or item.findtext("guid") or "")
        published = (item.findtext("pubDate") or "").strip()
        if not title or not link or not published:
            continue
        try:
            published_at = parse_rss_date(published)
        except (TypeError, ValueError, OverflowError):
            continue
        tags = [
            (category.text or "").strip()
            for category in item.findall("category")
            if (category.text or "").strip()
        ]
        articles.append({
            "url": link,
            "title": title,
            "description": clean_description(item.findtext("description") or ""),
            "publishedAt": iso_utc(published_at),
            "tags": tags,
        })
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
        link = ""
        for candidate in entry.findall(f"{namespace}link"):
            if (candidate.attrib.get("rel") or "alternate") == "alternate":
                link = normalize_url(candidate.attrib.get("href") or "")
                if link:
                    break
        if not title or not link or not published:
            continue
        try:
            published_at = parse_atom_date(published)
        except ValueError:
            continue
        summary = (
            entry.findtext(f"{namespace}summary")
            or entry.findtext(f"{namespace}content")
            or ""
        )
        tags = [
            category.attrib.get("term", "").strip()
            for category in entry.findall(f"{namespace}category")
            if category.attrib.get("term", "").strip()
        ]
        articles.append({
            "url": link,
            "title": title,
            "description": clean_description(summary),
            "publishedAt": iso_utc(published_at),
            "tags": tags,
        })
    return articles


def parse_feed(payload: bytes) -> list[dict]:
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as exc:
        raise SystemExit(f"Hashnode RSS is not valid XML: {exc}") from exc
    if root.tag == "rss":
        articles = parse_rss(root)
    elif root.tag == "{http://www.w3.org/2005/Atom}feed":
        articles = parse_atom(root)
    else:
        raise SystemExit(f"Unsupported Hashnode feed root element: {root.tag}")

    deduplicated = {article["url"]: article for article in articles}
    normalized = list(deduplicated.values())
    normalized.sort(
        key=lambda article: (article["publishedAt"], article["url"]),
        reverse=True,
    )
    if not normalized:
        raise SystemExit("No valid Hashnode articles were found; existing data was preserved.")
    return normalized[:50]


def write_catalog(articles: list[dict]) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(
        json.dumps(articles, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def format_date(value: str) -> str:
    published = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return f"{published.day} {MONTHS_ES[published.month - 1]} {published.year}"


def render_article(article: dict) -> str:
    title = html.escape(str(article["title"]).strip(), quote=False)
    url = html.escape(str(article["url"]).strip(), quote=True)
    published_at = format_date(str(article["publishedAt"]).strip())
    return f'''          <article>
            <span>{PUBLICATION_NAME} · {published_at} · Español</span>
            <h3 lang="es-419">{title}</h3>
            <a class="text-link" href="{url}" hreflang="es" target="_blank" rel="noreferrer">Leer en Hashnode ↗</a>
          </article>'''


def synchronize_rss_discovery(document: str) -> str:
    updated, count = RSS_PATTERN.subn(RSS_TAG, document, count=1)
    if count == 1:
        return updated
    anchor = (
        '  <link rel="alternate" hreflang="x-default" '
        'href="https://rodri-oliveira-dev.github.io/">'
    )
    if anchor not in document:
        raise SystemExit("Could not find an anchor for the Spanish RSS discovery tag.")
    return document.replace(anchor, f"{anchor}\n{RSS_TAG}", 1)


def synchronize_writing_section(document: str, articles: list[dict]) -> str:
    if document.count(START) != 1 or document.count(END) != 1:
        raise SystemExit("Expected exactly one pair of Hashnode article markers.")
    section = SECTION_PATTERN.search(document)
    if section is None:
        raise SystemExit("Could not locate the Spanish writing section in es/index.html.")
    start = document.index(START)
    end = document.index(END)
    if not (section.start() <= start < end < section.end()):
        raise SystemExit("Hashnode article markers must be ordered within the writing section.")
    rendered = "\n" + "\n".join(render_article(article) for article in articles[:4]) + "\n"
    return document[: start + len(START)] + rendered + document[end:]


def render_homepage(articles: list[dict]) -> str:
    document = ES_INDEX.read_text(encoding="utf-8")
    document = synchronize_rss_discovery(document)
    return synchronize_writing_section(document, articles)


def main() -> None:
    # Fetch, parse, and validate both outputs before replacing either valid artifact.
    articles = parse_feed(fetch_feed())
    homepage = render_homepage(articles)
    write_catalog(articles)
    ES_INDEX.write_text(homepage, encoding="utf-8")
    print(f"Synchronized {len(articles)} Hashnode article(s).")
    print(f"Rendered {min(4, len(articles))} article(s) into es/index.html.")
    for article in articles[:4]:
        print(f"- {article['publishedAt']}: {article['title']}")


if __name__ == "__main__":
    main()
