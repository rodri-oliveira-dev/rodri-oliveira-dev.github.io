# Notificar artigos após publicação confirmada

## Status

Proposed

## Context

O repositório possui fluxos diferentes de conteúdo: `import-newsletter-article.yml` importa artigos em português manualmente; `sync-devto-articles.yml` sincroniza publicações em inglês e possui merge automático após verificações; `sync-hashnode-articles.yml` sincroniza publicações em espanhol e preserva merge manual. `sync-newsletter-articles.yml` permanece como fallback manual.

Detectar um diff nos catálogos ou concluir a busca não significa que exista um artigo novo disponível no site. Um PR pode permanecer aberto, falhar em quality gates ou aguardar publicação no GitHub Pages.

## Decision

Proposta: reutilizar os workflows atuais de sincronização e criar um processo central de notificações acionado somente depois do sucesso do deploy do site na `main`. Comparar URLs canônicas ou identificadores duráveis dos artigos com um histórico de envios, diferenciando conteúdo novo de correções de metadados e alterações apenas de SEO.

Enviar uma notificação por artigo novo e por público inscrito no idioma correspondente (PT-BR, EN ou ES). Fazer o disparo pelo backend autenticado, com deduplicação persistente, retries controlados e observabilidade; uma falha de push não deve invalidar o deploy já concluído.

Esta ADR depende da decisão e implementação do backend Web Push. O workflow de notificação, as inscrições e os envios não estão implementados.

## Consequences

A publicação seria separada da comunicação, evitando avisos prematuros ou repetidos. A responsabilidade pela emissão ficaria centralizada em vez de duplicada nas três Actions de conteúdo.

A confirmação do deploy pode acrescentar atraso entre artigo e notificação. O sistema precisará lidar com falhas temporárias, publicações concorrentes, artigos reordenados e reexecuções de workflows, além de estabelecer critérios claros de conteúdo novo antes da ativação.
