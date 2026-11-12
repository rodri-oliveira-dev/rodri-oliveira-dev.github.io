---
name: portfolio-webmcp
description: >-
  Manter a integração experimental WebMCP de ferramentas de leitura
  para agentes de navegador, incluindo contratos JSON Schema,
  dados públicos trilíngues, segurança e testes sem backend.
---

# Integração WebMCP

## Contratos atuais

- `assets/js/webmcp.js`: detecção de suporte, registro e ciclo de vida (incluindo bfcache).
- `assets/js/webmcp-tools.mjs`: operações e validação de parâmetros.
- `assets/js/webmcp-data.mjs`: informações públicas do portfólio e projetos.
- `assets/js/webmcp-i18n.mjs`: descrições e mensagens nos três idiomas.
- Seis ferramentas públicas somente de leitura: `getProfile`, `getSkills`, `searchProjects`, `getProjectDetails`, `getResume` e `getContactInfo`.
- Referências completas em `docs/webmcp.pt-BR.md`, `docs/webmcp.en.md` e `docs/webmcp.es-419.md`.

## Regras de implementação

1. Preservar compatibilidade progressiva: navegadores sem `document.modelContext` devem operar normalmente.
2. Não adicionar backend, chamadas externas, armazenamento, telemetria, credenciais, APIs de escrita ou ferramentas que modifiquem estado.
3. Preservar a CSP restritiva, em especial `connect-src 'none'`, validação estrita de entradas, mensagens de erro e schemas estáveis.
4. Manter descrições localizadas (`pt-BR`, `en`, `es-419`) sem alterar nomes de ferramentas/campos públicos.
5. Atualizar catálogo de projetos e testes quando o site apresentar informação pública nova; não expor informação que não esteja publicada.
6. Não tratar WebMCP como substituto de HTML, acessibilidade, SEO, JSON-LD ou sitemap. Não prometer suporte em navegadores que não expõem a API.

## Validação

Executar `node --test .github/scripts/test-webmcp.mjs` e `node .github/scripts/test-site-i18n.cjs`. Confirmar com `deploy-pages.yml` que os quatro módulos entram no artefato. Mudanças visíveis no site exigem análise de `lastmod` conforme `AGENTS.md`; mudanças somente nos contratos internos não justificam datas artificiais. Testar manualmente em navegador compatível se a tarefa depender de suporte real.
