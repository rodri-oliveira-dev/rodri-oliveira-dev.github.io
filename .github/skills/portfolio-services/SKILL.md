---
name: portfolio-services
description: >-
  Criar, aprimorar ou revisar as páginas de serviços e consultoria
  do portfólio, com storytelling profissional, evidências, CTA,
  coerência trilíngue, SEO e integridade dos contratos.
---

# Páginas de serviços

## Arquivos

- `servicos/index.html`, `en/services/index.html`, `es/servicios/index.html`.
- Estilos próprios em `assets/css/servicos.css`; estilos globais em `assets/css/site.css`.
- Contratos em `.github/scripts/test-services.cjs` e regras de SEO em `.github/scripts/sync-seo.py`.

## Método editorial

1. Apresentar o problema do potencial cliente e a forma concreta de atuação, sem frases promocionais infladas.
2. Preservar as quatro frentes de serviço atualmente publicadas e seus equivalentes semânticos nos três idiomas, salvo mudança intencional acompanhada por testes.
3. Comunicar abordagem, escopo, limites e formas de contato com clareza; priorizar evidências e ações verificáveis.
4. Diferenciar os três exemplos de experiência anterior dos quatro estudos de caso públicos da página. Experiências não constituem contratos vigentes nem endossos; projetos open source não demonstram entregas atribuídas àqueles clientes.
5. Não prometer resultados, prazos, garantias, certificações, avaliações ou preços inexistentes.
6. Conservar o CTA acessível e os links internos corretos nos três idiomas.

## Contratos técnicos

- Canonical própria, `hreflang` recíproco e `x-default` para português.
- JSON-LD `WebPage`/`Service`/`BreadcrumbList`, com `#person` e `#website` compartilhados; `serviceType` derivado do texto visível pelo sincronizador.
- Não quebrar IDs de seção, âncoras, skip link, navegação mobile, CSP ou layout responsivo.
- Ao alterar o CSS compartilhado, atualizar no sitemap os `lastmod` das três páginas (e quaisquer outras que realmente usem o CSS modificado).

## Verificações

`node .github/scripts/test-services.cjs`, `node .github/scripts/test-site-i18n.cjs`, `python3 .github/scripts/sync-seo.py`, testes de SEO e revisão visual/acessibilidade. O workflow `Lighthouse CI` também cobre essas rotas.
