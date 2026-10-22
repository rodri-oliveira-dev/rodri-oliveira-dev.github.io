#!/usr/bin/env python3
"""Synchronize structured data, RSS discovery, and sitemap metadata."""

from __future__ import annotations

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
SITEMAP_PATH = ROOT / "sitemap.xml"

SITE_URL = "https://rodri-oliveira-dev.github.io/"
EN_URL = f"{SITE_URL}en/"
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

SEO_START = "  <!-- SEO_STRUCTURED_DATA:START -->"
SEO_END = "  <!-- SEO_STRUCTURED_DATA:END -->"
RSS_DISCOVERY_PATTERN = re.compile(
    r'^\s*<link rel="alternate" type="application/rss\+xml"[^>]*>\s*$',
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
        "jobTitle": "Arquiteto de Software" if is_pt else "Software Architect",
        "email": "mailto:rodrigodotnet@outlook.com",
        "image": f"{SITE_URL}assets/profile/rodrigo-about.webp",
        "description": (
            "Arquiteto de Software com mais de 20 anos de experiência em sistemas "
            "corporativos, .NET, sistemas distribuídos, integrações e cloud."
            if is_pt
            else "Software Architect with more than 20 years of experience in enterprise "
            "software, .NET, distributed systems, integrations, and cloud."
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
            else [
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
            ]
        ),
    }


def structured_data(
    language: str,
    articles: list[dict],
    devto_enabled: bool,
) -> dict:
    is_pt = language == "pt-BR"
    page_url = SITE_URL if is_pt else EN_URL
    profile_id = PT_PROFILE_ID if is_pt else EN_PROFILE_ID
    article_graph, article_refs = article_nodes(articles) if is_pt else ([], [])

    website = {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        "url": SITE_URL,
        "name": "Rodrigo de Oliveira",
        "alternateName": "Rodrigo de Oliveira — Software Architect",
        "inLanguage": ["pt-BR", "en"],
        "publisher": {"@id": PERSON_ID},
    }

    profile: dict = {
        "@type": "ProfilePage",
        "@id": profile_id,
        "url": page_url,
        "name": (
            "Rodrigo de Oliveira — Arquiteto de Software"
            if is_pt
            else "Rodrigo de Oliveira — Software Architect"
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
) -> str:
    payload = json.dumps(
        structured_data(language, articles, devto_enabled),
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
) -> str:
    block = structured_block(language, articles, devto_enabled)

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


def synchronize_html(
    path: Path,
    language: str,
    articles: list[dict],
    devto_enabled: bool,
) -> None:
    html = path.read_text(encoding="utf-8")
    html = ensure_rss_discovery(html, language, devto_enabled)
    html = replace_structured_data(html, language, articles, devto_enabled)
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
        result = subprocess.run(
            ["git", "status", "--porcelain", "--", relative],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        return bool(result.stdout.strip())
    except (subprocess.CalledProcessError, FileNotFoundError):
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


def discover_case_studies() -> list[tuple[str, Path, Path]]:
    """Return complete bilingual case-study pairs ordered by slug."""
    pt_root = ROOT / "case-studies"
    en_root = ROOT / "en/case-studies"
    pt_pages = {path.parent.name: path for path in pt_root.glob("*/index.html")}
    en_pages = {path.parent.name: path for path in en_root.glob("*/index.html")}

    missing_en = sorted(set(pt_pages) - set(en_pages))
    missing_pt = sorted(set(en_pages) - set(pt_pages))
    if missing_en or missing_pt:
        raise SystemExit(
            "Case studies must be bilingual pairs. "
            f"Missing EN: {missing_en}; missing PT-BR: {missing_pt}."
        )

    return [(slug, pt_pages[slug], en_pages[slug]) for slug in sorted(pt_pages)]


def case_study_sitemap_block(
    slug: str,
    pt_path: Path,
    en_path: Path,
    today: str,
    existing_lastmods: dict[str, str],
) -> str:
    pt_url = f"{SITE_URL}case-studies/{slug}/"
    en_url = f"{EN_URL}case-studies/{slug}/"
    pt_lastmod = page_lastmod(pt_url, pt_path, today, existing_lastmods)
    en_lastmod = page_lastmod(en_url, en_path, today, existing_lastmods)
    return f'''  <url>
    <loc>{escape(pt_url)}</loc>
    <xhtml:link rel="alternate" hreflang="pt-BR" href="{escape(pt_url)}"/>
    <xhtml:link rel="alternate" hreflang="en" href="{escape(en_url)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="{escape(pt_url)}"/>
    <lastmod>{pt_lastmod}</lastmod>
  </url>
  <url>
    <loc>{escape(en_url)}</loc>
    <xhtml:link rel="alternate" hreflang="pt-BR" href="{escape(pt_url)}"/>
    <xhtml:link rel="alternate" hreflang="en" href="{escape(en_url)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="{escape(pt_url)}"/>
    <lastmod>{en_lastmod}</lastmod>
  </url>'''


def write_sitemap(
    articles: list[dict],
    pt_dirty: bool,
    en_dirty: bool,
    case_studies: list[tuple[str, Path, Path]],
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
            pt_path,
            en_path,
            today,
            existing_lastmods,
        )
        for slug, pt_path, en_path in case_studies
    )

    sitemap = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>{escape(SITE_URL)}</loc>
    <xhtml:link rel="alternate" hreflang="pt-BR" href="{escape(SITE_URL)}"/>
    <xhtml:link rel="alternate" hreflang="en" href="{escape(EN_URL)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="{escape(SITE_URL)}"/>
    <lastmod>{pt_lastmod}</lastmod>
  </url>
  <url>
    <loc>{escape(EN_URL)}</loc>
    <xhtml:link rel="alternate" hreflang="pt-BR" href="{escape(SITE_URL)}"/>
    <xhtml:link rel="alternate" hreflang="en" href="{escape(EN_URL)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="{escape(SITE_URL)}"/>
    <lastmod>{en_lastmod}</lastmod>
  </url>
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


def main() -> None:
    articles = load_articles()
    devto_enabled = DEVTO_DATA_PATH.exists()
    pt_dirty = file_was_dirty(PT_INDEX)
    en_dirty = file_was_dirty(EN_INDEX)
    case_studies = discover_case_studies()

    synchronize_html(PT_INDEX, "pt-BR", articles, False)
    synchronize_html(EN_INDEX, "en", articles, devto_enabled)
    write_sitemap(
        articles,
        pt_dirty,
        en_dirty,
        case_studies,
    )

    validate_json_ld(PT_INDEX)
    validate_json_ld(EN_INDEX)

    print("SEO artifacts synchronized:")
    print("- index.html: WebSite/ProfilePage/Person + latest Article entities + PT-BR RSS discovery")
    if devto_enabled:
        print("- en/index.html: WebSite/ProfilePage/Person + DEV Community RSS discovery")
    else:
        print("- en/index.html: migration-compatible newsletter RSS discovery (DEV catalog not initialized)")
    print("- sitemap.xml: portfolio + bilingual case studies hreflang + reliable lastmod")


if __name__ == "__main__":
    main()
