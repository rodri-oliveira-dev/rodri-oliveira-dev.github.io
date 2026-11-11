---
name: portfolio-content-sync
description: >-
  Manter importação e sincronização de artigos da newsletter,
  DEV Community e Hashnode, seus catálogos JSON, HTML renderizado,
  RSS, SEO, sitemap e automações por Pull Request.
---

# Sincronização de artigos e feeds

## Canais e artefatos

- Newsletter/LinkedIn → `assets/data/newsletter-articles.json` → homepage `index.html`, `newsletter/feed.xml` e SEO.
- DEV Community (inglês) → `assets/data/devto-articles.json` → `en/index.html` e SEO.
- Hashnode (espanhol) → `assets/data/hashnode-articles.json` → `es/index.html` e SEO.
- Scripts: `.github/scripts/import-newsletter.py`, `render-newsletter.py`, `generate-newsletter-feed.py`, `sync-devto-articles.py`, `sync-hashnode-articles.py` e `sync-seo.py`.

## Fluxo seguro

1. Preferir workflows existentes (`import-newsletter-article.yml`, `sync-devto-articles.yml`, `sync-hashnode-articles.yml`), sem recriar importadores paralelos.
2. Validar URLs de origem, metadados de publicação, datas, idioma, deduplicação, limites e fallback em caso de fonte indisponível.
3. Preservar catálogos dos outros idiomas; não traduzir automaticamente nem associar artigos distintos como equivalentes.
4. Gerar HTML, RSS e JSON-LD pelos scripts versionados. Conferir que o conteúdo visível corresponde ao catálogo.
5. Executar `python3 .github/scripts/sync-seo.py` enquanto as páginas estiverem alteradas. Revisar `lastmod` das homepages impactadas; não atualizar datas das demais apenas porque a automação rodou.
6. Preservar o padrão de branches/PRs e a ausência de push direto na `main`.

## Testes

- `python3 -m unittest discover -s .github/scripts -p 'test_sync_*articles.py'`
- `python3 -m unittest discover -s .github/scripts -p 'test_import_newsletter.py'`
- `python3 -m unittest discover -s .github/scripts -p 'test_sync_seo.py'`
- `git diff --check` e gates `Site validation`/`SEO validation`.

Uma atualização sem diff real deve terminar sem commit; não gerar `lastmod` artificial para forçar nova indexação.
