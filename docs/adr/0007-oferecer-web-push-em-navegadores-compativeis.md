# Oferecer inscrição Web Push nos navegadores compatíveis

## Status

Proposed

## Context

A tecnologia Web Push não está restrita a smartphones. Navegadores de desktop também podem receber notificações. No iOS, o suporte depende das condições de instalação da aplicação na tela inicial; em outras plataformas, a instalação não é necessariamente obrigatória.

Restringir a interface a celulares reduziria casos de teste, mas excluiria visitantes de desktop sem benefício relevante de segurança ou de proteção de dados. Por outro lado, exibir o botão em qualquer navegador levaria a uma experiência inconsistente e a pedidos de permissão desnecessários.

## Decision

Disponibilizar inscrição e gerenciamento de notificações somente na versão em português do portfólio, em navegadores que ofereçam as APIs necessárias. A detecção será feita por capacidade e contexto de execução, não por uma lista fixa de dispositivos. As páginas em inglês e espanhol permanecerão sem controles de push nesta etapa.

No iOS, orientar a instalação na tela inicial antes de oferecer a ativação quando esse for o requisito do navegador. Nos demais ambientes compatíveis, permitir inscrição sem impor instalação da PWA. Nunca solicitar permissão automaticamente ao carregar a página; a tentativa deve partir de uma ação explícita do visitante.

Utilizar a chave pública VAPID durante a inscrição. Enviar ao backend os dados retornados por `PushManager.subscribe()` e manter a identidade da inscrição vinculada à instalação do navegador, sem presumir que vários navegadores do mesmo dispositivo compartilhem assinatura.

A interface deverá permitir verificar o estado atual, cancelar e orientar sobre permissões bloqueadas. O cancelamento precisa ser consistente entre navegador e backend, inclusive quando uma das operações falhar temporariamente.

## Consequences

A experiência atende iOS, Android e desktop com a mesma arquitetura de envio, preservando diferenças reais entre navegadores. O visitante decide se quer receber notificações e consegue interrompê-las.

A matriz de testes aumenta e parte do comportamento permanece sob controle do sistema operacional. Permissões negadas, limpeza de dados locais, reinstalação da PWA e mudanças de endpoint precisam ser tratadas sem criar inscrições órfãs ou induzir o visitante a novas solicitações insistentes.
