# Disparar notificações de artigos somente após a publicação do site

## Status

Proposed

## Context

A atualização editorial não corresponde necessariamente a conteúdo disponível ao visitante. O fluxo `import-newsletter-article.yml` incorpora manualmente artigos em português e abre PR; `sync-newsletter-articles.yml` é um mecanismo de reconciliação manual. Os fluxos DEV Community e Hashnode atendem inglês e espanhol e possuem regras de merge diferentes.

Um artigo importado pode aguardar revisão, falhar em quality gates ou ainda não ter sido publicado. Além disso, mudanças em metadados, RSS ou sitemap não significam uma publicação nova. Disparar notificações diretamente do job de importação criaria esses dois tipos de falso positivo.

## Decision

Na primeira versão, notificar **apenas artigos em português** já publicados no portfólio. Os workflows de inglês e espanhol não participam do envio.

A execução de envio será separada da importação. Um workflow específico deverá considerar somente publicações concluídas com sucesso na `main`, vinculando o evento ao commit e ao conteúdo efetivamente disponibilizado no GitHub Pages. A conclusão do deploy é condição necessária, mas o processo também precisa conferir se há artigo novo no catálogo em português.

A identidade de publicação será baseada em URL canônica ou identificador estável, não na posição do artigo nem em `git diff` genérico. O backend manterá estado durável para evitar repetir campanhas em reexecuções e para controlar tentativas por inscrição. Reenvios serão limitados e observáveis; falhas de push não reverterão o deploy.

## Consequences

O visitante não receberá avisos de conteúdo ainda não disponível nem de simples correções editoriais. A independência entre publicação e distribuição reduz o acoplamento das Actions existentes.

A notificação poderá ocorrer depois do deploy e dependerá de reconciliação quando eventos forem perdidos ou quando a publicação for iniciada por mecanismos diferentes do workflow habitual. Serviços de push externos não oferecem garantia de entrega exatamente uma vez; nossa deduplicação controla os disparos sob nossa responsabilidade, não o comportamento do dispositivo. O workflow de envio não está implementado e depende da ADR 0004.
