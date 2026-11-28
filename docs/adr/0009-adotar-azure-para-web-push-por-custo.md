# Adotar Azure para o backend Web Push por controle de custos

## Status

Accepted

### Atualização de 28/11/2026 — ativação sem novos recursos

A abertura pública usará exclusivamente a infraestrutura Azure existente: Function App Flex Consumption, Cosmos DB, Storage Queue, Key Vault, identidades gerenciadas, OIDC e os limites de escala/consumo já declarados. A mudança de ativação é feita por configuração versionada e kill switches no fluxo completo de release; não cria serviço, Always Ready, telemetria adicional ou privilégio. Budget, alertas, consumo e retenção efetivos ainda exigem evidência operacional antes do go-live.

## Context

A arquitetura inicial previa Cloud Run e Firestore na GCP (ADRs 0004 e 0008). A ativação da conta exigiu um compromisso financeiro inicial incompatível com a necessidade atual do portfólio, cujo volume de inscrições ainda é incerto. A alternativa em AWS também não avançou no cadastro.

## Decision

Substituir a GCP pela Azure como plataforma prevista para o backend Web Push, mantendo o site no GitHub Pages. Priorizar serviços gerenciados e serverless, recursos de dados na região `brazilsouth` (São Paulo), infraestrutura em Terraform e deploy pelo GitHub Actions com OIDC.

Os serviços definitivos serão escolhidos após validação de disponibilidade, limites gratuitos e custos regionais. As decisões sobre consentimento, segurança e retenção de dados continuam válidas.

Esta é uma mudança de plataforma planejada: não houve migração de dados ou serviços em produção.

A decisão de coordenar o apply do workload, deploy da Function App e publicação do Pages em uma única release manual está registrada na [ADR 0012](0012-controlar-publicacao-por-release-manual.md). A decisão de plataforma permanece Accepted; a cadência e os controles de release foram formalizados na ADR 0012, sem autorizar provisionamento.

## Consequences

A escolha evita o desembolso inicial e preserva a simplicidade operacional desejada. Não garante ausência de cobranças; orçamento, alertas e revisão de consumo continuam necessários. A localização dos recursos no Brasil não elimina a avaliação de transferências internacionais envolvidas no Web Push.

Esta ADR substitui as propostas de infraestrutura GCP das ADRs 0004 e 0008.
