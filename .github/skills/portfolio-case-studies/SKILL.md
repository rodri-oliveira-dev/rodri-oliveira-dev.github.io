---
name: portfolio-case-studies
description: >-
  Criar e revisar estudos de caso do portfólio de arquitetura e open source
  com narrativa de problema, decisão, trade-offs, evidências, links de código
  e versões pt-BR, en e es-419.
---

# Estudos de caso técnicos

## Localização e padrões

- `case-studies/<slug>/index.html`
- `en/case-studies/<slug>/index.html`
- `es/case-studies/<slug>/index.html`

Consultar um estudo existente antes de criar outro. Hoje há cinco slugs espelhados entre os três idiomas; não assumir que esse número será fixo.

## Conteúdo necessário

- Contexto e problema real, objetivo e restrições.
- Escolhas arquiteturais, alternativas consideradas e trade-offs (quando sustentados pelos artefatos do projeto).
- Implementação e materiais consultáveis: código-fonte, documentação, diagramas e exemplos, conforme disponíveis.
- Limitações, aprendizados e próximos passos quando fizerem sentido.
- Linguagem acessível a avaliadores técnicos e recrutadores, sem perder precisão.

Evitar métricas inventadas, vitórias não verificáveis ou confusão entre laboratório open source e solução contratada por cliente. Ancorar alegações em README, código e documentação do repositório referenciado.

## Publicação

1. Criar ou editar as três versões equivalentes, mantendo slug e navegação corretos.
2. Preservar canonical, alternates recíprocos, título, descrição e JSON-LD do artigo. Reutilizar `#person`/`#website` e `SoftwareSourceCode` apenas quando existir repositório associado.
3. Vincular o estudo a navegação/cartões e páginas de serviço somente quando pertinente.
4. Executar o sincronizador SEO; revisar as três entradas correspondentes no sitemap e seus `lastmod`.
5. Se um novo slug exigir mudança nos testes ou contagem de URLs, atualizar esses contratos de forma explícita.

## Verificações

`node .github/scripts/test-site-i18n.cjs`, `python3 .github/scripts/sync-seo.py`, testes SEO, validação HTML, links, WCAG e Lighthouse aplicáveis.
