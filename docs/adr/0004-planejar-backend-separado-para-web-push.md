# Isolar o envio Web Push em um serviço serverless na GCP

## Status

Proposed

## Context

O site já tem Service Worker, mas não dispõe de ambiente confiável para guardar inscrições, manter a chave privada VAPID ou enviar notificações. Essas operações não devem ser executadas no GitHub Pages nem diretamente pelo navegador.

O público atual é reduzido e a expectativa inicial é de poucas inscrições. Não há evidência que justifique filas, múltiplos serviços ou infraestrutura sempre ativa. Foram consideradas uma solução gerenciada de notificações, Cloudflare Workers com D1 e uma API própria na Google Cloud. A solução gerenciada reduz código, mas também reduz controle sobre contratos e dados; Cloudflare é operacionalmente leve, porém acrescentaria outra plataforma ao conjunto de estudos e manutenção.

## Decision

Adotar, para a primeira implementação, uma API ASP.NET Core Minimal API em Cloud Run, com escala a zero, e Firestore para persistir as inscrições. A execução e o banco ficarão em `southamerica-east1` (São Paulo). A chave privada VAPID será armazenada no Secret Manager, preferencialmente com recurso regional na mesma localidade.

O site continuará no GitHub Pages. A API pública terá apenas operações necessárias para inscrever e cancelar; o envio será autorizado separadamente por identidade confiável, sem expor credenciais ou capacidade de disparo aos visitantes. VAPID identifica o servidor perante os serviços Web Push; não substitui a autenticação da aplicação.

O desenho inicial terá um único backend, sem Pub/Sub, Redis ou Kubernetes. Qualquer componente adicional precisará responder a uma necessidade observada. Os limites de recursos, a política antiabuso e os custos regionais serão definidos antes do provisionamento.

## Consequences

A separação preserva a simplicidade do site e mantém segredos e persistência fora do cliente. Cloud Run e Firestore permitem crescimento gradual sem provisionar capacidade fixa para uma audiência que ainda não existe.

A solução introduz um serviço público sujeito a abuso, operações de dados pessoais, dependência da GCP, cold starts e possível cobrança mesmo com tráfego pequeno. O Free Tier não é garantia de custo zero, especialmente para recursos e tráfego em São Paulo. Nenhum recurso de cloud foi provisionado por esta ADR. A governança de dados e a automação de infraestrutura estão nas ADRs 0006 e 0008.
