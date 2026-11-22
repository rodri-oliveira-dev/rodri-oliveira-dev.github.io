# Manter decisões arquiteturais no repositório e validá-las no CI

## Status

Accepted

## Context

A arquitetura do portfólio vem evoluindo por pequenos PRs: publicação, SEO, automações, PWA e integrações com serviços externos. As descrições dos PRs explicam o que mudou, mas não oferecem um lugar único para consultar por que uma escolha foi feita ou quais limitações foram aceitas.

Uma wiki separada exigiria manutenção de outro acervo. Documentos Markdown isolados no repositório resolveriam a rastreabilidade, mas não detectariam inconsistências de estrutura e relacionamento. O ADR Guard já oferece essa validação de forma determinística.

## Decision

Registrar decisões relevantes em `docs/adr`, usando arquivos numerados e o formato canônico com `Status`, `Context`, `Decision` e `Consequences`. O índice acompanha os documentos no mesmo PR. Uma ADR registra uma escolha e seus trade-offs; não serve como especificação exaustiva de implementação.

A GitHub Action `adr-guard.yml` executa `check` em pull requests para `main`, em pushes na branch principal e manualmente. O workflow utiliza a release `v1.12.0`, com código fixado por SHA, versão explícita do runtime, checkout sem credenciais persistentes e permissão somente de leitura.

Decisões em discussão usam `Proposed`. Sua aceitação exige revisão humana; uma execução bem-sucedida da Action não altera o status nem constitui aprovação técnica.

## Consequences

O raciocínio arquitetural passa a acompanhar o código e pode ser revisado no mesmo fluxo de PR. A validação detecta problemas formais antes que o histórico fique inconsistente.

O custo é editorial: decisões precisam ser revisadas quando seus pressupostos mudarem. O ADR Guard não verifica a qualidade do argumento, não comprova requisitos não funcionais e não substitui a avaliação de riscos. A obrigatoriedade do check na proteção de `main` é uma configuração de governança à parte, não consequência automática da criação do workflow.
