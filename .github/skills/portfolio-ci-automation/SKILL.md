---
name: portfolio-ci-automation
description: >-
  Modificar ou revisar workflows GitHub Actions do portfólio,
  com permissões mínimas, segurança, checks obrigatórios,
  otimização de execução, deploy Pages, IndexNow e testes de CI.
---

# GitHub Actions e quality gates

## Inventário

Consultar `.github/AUTOMATION.md` e `.github/workflows/`. Os gates principais incluem `Site validation`, `SEO validation`, `Accessibility`, `Lighthouse CI` e `GitHub Actions security`. Outras automações fazem deploy do Pages, importação de conteúdo, saúde de links, IndexNow e otimização de imagens.

## Regras operacionais

1. Antes de editar um workflow, entender seus gatilhos, permissões, regras de branch, dependências e impacto nos checks obrigatórios.
2. Não remover um check obrigatório da execução de PR por filtros de `paths` sem garantir que o mesmo status seja publicado com sucesso quando o trabalho for irrelevante. Preferir um job sempre executado que faça skip lógico das tarefas custosas.
3. Seguir o padrão atual de pinning de GitHub Actions por SHA imutável; manter exceções explícitas em `zizmor.yml` e o princípio de permissões mínimas por workflow/job.
4. Não imprimir segredos, permitir execução não confiável de PR com credenciais privilegiadas, usar `pull_request_target` sem análise de ameaça ou fazer push direto à `main` protegida.
5. Não introduzir loops de automação, PRs duplicados ou commits sem diff. Em conteúdo automatizado, preservar catálogos e sincronização SEO determinística.
6. Quando o workflow gerar alterações efetivas no site, ele deve publicar no mesmo PR os artefatos associados, incluindo `sitemap.xml` e `lastmod` das URLs afetadas.
7. Não enfraquecer thresholds de WCAG, Lighthouse, segurança ou validação SEO para mascarar regressões.

## Verificação

- Executar `actionlint` para YAML de workflow e `zizmor` para análise de segurança, conforme suas versões/configurações em CI.
- Rodar testes unitários dos scripts modificados e `git diff --check`.
- Avaliar nomes de checks que branch protection exige e conferir jobs no PR.
- Confirmar comportamento de `deploy-pages.yml`: geração de PDF em PR, publicação somente fora de PR (normalmente `main`).
- Em `indexnow.yml`, manter notificações alinhadas às URLs realmente públicas; IndexNow não substitui sitemap nem SEO.

Documentar na descrição do PR os gatilhos afetados, checks executados e eventuais restrições de teste local.
