# Planejar backend separado para Web Push

## Status

Proposed

## Context

O portfólio já tem estrutura PWA e Service Worker, mas o GitHub Pages é estático. O envio de notificações Web Push para assinantes exige credenciais privadas VAPID, armazenamento de subscriptions, controle de consentimento, remoção de inscrições inválidas e um emissor confiável.

Foram consideradas soluções serverless com armazenamento gerenciado, como Cloudflare Workers com D1 e GCP Cloud Run com Firestore, além de serviços de terceiros. Não houve seleção de provedor, provisionamento de ambiente ou autorização para envio.

## Decision

Proposta: manter a hospedagem pública no GitHub Pages e implementar, em etapa independente, um backend serverless para gerenciar inscrições e envios Web Push. Separar a API de inscrição e cancelamento do endpoint autenticado de disparo. Manter a chave privada VAPID e credenciais de automação fora do frontend e do repositório.

Antes de aceitar esta ADR, selecionar a plataforma com base em custo, manutenção, segurança, observabilidade, privacidade e possibilidade de demonstrar a arquitetura no portfólio. Definir política de dados e retenção, controles antiabuso, CORS restritivo, deduplicação e testes com opt-in/opt-out.

Nenhuma API de inscrição, cloud ou integração com notificações é considerada implementada por este registro.

## Consequences

O desenho preservaria a independência do site estático e permitiria envios sem manter um processo sempre ativo. Também daria espaço a evolução e testes isolados do backend.

A solução introduziria processamento de dados de inscrição, obrigações de privacidade, dependência operacional de cloud, custo variável e gestão de segredos. A decisão de plataforma e os contratos concretos continuam pendentes de análise e aprovação.
