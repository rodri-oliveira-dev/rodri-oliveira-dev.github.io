# Versionar decisões e validar com ADR Guard

## Status

Accepted

## Context

O repositório já possui regras de contribuição, segurança, automação e publicação. A evolução da PWA e a discussão de notificações push expõem a necessidade de distinguir escolhas adotadas de propostas, registrar justificativas e manter um histórico revisável.

Documentação informal ou restrita à descrição de PRs tende a fragmentar o raciocínio técnico. O ADR Guard fornece uma validação determinística do formato e do conjunto de Architecture Decision Records (ADRs), sem decidir pela equipe.

## Decision

Manter ADRs canônicas em `docs/adr`, numeradas e versionadas junto ao código. Usar as seções `Status`, `Context`, `Decision` e `Consequences`. Manter o índice `docs/adr/README.md` no mesmo PR que altera decisões.

Executar a GitHub Action do ADR Guard com `command: check` em todo pull request para `main`, em pushes na `main` e sob execução manual. Fixar o código da Action no commit publicado da release `v1.12.0` e informar `version: "1.12.0"` para selecionar a imagem de runtime correspondente. Usar somente permissão `contents: read` e checkout sem credenciais persistentes.

Decisões futuras permanecem `Proposed` até aceitação explícita na revisão humana. A Action não cria documentos, não altera status e não substitui revisão técnica.

## Consequences

A motivação e as consequências das principais escolhas passam a ser auditáveis no Git, com falhas estruturais detectadas antes do merge. O workflow pode ser convertido em check obrigatório por configuração de ruleset da branch, depois de sua primeira execução.

Escrever e manter ADRs exige disciplina editorial. A validação não prova mérito técnico, segurança da solução nem aprovação da proposta. Atualizar versões fixadas da Action e da imagem requer revisão explícita de compatibilidade e de cadeia de suprimentos.
