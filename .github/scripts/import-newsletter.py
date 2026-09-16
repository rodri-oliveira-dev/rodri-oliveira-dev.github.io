#!/usr/bin/env python3
"""Import newsletter article metadata into assets/data/newsletter-articles.json."""

from __future__ import annotations

import html
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "assets/data/newsletter-articles.json"
SUMMARY_PATH = os.environ.get("GITHUB_STEP_SUMMARY", "")
OUTPUT_PATH = os.environ.get("GITHUB_OUTPUT", "")


def clean(value: object) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", html.unescape(str(value))).strip()


def canonical_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value.strip())
    host = (parsed.hostname or "").lower().rstrip(".")
    port = parsed.port
    netloc = host
    if port and not (
        (parsed.scheme.lower() == "http" and port == 80)
        or (parsed.scheme.lower() == "https" and port == 443)
    ):
        netloc = f"{host}:{port}"
    path = parsed.path or "/"
    return urllib.parse.urlunsplit(("https", netloc, path, "", ""))


def validate_url(value: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(value.strip())
        _ = parsed.port
    except ValueError as exc:
        raise SystemExit("URL inválida. Informe uma URL HTTP/HTTPS completa.") from exc

    if (
        not value
        or any(char.isspace() for char in value)
        or parsed.scheme.lower() not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise SystemExit("URL inválida. Informe uma URL HTTP/HTTPS completa.")

    return canonical_url(value)


def duplicate_key(value: str) -> str:
    parsed = urllib.parse.urlsplit(canonical_url(value))
    host = (parsed.hostname or "").lower()
    if host == "linkedin.com" or host.endswith(".linkedin.com"):
        host = "linkedin.com"
    path = parsed.path.rstrip("/") or "/"
    return f"{host}{path}"


class MetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.title_parts: list[str] = []
        self.in_title = False
        self.in_jsonld = False
        self.jsonld_parts: list[str] = []
        self.jsonld_blocks: list[str] = []
        self.time_datetimes: list[str] = []
        self.text_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = {k.lower(): v for k, v in attrs if k}
        tag = tag.lower()

        if tag == "meta":
            key = (attrs_map.get("property") or attrs_map.get("name") or "").strip().lower()
            value = (attrs_map.get("content") or "").strip()
            if key and value and key not in self.meta:
                self.meta[key] = value
        elif tag == "title":
            self.in_title = True
        elif tag == "script":
            if (attrs_map.get("type") or "").strip().lower() == "application/ld+json":
                self.in_jsonld = True
                self.jsonld_parts = []
        elif tag == "time":
            value = (attrs_map.get("datetime") or "").strip()
            if value:
                self.time_datetimes.append(value)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self.in_title = False
        elif tag == "script" and self.in_jsonld:
            self.in_jsonld = False
            raw = "".join(self.jsonld_parts).strip()
            if raw:
                self.jsonld_blocks.append(raw)

    def handle_data(self, data: str) -> None:
        self.text_parts.append(data)
        if self.in_title:
            self.title_parts.append(data)
        if self.in_jsonld:
            self.jsonld_parts.append(data)


def walk_jsonld(node: object):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk_jsonld(value)
    elif isinstance(node, list):
        for item in node:
            yield from walk_jsonld(item)


def jsonld_value(blocks: list[str], key: str) -> str:
    for raw in blocks:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for obj in walk_jsonld(data):
            value = obj.get(key)
            if isinstance(value, str) and value.strip():
                return clean(value)
    return ""


def normalize_date(value: object) -> str:
    value = clean(value)
    if not value:
        return ""

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        pass

    direct = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", value)
    if direct:
        return direct.group(1)

    months_pt = {
        "jan": 1, "janeiro": 1, "fev": 2, "fevereiro": 2,
        "mar": 3, "março": 3, "marco": 3, "abr": 4, "abril": 4,
        "mai": 5, "maio": 5, "jun": 6, "junho": 6,
        "jul": 7, "julho": 7, "ago": 8, "agosto": 8,
        "set": 9, "setembro": 9, "out": 10, "outubro": 10,
        "nov": 11, "novembro": 11, "dez": 12, "dezembro": 12,
    }
    pt_match = re.search(
        r"\b(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ.]+)\s+de\s+(\d{4})\b",
        value,
        re.IGNORECASE,
    )
    if pt_match:
        month = months_pt.get(pt_match.group(2).lower().rstrip("."))
        if month:
            try:
                return datetime(int(pt_match.group(3)), month, int(pt_match.group(1))).date().isoformat()
            except ValueError:
                return ""

    months_en = {
        "jan": 1, "january": 1, "feb": 2, "february": 2,
        "mar": 3, "march": 3, "apr": 4, "april": 4, "may": 5,
        "jun": 6, "june": 6, "jul": 7, "july": 7,
        "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
        "oct": 10, "october": 10, "nov": 11, "november": 11,
        "dec": 12, "december": 12,
    }
    en_match = re.search(r"\b([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})\b", value, re.IGNORECASE)
    if en_match:
        month = months_en.get(en_match.group(1).lower().rstrip("."))
        if month:
            try:
                return datetime(int(en_match.group(3)), month, int(en_match.group(2))).date().isoformat()
            except ValueError:
                return ""

    return ""


def visible_published_date(text: str) -> str:
    patterns = (
        r"Publicado em\s+\d{1,2}\s+de\s+[A-Za-zÀ-ÿ.]+\s+de\s+\d{4}",
        r"Published on\s+[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            normalized = normalize_date(match.group(0))
            if normalized:
                return normalized
    return ""


def choose(candidates: list[tuple[str, str]], fallback: str) -> tuple[str, str, bool]:
    for source, value in candidates:
        if value:
            return value, source, True
    if fallback:
        return clean(fallback), "fallback manual informado", False
    return "", "não disponível", False


def append_summary(lines: list[str]) -> None:
    if not SUMMARY_PATH:
        return
    with open(SUMMARY_PATH, "a", encoding="utf-8") as summary:
        summary.write("\n".join(lines) + "\n")


def set_output(name: str, value: str) -> None:
    if not OUTPUT_PATH:
        return
    with open(OUTPUT_PATH, "a", encoding="utf-8") as output:
        output.write(f"{name}={value}\n")


def main() -> None:
    url = validate_url(os.environ.get("ARTICLE_URL", "").strip())
    fallback_title = os.environ.get("FALLBACK_TITLE", "").strip()
    fallback_description = os.environ.get("FALLBACK_DESCRIPTION", "").strip()
    fallback_published_at = os.environ.get("FALLBACK_PUBLISHED_AT", "").strip()

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
    )

    fetch_error = ""
    http_status = ""
    final_url = url
    body = ""

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            http_status = str(response.status)
            final_url = canonical_url(response.geturl())
            charset = response.headers.get_content_charset() or "utf-8"
            body = response.read(2_500_000).decode(charset, errors="replace")
    except urllib.error.HTTPError as exc:
        http_status = str(exc.code)
        fetch_error = f"HTTP {exc.code}: {exc.reason}"
    except Exception as exc:
        fetch_error = f"{type(exc).__name__}: {exc}"

    parser = MetadataParser()
    if body:
        parser.feed(body)

    page_title = clean("".join(parser.title_parts))
    visible_text = clean(" ".join(parser.text_parts))

    title, title_source, title_auto = choose(
        [
            ("og:title", clean(parser.meta.get("og:title"))),
            ("JSON-LD headline", jsonld_value(parser.jsonld_blocks, "headline")),
            ("twitter:title", clean(parser.meta.get("twitter:title"))),
            ("<title>", page_title),
        ],
        fallback_title,
    )
    description, description_source, description_auto = choose(
        [
            ("og:description", clean(parser.meta.get("og:description"))),
            ("JSON-LD description", jsonld_value(parser.jsonld_blocks, "description")),
            ("meta description", clean(parser.meta.get("description"))),
            ("twitter:description", clean(parser.meta.get("twitter:description"))),
        ],
        fallback_description,
    )

    normalized_fallback_date = ""
    if fallback_published_at:
        normalized_fallback_date = normalize_date(fallback_published_at)
        if not normalized_fallback_date:
            raise SystemExit("Data manual inválida. Use o formato YYYY-MM-DD.")

    published_at, published_at_source, published_at_auto = choose(
        [
            ("article:published_time", normalize_date(parser.meta.get("article:published_time"))),
            ("JSON-LD datePublished", normalize_date(jsonld_value(parser.jsonld_blocks, "datePublished"))),
            ("<time datetime>", normalize_date(parser.time_datetimes[0]) if parser.time_datetimes else ""),
            ("texto visível da publicação", visible_published_date(visible_text)),
        ],
        normalized_fallback_date,
    )

    if not title:
        raise SystemExit("Não foi possível obter o título e nenhum fallback manual foi informado.")

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DATA_PATH.exists():
        try:
            articles = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"JSON existente inválido: {exc}") from exc
        if not isinstance(articles, list):
            raise SystemExit("O JSON existente deve conter uma lista de artigos.")
    else:
        articles = []

    current_keys = {duplicate_key(url), duplicate_key(final_url)}
    existing = next(
        (
            item
            for item in articles
            if isinstance(item, dict)
            and any(
                candidate and duplicate_key(str(candidate)) in current_keys
                for candidate in (item.get("url"), item.get("finalUrl"))
            )
        ),
        None,
    )
    if existing is not None:
        append_summary(
            [
                "# Importação de artigo da newsletter",
                "",
                "**Resultado:** rejeitado",
                "",
                "- **Motivo:** a URL já existe no JSON.",
                f"- **Artigo existente:** {existing.get('title') or 'artigo já cadastrado'}",
                f"- **URL normalizada:** {url}",
                "",
                "Nenhum arquivo foi alterado e nenhum Pull Request foi criado.",
            ]
        )
        raise SystemExit("A URL informada já está cadastrada no JSON.")

    articles.append(
        {
            "url": url,
            "finalUrl": final_url,
            "title": title,
            "description": description,
            "publishedAt": published_at,
            "metadataSource": {
                "title": title_source,
                "description": description_source,
                "publishedAt": published_at_source,
            },
            "addedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        }
    )
    articles.sort(
        key=lambda item: (
            item.get("publishedAt", "") if isinstance(item, dict) else "",
            item.get("url", "") if isinstance(item, dict) else "",
        ),
        reverse=True,
    )
    articles = articles[:12]
    DATA_PATH.write_text(json.dumps(articles, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    fetch_result = f"Falha na recuperação automática — {fetch_error}" if fetch_error else f"HTTP {http_status or 'desconhecido'}"
    result = "Metadados recuperados automaticamente" if title_auto and description_auto and published_at_auto else "Resultado parcial ou com fallback manual"

    append_summary(
        [
            "# Importação de artigo da newsletter",
            "",
            f"**Resultado:** {result}",
            "",
            "## Requisição",
            "",
            f"- **URL informada:** {url}",
            f"- **URL final:** {final_url}",
            f"- **Resposta:** {fetch_result}",
            "",
            "## Metadados selecionados",
            "",
            "| Campo | Valor | Fonte |",
            "|---|---|---|",
            f"| Título | {title} | {title_source} |",
            f"| Descrição | {description or '—'} | {description_source} |",
            f"| Data da publicação | {published_at or '—'} | {published_at_source} |",
            "",
            "## Persistência",
            "",
            f"- **Arquivo:** `{DATA_PATH.relative_to(ROOT)}`",
            "- **Ação no JSON:** novo registro adicionado",
            f"- **Artigos armazenados:** {len(articles)} / 12",
            "- **Ordenação:** publishedAt decrescente (mais recente primeiro)",
        ]
    )

    set_output("json_action", "inserted")
    print(result)
    print(f"Title source: {title_source}")
    print(f"Description source: {description_source}")
    print(f"Published date source: {published_at_source}")
    print(f"Published date: {published_at or 'not available'}")
    print("JSON action: inserted")
    if fetch_error:
        print(fetch_error)


if __name__ == "__main__":
    main()
