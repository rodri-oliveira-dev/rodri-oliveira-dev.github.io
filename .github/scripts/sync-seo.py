#!/usr/bin/env python3
"""Synchronize structured data, RSS discovery, and sitemap metadata."""

from __future__ import annotations

import json
import re
from html import unescape
import subprocess
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "assets/data/newsletter-articles.json"
DEVTO_DATA_PATH = ROOT / "assets/data/devto-articles.json"
HASHNODE_DATA_PATH = ROOT / "assets/data/hashnode-articles.json"
PT_INDEX = ROOT / "index.html"
EN_INDEX = ROOT / "en/index.html"
ES_INDEX = ROOT / "es/index.html"
SITEMAP_PATH = ROOT / "sitemap.xml"
RESUME_INDEX = ROOT / "curriculo/index.html"
SERVICE_PAGES = {
    "pt-BR": ROOT / "servicos/index.html",
    "en": ROOT / "en/services/index.html",
    "es-419": ROOT / "es/servicios/index.html",
}
SITE_URL = "https://rodri-oliveira-dev.github.io/"
SERVICE_URLS = {
    "pt-BR": f"{SITE_URL}servicos/",
    "en": f"{SITE_URL}en/services/",
    "es-419": f"{SITE_URL}es/servicios/",
}
RESUME_URL = f"{SITE_URL}curriculo/"
EN_URL = f"{SITE_URL}en/"
ES_URL = f"{SITE_URL}es/"
PT_FEED_URL = f"{SITE_URL}newsletter/feed.xml"
EN_FEED_URL = "https://dev.to/feed/rodri-oliveira-dev"
ES_FEED_URL = "https://rodri-oliveira-dev.hashnode.dev/rss.xml"
DEV_PROFILE_URL = "https://dev.to/rodri-oliveira-dev"
HASHNODE_PROFILE_URL = "https://hashnode.com/@rodri-oliveira-dev"
HASHNODE_PUBLICATION_URL = "https://rodri-oliveira-dev.hashnode.dev/"
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
JSON_LD_PATTERN = re.compile(
    r'(?P<open><script type="application/ld\+json">)\s*(?P<payload>\{.*?\})\s*(?P<close></script>)',
    re.DOTALL,
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

    if language == "es-419":
        return (
            '  <link rel="alternate" type="application/rss+xml" '
            'title="Arquitectura en Código — RSS" '
            f'href="{ES_FEED_URL}">'
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


def load_hashnode_articles() -> list[dict]:
    if not HASHNODE_DATA_PATH.exists():
        return []
    raw = json.loads(HASHNODE_DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise SystemExit("hashnode-articles.json deve conter uma lista.")
    valid: list[dict] = []
    for article in raw:
        if not isinstance(article, dict):
            continue
        title = str(article.get("title") or "").strip()
        published_at = str(article.get("publishedAt") or "").strip()
        url = str(article.get("url") or "").strip()
        url_parts = urlsplit(url)
        try:
            parsed = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        if (
            title
            and url_parts.scheme == "https"
            and url_parts.hostname == "rodri-oliveira-dev.hashnode.dev"
            and parsed.tzinfo is not None
        ):
            valid.append(article)
    valid.sort(
        key=lambda article: (str(article["publishedAt"]), str(article["url"])),
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


def hashnode_article_nodes(articles: list[dict]) -> tuple[list[dict], list[dict]]:
    nodes: list[dict] = []
    refs: list[dict] = []
    for article in articles[:4]:
        url = str(article["url"]).strip()
        node_id = f"{url}#article"
        node: dict = {
            "@type": "Article",
            "@id": node_id,
            "url": url,
            "headline": str(article["title"]).strip(),
            "datePublished": str(article["publishedAt"]).strip(),
            "inLanguage": "es-419",
            "author": {"@id": PERSON_ID},
            "isPartOf": {
                "@type": "Periodical",
                "name": "Arquitectura en Código",
                "url": HASHNODE_PUBLICATION_URL,
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
        HASHNODE_PROFILE_URL,
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
        # Keep the official current role unchanged across localized profiles.
        "jobTitle": "Senior Software Architect",
        "email": "mailto:rodrigodotnet@outlook.com",
        "image": f"{SITE_URL}assets/profile/rodrigo-about.webp",
        "description": (
            "Arquiteto de Software Sênior com mais de 20 anos de experiência em "
            "modernização, .NET, sistemas distribuídos, integrações e cloud."
            if is_pt
            else (
                "Arquitecto de Software Senior con más de 20 años de experiencia en "
                "modernización, .NET, sistemas distribuidos, integraciones y plataformas en la nube."
                if is_es
                else "Senior Software Architect with more than 20 years of experience in "
                "modernization, .NET, distributed systems, integrations, and cloud."
            )
        ),
        "sameAs": same_as,
        "knowsAbout": (
            [
                "Arquitetura de Software",
                ".NET",
                "C#",
                "Sistemas Distribuídos",
                "Integração de Sistemas e APIs",
                "Modernização de Sistemas Legados",
                "Domain-Driven Design",
                "Cloud Computing",
                "GCP",
                "AWS",
                "Arquitetura Orientada a Eventos",
                "APIs",
                "Observabilidade",
                "Segurança de Software",
                "Manutenibilidade",
                "Reliability Engineering",
                "Qualidade de Software",
            ]
            if is_pt
            else ([
                "Arquitectura de Software",
                ".NET",
                "C#",
                "Sistemas Distribuidos",
                "Integración de Sistemas y APIs",
                "Modernización de Sistemas Legados",
                "Domain-Driven Design",
                "Cloud Computing",
                "GCP",
                "AWS",
                "Arquitectura Orientada a Eventos",
                "Diseño de APIs",
                "Observabilidad",
                "Seguridad de Software",
                "Mantenibilidad",
                "Ingeniería de Confiabilidad",
                "Calidad de Software",
            ] if is_es else [
                "Software Architecture",
                ".NET",
                "C#",
                "Distributed Systems",
                "Systems Integration and APIs",
                "Legacy System Modernization",
                "Domain-Driven Design",
                "Cloud Computing",
                "GCP",
                "AWS",
                "Event-Driven Architecture",
                "API Design",
                "Observability",
                "Software Security",
                "Maintainability",
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
    hashnode_articles: list[dict] | None = None,
) -> dict:
    is_pt = language == "pt-BR"
    is_es = language == "es-419"
    variant = LANGUAGE_VARIANTS[language]
    page_url = variant["url"]
    profile_id = variant["profile_id"]
    if is_pt:
        article_graph, article_refs = article_nodes(articles)
    elif is_es:
        article_graph, article_refs = hashnode_article_nodes(hashnode_articles or [])
    else:
        article_graph, article_refs = ([], [])
    available_languages = available_languages or tuple(existing_home_variants())

    website = {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        "url": SITE_URL,
        "name": "Rodrigo de Oliveira",
        "alternateName": "Rodrigo de Oliveira — Senior Software Architect",
        "inLanguage": list(available_languages),
        "publisher": {"@id": PERSON_ID},
    }

    profile: dict = {
        "@type": "ProfilePage",
        "@id": profile_id,
        "url": page_url,
        "name": (
            "Rodrigo de Oliveira — Arquiteto de Software Sênior"
            if is_pt
            else (
                "Rodrigo de Oliveira — Arquitecto de Software Senior"
                if is_es
                else "Rodrigo de Oliveira — Senior Software Architect"
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
    hashnode_articles: list[dict] | None = None,
) -> str:
    payload = json.dumps(
        structured_data(
            language,
            articles,
            devto_enabled,
            available_languages,
            hashnode_articles,
        ),
        ensure_ascii=False,
        indent=2,
    ).replace("<", "\\u003c")
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
    hashnode_articles: list[dict] | None = None,
) -> str:
    block = structured_block(
        language,
        articles,
        devto_enabled,
        available_languages,
        hashnode_articles,
    )

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
    hashnode_articles: list[dict],
) -> None:
    html = path.read_text(encoding="utf-8")
    if language in ("pt-BR", "en", "es-419"):
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
        hashnode_articles,
    )
    path.write_text(html, encoding="utf-8")




def existing_service_variants() -> dict[str, Path]:
    """Return complete service translations, or fail on partial coverage."""
    existing = {language: path for language, path in SERVICE_PAGES.items() if path.is_file()}
    if existing and len(existing) != len(SERVICE_PAGES):
        missing = sorted(set(SERVICE_PAGES) - set(existing))
        raise SystemExit(f"Service-page translations are incomplete: {missing}.")
    return existing


def service_structured_data(language: str, html: str) -> dict:
    """Describe the actual published professional page, without fabricated offers."""
    title = re.search(r"<title>(.*?)</title>", html, re.DOTALL)
    description = re.search(r'<meta name="description" content="([^"]+)">', html)
    heading = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.DOTALL)
    services = re.findall(
        r'<article class="services-card">.*?<h3>(.*?)</h3>',
        html, re.DOTALL,
    )
    if not all((title, description, heading)) or len(services) != 4:
        raise SystemExit(f"Invalid service-page SEO source content: {language}.")

    def plain(value: str) -> str:
        """Remove inline HTML and decode entities from public headings."""
        return unescape(re.sub(r"<[^>]+>", "", value)).strip()

    url = SERVICE_URLS[language]
    page_id = f"{url}#webpage"
    service_id = f"{url}#service"
    breadcrumb_id = f"{url}#breadcrumb"
    page_title = plain(title.group(1))
    page_description = unescape(description.group(1)).strip()
    service_name = plain(heading.group(1))
    labels = {
        "pt-BR": ("Início", "Serviços"),
        "en": ("Home", "Services"),
        "es-419": ("Inicio", "Servicios"),
    }
    home_label, service_label = labels[language]
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                "@id": page_id,
                "url": url,
                "name": page_title,
                "description": page_description,
                "inLanguage": language,
                "isPartOf": {"@id": WEBSITE_ID},
                "mainEntity": {"@id": service_id},
                "breadcrumb": {"@id": breadcrumb_id},
            },
            {
                "@type": "Service",
                "@id": service_id,
                "name": service_name,
                "description": page_description,
                "serviceType": [plain(item) for item in services],
                "provider": {"@id": PERSON_ID},
                "mainEntityOfPage": {"@id": page_id},
            },
            {
                "@type": "BreadcrumbList",
                "@id": breadcrumb_id,
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": 1,
                        "name": home_label,
                        "item": LANGUAGE_VARIANTS[language]["url"],
                    },
                    {
                        "@type": "ListItem",
                        "position": 2,
                        "name": service_label,
                        "item": url,
                    },
                ],
            },
        ],
    }


def synchronize_service_page(language: str, path: Path) -> None:
    """Synchronize localized service hreflang and content-backed JSON-LD."""
    html = path.read_text(encoding="utf-8")
    urls = {code: SERVICE_URLS[code] for code in SERVICE_PAGES}

    if HREFLANG_BLOCK_PATTERN.search(html):
        html = synchronize_hreflang(html, urls)
    else:
        canonical = f'  <link rel="canonical" href="{SERVICE_URLS[language]}">'
        if html.count(canonical) != 1:
            raise SystemExit(f"Service canonical missing or duplicated: {language}.")
        alternates = "\n".join(
            f'  <link rel="alternate" hreflang="{LANGUAGE_VARIANTS[code]["hreflang"]}" href="{url}">'
            for code, url in urls.items()
        )
        alternates += (
            f'\n  <link rel="alternate" hreflang="x-default" '
            f'href="{SERVICE_URLS["pt-BR"]}">'
        )
        html = html.replace(canonical, canonical + "\n" + alternates, 1)

    payload = service_structured_data(language, html)
    rendered = json.dumps(payload, ensure_ascii=False, indent=2).replace("<", "\\u003c")
    indented = "\n".join("  " + line for line in rendered.splitlines())
    start = "  <!-- SEO_SERVICES_STRUCTURED_DATA:START -->"
    end = "  <!-- SEO_SERVICES_STRUCTURED_DATA:END -->"
    block = (
        f'{start}\n  <script type="application/ld+json">\n'
        f'{indented}\n  </script>\n{end}'
    )
    if start in html and end in html:
        before, remainder = html.split(start, 1)
        _, after = remainder.split(end, 1)
        html = before + block + after
    else:
        html = html.replace("</head>", block + "\n</head>", 1)
    path.write_text(html, encoding="utf-8")


def service_sitemap_blocks(
    paths: dict[str, Path],
    today: str,
    existing_lastmods: dict[str, str],
) -> str:
    """Build reciprocal service entries with lastmod from Git and existing sitemap."""
    if not paths:
        return ""
    alternate_links = "\n".join(
        f'    <xhtml:link rel="alternate" hreflang="{LANGUAGE_VARIANTS[code]["hreflang"]}" href="{escape(SERVICE_URLS[code])}"/>'
        for code in paths
    )
    alternate_links += (
        f'\n    <xhtml:link rel="alternate" hreflang="x-default" '
        f'href="{escape(SERVICE_URLS["pt-BR"])}"/>'
    )
    return "\n".join(
        f'''  <url>
    <loc>{escape(SERVICE_URLS[code])}</loc>
{alternate_links}
    <lastmod>{max_date(page_lastmod(SERVICE_URLS[code], path, today, existing_lastmods), git_last_modified(path))}</lastmod>
  </url>'''
        for code, path in paths.items()
    )

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

    lastmods: dict[str, str] = {}
    for entry in root.findall("{*}url"):
        url = (entry.findtext("{*}loc") or "").strip()
        lastmod = (entry.findtext("{*}lastmod") or "").strip()
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
    require_complete_spanish: bool = True,
) -> list[tuple[str, dict[str, Path]]]:
    """Return matching translations, requiring complete Spanish coverage by default."""
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


def normalize_case_study_structured_data(payload: dict) -> dict:
    """Connect a case study to the site's canonical author and website entities."""
    page_url = str(payload.get("url") or "").strip()
    if not page_url.startswith(SITE_URL):
        raise SystemExit(f"Case-study JSON-LD has an invalid URL: {page_url!r}.")

    payload["@id"] = f"{page_url}#article"
    payload["author"] = {
        "@type": "Person",
        "@id": PERSON_ID,
        "name": "Rodrigo de Oliveira",
        "url": SITE_URL,
    }
    payload["isPartOf"] = {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        "url": SITE_URL,
        "name": "Rodrigo de Oliveira",
    }
    payload["mainEntityOfPage"] = {
        "@type": "WebPage",
        "@id": page_url,
    }

    about = payload.get("about")
    if isinstance(about, dict) and about.get("@type") == "SoftwareSourceCode":
        repository = str(about.get("codeRepository") or "").strip().rstrip("/")
        if repository:
            about["@id"] = f"{repository}#software-source-code"

    return payload


def synchronize_case_study_structured_data(path: Path) -> None:
    html = path.read_text(encoding="utf-8")
    match = JSON_LD_PATTERN.search(html)
    if not match:
        raise SystemExit(f"Case-study JSON-LD not found in {path.relative_to(ROOT)}.")

    payload = normalize_case_study_structured_data(json.loads(match.group("payload")))
    json_text = json.dumps(payload, ensure_ascii=False, indent=2).replace("<", "\\u003c")
    json_text = "\n".join(f"  {line}" for line in json_text.splitlines())
    replacement = f'{match.group("open")}\n{json_text}\n  {match.group("close")}'
    path.write_text(
        f"{html[:match.start()]}{replacement}{html[match.end():]}",
        encoding="utf-8",
    )


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

    services_block = service_sitemap_blocks(
        existing_service_variants(), today, existing_lastmods
    )

    # O currículo tem somente uma versão em PT-BR: não há traduções para hreflang.
    resume_block = ""
    if RESUME_INDEX.exists():
        resume_lastmod = max_date(
            page_lastmod(RESUME_URL, RESUME_INDEX, today, existing_lastmods),
            git_last_modified(RESUME_INDEX),
        )
        resume_block = (
            "  <url>\n"
            f"    <loc>{escape(RESUME_URL)}</loc>\n"
            f"    <lastmod>{resume_lastmod}</lastmod>\n"
            "  </url>"
        )

    sitemap = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
{home_blocks}
{resume_block}
{services_block}
{case_blocks}
</urlset>
'''
    SITEMAP_PATH.write_text(sitemap, encoding="utf-8")


def validate_json_ld(path: Path) -> None:
    html = path.read_text(encoding="utf-8")
    match = JSON_LD_PATTERN.search(html)
    if not match:
        raise SystemExit(f"Bloco SEO JSON-LD não encontrado em {path.relative_to(ROOT)}.")
    json.loads(match.group("payload"))


def main() -> None:
    articles = load_articles()
    hashnode_articles = load_hashnode_articles()
    devto_enabled = DEVTO_DATA_PATH.exists()
    pt_dirty = file_was_dirty(PT_INDEX)
    en_dirty = file_was_dirty(EN_INDEX)
    home_variants = existing_home_variants()
    available_languages = tuple(home_variants)
    case_studies = discover_case_studies()

    for language, variant in home_variants.items():
        synchronize_html(
            variant["index"],
            language,
            articles,
            devto_enabled if language != "pt-BR" else False,
            available_languages,
            hashnode_articles,
        )
    for language, path in existing_service_variants().items():
        synchronize_service_page(language, path)
    for slug, paths in case_studies:
        synchronize_case_study_hreflang(slug, paths)
        for path in paths.values():
            synchronize_case_study_structured_data(path)
    write_sitemap(
        articles,
        pt_dirty,
        en_dirty,
        case_studies,
        home_variants,
    )

    for variant in home_variants.values():
        validate_json_ld(variant["index"])
    for _, paths in case_studies:
        for path in paths.values():
            validate_json_ld(path)
    for path in existing_service_variants().values():
        validate_json_ld(path)

    print("SEO artifacts synchronized:")
    print("- index.html: WebSite/ProfilePage/Person + latest Article entities + PT-BR RSS discovery")
    if devto_enabled:
        print("- en/index.html: WebSite/ProfilePage/Person + DEV Community RSS discovery")
    else:
        print("- en/index.html: migration-compatible newsletter RSS discovery (DEV catalog not initialized)")
    print("- es/index.html: WebSite/ProfilePage/Person + Hashnode Article entities + RSS discovery")
    print("- case studies: canonical Article/Person/WebSite/SoftwareSourceCode entity relationships")
    print("- service pages: reciprocal hreflang + WebPage/Service/BreadcrumbList")
    print("- sitemap.xml: homepage, services, case studies, resume + reliable lastmod")


if __name__ == "__main__":
    main()
