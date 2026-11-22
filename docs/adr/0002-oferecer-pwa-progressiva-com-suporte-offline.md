# Disponibilizar instalação e navegação offline como recursos progressivos

## Status

Accepted

## Context

O portfólio é acessado por links, mecanismos de busca e navegadores diferentes. A instalação na tela inicial melhora a conveniência para quem retorna ao site, mas não pode ser requisito para consultar o conteúdo. Também não há controle sobre a política de armazenamento de cada navegador, especialmente em dispositivos móveis.

O repositório já contém `site.webmanifest`, `sw.js`, `assets/js/pwa-register.js` e páginas offline em português, inglês e espanhol. O comportamento implementado está descrito em `docs/pwa.md`.

## Decision

Manter uma PWA progressiva sobre o site estático, sem aplicativo nativo e sem depender da instalação para navegar.

O Service Worker atende apenas à origem do portfólio. Navegações e recursos elegíveis usam a política `network-first`; em falha de rede, o navegador pode recuperar conteúdo previamente armazenado ou apresentar a página offline do idioma solicitado. O cache é limitado e não cobre recursos externos, PDFs ou páginas nunca visitadas.

O ciclo de vida do Service Worker deve continuar explícito: mudanças nele ou nos recursos pré-cacheados exigem revisão da versão e execução dos testes de navegador. A implementação não deve forçar a troca do worker durante uma sessão ativa.

## Consequences

O site mantém suas URLs públicas e o comportamento normal em navegadores sem suporte a PWA. Em navegadores compatíveis, a instalação e o cache oferecem conveniência e alguma resiliência à falta de conexão.

O armazenamento local pode ser removido a qualquer momento, e a primeira visita continua exigindo rede. A política de cache requer testes para evitar versões incompatíveis de scripts e páginas. Notificações push não fazem parte desta decisão: dependem de permissão específica do visitante e de infraestrutura de envio, discutidas nas ADRs 0004 e 0007.
