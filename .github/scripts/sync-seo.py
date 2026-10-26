#!/usr/bin/env python3
"""Synchronize structured data, RSS discovery, and sitemap metadata."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import date, datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "assets/data/newsletter-articles.json"
DEVTO_DATA_PATH = ROOT / "assets/data/devto-articles.json"
PT_INDEX = ROOT / "index.html"
EN_INDEX = ROOT / "en/index.html"
ES_INDEX = ROOT / "es/index.html"
SITEMAP_PATH = ROOT / "sitemap.xml"

SITE_URL = "https://rodri-oliveira-dev.github.io/"
EN_URL = f"{SITE_URL}en/"
ES_URL = f"{SITE_URL}es/"
PT_FEED_URL = f"{SITE_URL}newsletter/feed.xml"
EN_FEED_URL = "https://dev.to/feed/rodri-oliveira-dev"
DEV_PROFILE_URL = "https://dev.to/rodri-oliveira-dev"
NEWSLETTER_URL = (
    "https://www.linkedin.com/newsletters/"
    "caf%C3%A9-com-c%C3%B3digo-6880618748047314945/"
)
PERSON_ID = f"{SITE_URL}#person"
WEBSITE_ID = f"{SITE_URL}#website"
PT_PROFILE_ID = f"{SITE_URL}#profile"
EN_PROFILE_ID = f"{EN_URL}#profile"
ES_PROFILE_ID = f"{ES_URL}#profile"

LANGUAGE_VARIANTS = {
    "pt-BR": {
        "html": "pt-BR",
        "hreflang": "pt-BR",
        "index": PT_INDEX,
        "url": SITE_URL,
        "case_root": ROOT / "case-studies",
        "case_url": f"{SITE_URL}case-studies/",
        "profile_id": PT_PROFILE_ID,
    },
    "en": {
        "html": "en",
        "hreflang": "en",
        "index": EN_INDEX,
        "url": EN_URL,
        "case_root": ROOT / "en/case-studies",
        "case_url": f"{EN_URL}case-studies/",
        "profile_id": EN_PROFILE_ID,
    },
    "es-419": {
        "html": "es-419",
        "hreflang": "es",
        "index": ES_INDEX,
        "url": ES_URL,
        "case_root": ROOT / "es/case-studies",
        "case_url": f"{ES_URL}case-studies/",
        "profile_id": ES_PROFILE_ID,
    },
}

SEO_START = "  <!-- SEO_STRUCTURED_DATA:START -->"
SEO_END = "  <!-- SEO_STRUCTURED_DATA:END -->"
RSS_DISCOVERY_PATTERN = re.compile(
    r'^\s*<link rel="alternate" type="application/rss\+xml"[^>]*>\s*$',
    re.MULTILINE,
)
HREFLANG_BLOCK_PATTERN = re.compile(
    r'(?:^[ \t]*<link rel="alternate" hreflang="[^"]+" href="[^"]+">[ \t]*$\n?)+',
    re.MULTILINE,
)


def rss_discovery(language: str, devto_enabled: bool) -> str:
    if language == "pt-BR":
        return (
            '  <link rel="alternate" type="application/rss+xml" '
            'title="Café com código — RSS" '
            f'href="{PT_FEED_URL}">'
        )

    if language == "en":
        if devto_enabled:
            return (
                '  <link rel="alternate" type="application/rss+xml" '
                'title="Rodrigo de Oliveira on DEV Community — RSS" '
                f'href="{EN_FEED_URL}">'
            )

        # Migration compatibility: until the DEV catalog is initialized by the
        # dedicated sync workflow, keep the already-published English page stable.
        return (
            '  <link rel="alternate" type="application/rss+xml" '
            'title="Café com código — RSS" '
            f'href="{PT_FEED_URL}">'
        )

    raise SystemExit(f"Idioma sem RSS configurado: {language}.")


def existing_home_variants() -> dict[str, dict]:
    """Return configured home variants that exist on disk."""
    return {
        language: variant
        for language, variant in LANGUAGE_VARIANTS.items()
        if variant["index"].is_file()
    }


def article_url(article: dict) -> str:
    return (article.get("finalUrl") or article.get("url") or "").strip()


def load_articles() -> list[dict]:
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
            date.fromisoformat(published_at)
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
    return valid


def article_nodes(articles: list[dict]) -> tuple[list[dict], list[dict]]:
    nodes: list[dict] = []
    refs: list[dict] = []

    for article in articles[:4]:
        url = article_url(article)
        node_id = f"{url}#article"
        node: dict = {
            "@type": "Article",
            "@id": node_id,
            "url": url,
            "headline": str(article["title"]).strip(),
            "datePublished": str(article["publishedAt"]).strip(),
            "inLanguage": "pt-BR",
            "author": {"@id": PERSON_ID},
            "isPartOf": {
                "@type": "Periodical",
                "name": "Café com código",
                "url": NEWSLETTER_URL,
            },
        }
        description = str(article.get("description") or "").strip()
        if description:
            node["description"] = description
        nodes.append(node)
        refs.append({"@id": node_id})

    return nodes, refs


def person_node(language: str, devto_enabled: bool) -> dict:
    is_pt = language == "pt-BR"
    is_es = language == "es-419"
    same_as = [
        "https://github.com/rodri-oliveira-dev",
        "https://www.linkedin.com/in/rodri-oliveira-dev",
    ]
    if not is_pt and devto_enabled:
        same_as.append(DEV_PROFILE_URL)
    same_as.extend(
        [
            "https://medium.com/@rodrigodotnet",
            "https://www.nuget.org/profiles/rodri-oliveira-dev",
        ]
    )

    return {
        "@type": "Person",
        "@id": PERSON_ID,
        "name": "Rodrigo de Oliveira",
        "url": SITE_URL,
        "jobTitle": (
            "Arquiteto de Software"
            if is_pt
            else "Arquitecto de Software" if is_es else "Software Architect"
        ),
        "email": "mailto:rodrigodotnet@outlook.com",
        "image": f"{SITE_URL}assets/profile/rodrigo-about.webp",
        "description": (
            "Arquiteto de Software com mais de 20 anos de experiência em sistemas "
            "corporativos, .NET, sistemas distribuídos, integrações e cloud."
            if is_pt
            else (
                "Arquitecto de Software con más de 20 años de experiencia en software "
                "empresarial, .NET, sistemas distribuidos, integraciones y cloud."
                if is_es
                else "Software Architect with more than 20 years of experience in enterprise "
                "software, .NET, distributed systems, integrations, and cloud."
            )
        ),
        "sameAs": same_as,
        "knowsAbout": (
            [
                "Arquitetura de Software",
                ".NET",
                "C#",
                "Sistemas Distribuídos",
                "Domain-Driven Design",
                "GCP",
                "AWS",
                "Arquitetura Orientada a Eventos",
                "APIs",
                "Observabilidade",
                "Reliability Engineering",
                "Qualidade de Software",
            ]
            if is_pt
            else ([
                "Arquitectura de Software",
                ".NET",
                "C#",
                "Sistemas Distribuidos",
                "Domain-Driven Design",
                "GCP",
                "AWS",
                "Arquitectura Orientada a Eventos",
                "Diseño de APIs",
                "Observabilidad",
                "Ingeniería de Confiabilidad",
                "Calidad de Software",
            ] if is_es else [
                "Software Architecture",
                ".NET",
                "C#",
                "Distributed Systems",
                "Domain-Driven Design",
                "GCP",
                "AWS",
                "Event-Driven Architecture",
                "API Design",
                "Observability",
                "Reliability Engineering",
                "Software Quality",
            ])
        ),
    }


def structured_data(
    language: str,
    articles: list[dict],
    devto_enabled: bool,
    available_languages: tuple[str, ...] | None = None,
) -> dict:
    is_pt = language == "pt-BR"
    is_es = language == "es-419"
    variant = LANGUAGE_VARIANTS[language]
    page_url = variant["url"]
    profile_id = variant["profile_id"]
    article_graph, article_refs = article_nodes(articles) if is_pt else ([], [])
    available_languages = available_languages or tuple(existing_home_variants())

    website = {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        "url": SITE_URL,
        "name": "Rodrigo de Oliveira",
        "alternateName": "Rodrigo de Oliveira — Software Architect",
        "inLanguage": list(available_languages),
        "publisher": {"@id": PERSON_ID},
    }

    profile: dict = {
        "@type": "ProfilePage",
        "@id": profile_id,
        "url": page_url,
        "name": (
            "Rodrigo de Oliveira — Arquiteto de Software"
            if is_pt
            else (
                "Rodrigo de Oliveira — Arquitecto de Software"
                if is_es
                else "Rodrigo de Oliveira — Software Architect"
            )
        ),
        "inLanguage": language,
        "isPartOf": {"@id": WEBSITE_ID},
        "mainEntity": {"@id": PERSON_ID},
    }
    if article_refs:
        profile["hasPart"] = article_refs

    return {
        "@context": "https://schema.org",
        "@graph": [
            website,
            profile,
            person_node(language, devto_enabled),
            *article_graph,
        ],
    }


def structured_block(
    language: str,
    articles: list[dict],
    devto_enabled: bool,
    available_languages: tuple[str, ...] | None = None,
) -> str:
    payload = json.dumps(
        structured_data(language, articles, devto_enabled, available_languages),
        ensure_ascii=False,
        indent=2,
    )
    indented = "\n".join(f"  {line}" for line in payload.splitlines())
    return (
        f"{SEO_START}\n"
        '  <script type="application/ld+json">\n'
        f"{indented}\n"
        "  </script>\n"
        f"{SEO_END}"
    )


def replace_structured_data(
    html: str,
    language: str,
    articles: list[dict],
    devto_enabled: bool,
    available_languages: tuple[str, ...] | None = None,
) -> str:
    block = structured_block(language, articles, devto_enabled, available_languages)

    if SEO_START in html and SEO_END in html:
        before, remainder = html.split(SEO_START, 1)
        _, after = remainder.split(SEO_END, 1)
        return f"{before}{block}{after}"

    pattern = re.compile(
        r'  <script type="application/ld\+json">\s*\{.*?\}\s*</script>',
        re.DOTALL,
    )
    updated, count = pattern.subn(block, html, count=1)
    if count != 1:
        raise SystemExit(f"JSON-LD principal não encontrado para {language}.")
    return updated


def ensure_rss_discovery(
    html: str,
    language: str,
    devto_enabled: bool,
) -> str:
    expected = rss_discovery(language, devto_enabled)
    updated, count = RSS_DISCOVERY_PATTERN.subn(expected, html, count=1)
    if count == 1:
        return updated

    anchor = '  <link rel="alternate" hreflang="x-default" href="https://rodri-oliveira-dev.github.io/">'
    if anchor not in html:
        raise SystemExit("Link hreflang x-default não encontrado para inserir RSS discovery.")
    return html.replace(anchor, f"{anchor}\n{expected}", 1)


def synchronize_hreflang(html: str, variants: dict[str, str]) -> str:
    """Replace hreflang links using only page variants known to exist."""
    links = [
        f'  <link rel="alternate" hreflang="{LANGUAGE_VARIANTS[language]["hreflang"]}" href="{url}">'
        for language, url in variants.items()
    ]
    links.append(
        f'  <link rel="alternate" hreflang="x-default" href="{variants["pt-BR"]}">'
    )
    block = "\n".join(links) + "\n"
    updated, count = HREFLANG_BLOCK_PATTERN.subn(block, html, count=1)
    if count != 1:
        raise SystemExit("Bloco hreflang não encontrado para sincronização.")
    return updated


def synchronize_html(
    path: Path,
    language: str,
    articles: list[dict],
    devto_enabled: bool,
    available_languages: tuple[str, ...],
) -> None:
    html = path.read_text(encoding="utf-8")
    if language in ("pt-BR", "en"):
        html = ensure_rss_discovery(html, language, devto_enabled)
    if "es-419" in available_languages:
        html = synchronize_hreflang(
            html,
            {
                code: LANGUAGE_VARIANTS[code]["url"]
                for code in available_languages
            },
        )
    html = replace_structured_data(
        html,
        language,
        articles,
        devto_enabled,
        available_languages,
    )
    path.write_text(html, encoding="utf-8")


def git_last_modified(path: Path) -> str:
    relative = path.relative_to(ROOT).as_posix()
    try:
        output = subprocess.check_output(
            ["git", "log", "-1", "--format=%cs", "--", relative],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        if output:
            date.fromisoformat(output)
            return output
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        pass
    return datetime.now(timezone.utc).date().isoformat()


def file_was_dirty(path: Path) -> bool:
    relative = path.relative_to(ROOT).as_posix()
    try:
        tracked = subprocess.run(
            ["git", "ls-files", "--error-unmatch", "--", relative],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if tracked.returncode != 0:
            return path.exists()
        result = subprocess.run(
            ["git", "diff", "--quiet", "HEAD", "--", relative],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return result.returncode != 0
    except FileNotFoundError:
        return False


def max_date(*values: str) -> str:
    parsed = [date.fromisoformat(value) for value in values if value]
    return max(parsed).isoformat()


def load_sitemap_lastmods() -> dict[str, str]:
    """Read committed lastmod values before regenerating the sitemap."""
    if not SITEMAP_PATH.exists():
        return {}

    try:
        root = ET.parse(SITEMAP_PATH).getroot()
    except ET.ParseError as error:
        raise SystemExit(f"Invalid sitemap XML: {error}") from error

    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    lastmods: dict[str, str] = {}
    for entry in root.findall("sm:url", namespace):
        url = (entry.findtext("sm:loc", namespaces=namespace) or "").strip()
        lastmod = (entry.findtext("sm:lastmod", namespaces=namespace) or "").strip()
        if not url or not lastmod:
            continue
        try:
            date.fromisoformat(lastmod)
        except ValueError as error:
            raise SystemExit(f"Invalid sitemap lastmod for {url}: {lastmod}") from error
        lastmods[url] = lastmod
    return lastmods


def page_lastmod(
    url: str,
    path: Path,
    today: str,
    existing_lastmods: dict[str, str],
) -> str:
    """Resolve lastmod without changing clean pages when the calendar advances."""
    if file_was_dirty(path):
        return today
    existing_lastmod = existing_lastmods.get(url)
    return existing_lastmod if existing_lastmod else git_last_modified(path)


def discover_case_studies(
    require_complete_spanish: bool = False,
) -> list[tuple[str, dict[str, Path]]]:
    """Return PT/EN pairs plus any progressively translated Spanish pages."""
    pages = {
        language: {
            path.parent.name: path
            for path in variant["case_root"].glob("*/index.html")
        }
        for language, variant in LANGUAGE_VARIANTS.items()
    }
    pt_pages = pages["pt-BR"]
    en_pages = pages["en"]
    es_pages = pages["es-419"]

    missing_en = sorted(set(pt_pages) - set(en_pages))
    missing_pt = sorted(set(en_pages) - set(pt_pages))
    if missing_en or missing_pt:
        raise SystemExit(
            "Case studies must be bilingual pairs. "
            f"Missing EN: {missing_en}; missing PT-BR: {missing_pt}."
        )

    orphan_es = sorted(set(es_pages) - set(pt_pages))
    if orphan_es:
        raise SystemExit(f"Spanish case studies without PT-BR/EN source: {orphan_es}.")
    if require_complete_spanish and (
        not ES_INDEX.is_file() or set(es_pages) != set(pt_pages)
    ):
        missing_es = sorted(set(pt_pages) - set(es_pages))
        raise SystemExit(
            "Spanish coverage is incomplete. "
            f"Homepage exists: {ES_INDEX.is_file()}; missing case studies: {missing_es}."
        )

    discovered = []
    for slug in sorted(pt_pages):
        variants = {"pt-BR": pt_pages[slug], "en": en_pages[slug]}
        if slug in es_pages:
            variants["es-419"] = es_pages[slug]
        discovered.append((slug, variants))
    return discovered


def case_study_sitemap_block(
    slug: str,
    paths: dict[str, Path],
    today: str,
    existing_lastmods: dict[str, str],
) -> str:
    urls = {
        language: f'{LANGUAGE_VARIANTS[language]["case_url"]}{slug}/'
        for language in paths
    }
    alternates = "\n".join(
        f'    <xhtml:link rel="alternate" hreflang="{LANGUAGE_VARIANTS[language]["hreflang"]}" href="{escape(url)}"/>'
        for language, url in urls.items()
    )
    alternates = (
        f'{alternates}\n    <xhtml:link rel="alternate" hreflang="x-default" '
        f'href="{escape(urls["pt-BR"])}"/>'
    )
    blocks = []
    for language, path in paths.items():
        url = urls[language]
        lastmod = page_lastmod(url, path, today, existing_lastmods)
        blocks.append(
            f'''  <url>
    <loc>{escape(url)}</loc>
{alternates}
    <lastmod>{lastmod}</lastmod>
  </url>'''
        )
    return "\n".join(blocks)


def synchronize_case_study_hreflang(
    slug: str,
    paths: dict[str, Path],
) -> None:
    """Add reciprocal alternates once a Spanish translation exists."""
    if "es-419" not in paths:
        return
    urls = {
        language: f'{LANGUAGE_VARIANTS[language]["case_url"]}{slug}/'
        for language in paths
    }
    for path in paths.values():
        html = path.read_text(encoding="utf-8")
        path.write_text(synchronize_hreflang(html, urls), encoding="utf-8")


def write_sitemap(
    articles: list[dict],
    pt_dirty: bool,
    en_dirty: bool,
    case_studies: list[tuple[str, dict[str, Path]]],
    home_variants: dict[str, dict],
) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    existing_lastmods = load_sitemap_lastmods()
    latest_article = (
        str(articles[0]["publishedAt"]).strip() if articles else git_last_modified(PT_INDEX)
    )
    pt_page_lastmod = today if pt_dirty else existing_lastmods.get(SITE_URL)
    if not pt_page_lastmod:
        pt_page_lastmod = git_last_modified(PT_INDEX)
    en_lastmod = today if en_dirty else existing_lastmods.get(EN_URL)
    if not en_lastmod:
        en_lastmod = git_last_modified(EN_INDEX)
    pt_lastmod = max_date(latest_article, pt_page_lastmod)
    case_blocks = "\n".join(
        case_study_sitemap_block(
            slug,
            paths,
            today,
            existing_lastmods,
        )
        for slug, paths in case_studies
    )

    home_urls = {language: variant["url"] for language, variant in home_variants.items()}
    home_lastmods = {"pt-BR": pt_lastmod, "en": en_lastmod}
    if "es-419" in home_variants:
        home_lastmods["es-419"] = page_lastmod(
            ES_URL,
            ES_INDEX,
            today,
            existing_lastmods,
        )
    home_alternates = "\n".join(
        f'    <xhtml:link rel="alternate" hreflang="{LANGUAGE_VARIANTS[language]["hreflang"]}" href="{escape(url)}"/>'
        for language, url in home_urls.items()
    )
    home_alternates = (
        f'{home_alternates}\n    <xhtml:link rel="alternate" hreflang="x-default" '
        f'href="{escape(SITE_URL)}"/>'
    )
    home_blocks = "\n".join(
        f'''  <url>
    <loc>{escape(url)}</loc>
{home_alternates}
    <lastmod>{home_lastmods[language]}</lastmod>
  </url>'''
        for language, url in home_urls.items()
    )

    sitemap = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
{home_blocks}
{case_blocks}
</urlset>
'''
    SITEMAP_PATH.write_text(sitemap, encoding="utf-8")


def validate_json_ld(path: Path) -> None:
    html = path.read_text(encoding="utf-8")
    match = re.search(
        rf"{re.escape(SEO_START)}\s*<script type=\"application/ld\+json\">\s*(\{{.*?\}})\s*</script>\s*{re.escape(SEO_END)}",
        html,
        re.DOTALL,
    )
    if not match:
        raise SystemExit(f"Bloco SEO JSON-LD não encontrado em {path.relative_to(ROOT)}.")
    json.loads(match.group(1))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--require-complete-spanish",
        action="store_true",
        help="Fail unless the Spanish homepage and every Spanish case study exist.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    articles = load_articles()
    devto_enabled = DEVTO_DATA_PATH.exists()
    pt_dirty = file_was_dirty(PT_INDEX)
    en_dirty = file_was_dirty(EN_INDEX)
    home_variants = existing_home_variants()
    available_languages = tuple(home_variants)
    case_studies = discover_case_studies(args.require_complete_spanish)

    for language, variant in home_variants.items():
        synchronize_html(
            variant["index"],
            language,
            articles,
            devto_enabled if language != "pt-BR" else False,
            available_languages,
        )
    for slug, paths in case_studies:
        synchronize_case_study_hreflang(slug, paths)
    write_sitemap(
        articles,
        pt_dirty,
        en_dirty,
        case_studies,
        home_variants,
    )

    for variant in home_variants.values():
        validate_json_ld(variant["index"])

    print("SEO artifacts synchronized:")
    print("- index.html: WebSite/ProfilePage/Person + latest Article entities + PT-BR RSS discovery")
    if devto_enabled:
        print("- en/index.html: WebSite/ProfilePage/Person + DEV Community RSS discovery")
    else:
        print("- en/index.html: migration-compatible newsletter RSS discovery (DEV catalog not initialized)")
    print("- sitemap.xml: existing language variants + reciprocal hreflang + reliable lastmod")


if __name__ == "__main__":
    main()
