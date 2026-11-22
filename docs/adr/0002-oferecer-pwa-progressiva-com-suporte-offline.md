# Oferecer PWA progressiva com suporte offline

## Status

Accepted

## Context

O portfólio precisa ser acessível pelo navegador e também pode ser adicionado à tela inicial de dispositivos compatíveis. A implementação atual contém `site.webmanifest`, metadados Apple, `sw.js`, `assets/js/pwa-register.js` e páginas offline nos três idiomas, conforme `docs/pwa.md`.

A experiência instalada é complementar à navegação web: há diferenças entre iOS, Android e navegadores de terceiros, e a disponibilidade de conteúdo offline não pode ser presumida no primeiro acesso.

## Decision

Manter uma Progressive Web App (PWA) como aprimoramento progressivo do site estático, sem exigir aplicativo nativo ou cadastro em lojas. Usar o manifest para permitir instalação e o Service Worker de escopo local para navegação com política network-first, cache limitado e páginas de fallback localizadas.

Preservar o uso normal do site nos navegadores sem suporte. Ao alterar o próprio Service Worker ou recursos pré-cacheados, atualizar sua versão e executar os testes definidos em `docs/pwa.md`. Não equiparar suporte offline a suporte a notificações push.

## Consequences

Dispositivos compatíveis podem abrir o portfólio pela tela inicial e reutilizar páginas previamente acessadas durante indisponibilidade de rede. O conteúdo continua alcançável por URLs normais, preservando SEO e compartilhamento.

Os navegadores podem limpar o cache, e conteúdo nunca carregado ou externo pode ficar indisponível offline. Mudanças de versão do Service Worker exigem validação de ciclo de vida e compatibilidade. Web Push, caso adotado, terá sua própria política de consentimento, backend e testes multiplataforma.
