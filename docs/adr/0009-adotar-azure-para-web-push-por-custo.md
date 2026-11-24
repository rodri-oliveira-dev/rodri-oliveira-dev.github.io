# Adotar Azure para o backend Web Push por controle de custos

## Status

Accepted

## Context

A arquitetura inicial previa Cloud Run e Firestore na GCP (ADRs 0004 e 0008). A ativação da conta exigiu um compromisso financeiro inicial incompatível com a necessidade atual do portfólio, cujo volume de inscrições ainda é incerto. A alternativa em AWS também não avançou no cadastro.

## Decision

Substituir a GCP pela Azure como plataforma prevista para o backend Web Push, mantendo o site no GitHub Pages. Priorizar serviços gerenciados e serverless, recursos de dados na região `brazilsouth` (São Paulo), infraestrutura em Terraform e deploy pelo GitHub Actions com OIDC.

Os serviços definitivos serão escolhidos após validação de disponibilidade, limites gratuitos e custos regionais. As decisões sobre consentimento, segurança e retenção de dados continuam válidas.

Esta é uma mudança de plataforma planejada: não houve migração de dados ou serviços em produção.

A proposta de coordenação do apply do workload, deploy da Function App e publicação do Pages em uma única release manual está registrada na [ADR 0012](0012-controlar-publicacao-por-release-manual.md). A decisão de plataforma permanece Accepted; cadência e controles de release são avaliados separadamente, sem autorizar provisionamento.

## Consequences

A escolha evita o desembolso inicial e preserva a simplicidade operacional desejada. Não garante ausência de cobranças; orçamento, alertas e revisão de consumo continuam necessários. A localização dos recursos no Brasil não elimina a avaliação de transferências internacionais envolvidas no Web Push.

Esta ADR substitui as propostas de infraestrutura GCP das ADRs 0004 e 0008.
