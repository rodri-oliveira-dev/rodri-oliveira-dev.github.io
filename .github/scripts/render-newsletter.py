#!/usr/bin/env python3
"""Render the four most recent LinkedIn newsletter articles into the PT-BR homepage."""

from __future__ import annotations

import html
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "assets/data/newsletter-articles.json"
INDEX_PATH = ROOT / "index.html"

START = "        <!-- NEWSLETTER_ARTICLES:START -->"
END = "        <!-- NEWSLETTER_ARTICLES:END -->"

MONTHS_PT = (
    "jan.", "fev.", "mar.", "abr.", "mai.", "jun.",
    "jul.", "ago.", "set.", "out.", "nov.", "dez.",
)


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def format_date(value: str) -> str:
    parsed = parse_date(value)
    return f"{parsed.day:02d} {MONTHS_PT[parsed.month - 1]} {parsed.year}"


def article_url(article: dict) -> str:
    return (article.get("finalUrl") or article.get("url") or "").strip()


def render_article(article: dict) -> str:
    title = html.escape(str(article["title"]).strip(), quote=True)
    url = html.escape(article_url(article), quote=True)
    published_at = format_date(str(article["publishedAt"]).strip())

    return f"""          <article>
            <span>Café com código · {published_at}</span>
            <h3>{title}</h3>
            <a class="text-link" href="{url}" target="_blank" rel="noreferrer">Ler no LinkedIn ↗</a>
          </article>"""


def main() -> None:
    if not DATA_PATH.exists():
        raise SystemExit(f"Arquivo não encontrado: {DATA_PATH}")

    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise SystemExit("newsletter-articles.json deve conter uma lista.")

    valid = []
    for article in raw:
        if not isinstance(article, dict):
            continue
        if not str(article.get("title") or "").strip():
            continue
        if not str(article.get("publishedAt") or "").strip():
            continue
        if not article_url(article):
            continue

        try:
            parse_date(str(article["publishedAt"]).strip())
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

    selected = valid[:4]
    if not selected:
        raise SystemExit("Nenhum artigo válido encontrado para renderização.")

    index = INDEX_PATH.read_text(encoding="utf-8")
    if START not in index or END not in index:
        raise SystemExit("Marcadores da newsletter não encontrados em index.html.")

    before, remainder = index.split(START, 1)
    _, after = remainder.split(END, 1)

    rendered = "\n".join(render_article(article) for article in selected)
    updated = f"{before}{START}\n{rendered}\n{END}{after}"

    INDEX_PATH.write_text(updated, encoding="utf-8")
    print(f"Rendered {len(selected)} article(s) into {INDEX_PATH.relative_to(ROOT)}.")
    for article in selected:
        print(f"- {article['publishedAt']}: {article['title']}")


if __name__ == "__main__":
    main()
