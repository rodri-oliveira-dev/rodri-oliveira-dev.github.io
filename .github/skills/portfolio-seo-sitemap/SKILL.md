---
name: portfolio-seo-sitemap
description: >-
  Manter SEO técnico e o sitemap do portfólio estático: lastmod, canonical,
  hreflang, JSON-LD, metadados, páginas indexáveis e sincronização determinística.
  Usar em qualquer alteração do site ou das suas rotas públicas.
---

# SEO e sitemap do portfólio

## Fontes de verdade

- `.github/scripts/sync-seo.py` gera ou sincroniza SEO das homepages, serviços, estudos de caso e `sitemap.xml`.
- `.github/scripts/test_sync_seo.py` verifica `lastmod` e outros contratos determinísticos.
- `.github/workflows/seo-validation.yml` valida consistência, drift, JSON-LD e URLs indexáveis.
- `robots.txt` aponta para o sitemap público. Consulte `.github/AUTOMATION.md` antes de mudar a estratégia.

## Procedimento obrigatório

1. Identificar as URLs indexáveis impactadas por HTML, catálogos de conteúdo, CSS, JS, imagens ou elementos compartilhados.
2. Atualizar conteúdo e metadados correspondentes: título, description, canonical, Open Graph/Twitter, `hreflang` recíproco e JSON-LD, quando aplicável.
3. Com os arquivos ainda alterados no working tree, rodar `python3 .github/scripts/sync-seo.py`.
4. Comparar `sitemap.xml` antes/depois. Cada URL realmente afetada deve ter `<lastmod>` da alteração (formato `YYYY-MM-DD`, UTC); páginas não afetadas devem manter a data.
5. Para mudanças apenas em recursos compartilhados, identificar todas as páginas que os utilizam e atualizar seus `<lastmod>` diretamente, pois o sincronizador acompanha principalmente os arquivos HTML. Rodar o gerador novamente e verificar estabilidade.
6. Rodar `python3 -m unittest discover -s .github/scripts -p 'test_sync_seo.py'` e `git diff --check`; exigir aprovação do gate `SEO validation` antes de considerar concluído.

## Contratos

- Homepages: `/`, `/en/`, `/es/`; serviços: `/servicos/`, `/en/services/`, `/es/servicios/`; estudos de caso: versões equivalentes; currículos: `/curriculo/`, `/en/resume/`, `/es/curriculo/`.
- Preservar `hreflang` `pt-BR`, `en`, `es`, `x-default` somente quando existir variante correspondente. Não inventar traduções.
- Reutilizar identidades canônicas `#person` e `#website`, com dados estruturados coerentes com o texto realmente visível.
- Não inserir `Offer`, preços, avaliações, estatísticas ou resultados não comprovados. Não adicionar ao sitemap rotas de redirecionamento, arquivos estáticos ou páginas inexistentes.
- Para novas rotas indexáveis, ajustar o gerador e os testes/contagem de URLs no workflow de SEO, em vez de apenas editar o XML.
- Não atualizar todas as datas por rotina ou por mudança meramente interna. `lastmod` representa alteração real de página, não execução de CI.

## Checklist de revisão

Há diff do sitemap para toda mudança relevante do site? Todas as URLs afetadas foram cobertas, incluindo dependências compartilhadas? Nenhuma URL não afetada mudou de data? O gerador é idempotente após a geração? O JSON-LD e os alternates correspondem ao conteúdo publicado?
