# PWA offline do portfólio

Este projeto permanece estático, sem backend e sem framework de aplicativo. O manifest existente habilita a instalação e o Service Worker adiciona resiliência de navegação no GitHub Pages.

## Comportamento e escopo

- `/sw.js` controla apenas a origem do portfólio, com registro explícito em páginas HTML indexáveis (PT/EN/ES).
- O conjunto inicial inclui as três páginas iniciais, scripts/CSS essenciais e páginas offline localizadas (`/offline.html`, `/en/offline.html`, `/es/offline.html`). O primeiro carregamento necessita de rede.
- Navegações e recursos locais (JS/CSS/imagens/fontes) usam **network-first** com limite de 5 segundos; em falha de rede ou erro transitório de servidor (HTTP 5xx), a cópia já acessada é usada. Uma resposta HTTP 404 legítima é preservada. Em rota ainda não acessada, aparece o fallback no idioma do caminho.
- O cache de navegação/recurso é limitado a 64 entradas (FIFO). Requisições com parâmetros de consulta não são armazenadas nem reutilizam a cópia offline da URL sem parâmetros, para evitar respostas semanticamente incorretas. URLs externas, POST, PDFs, redirecionamentos e respostas de erro não entram no cache.
- Os caches são de **melhor esforço**: modo privado, limpeza do navegador e limites de armazenamento podem removê-los. Não prometemos funcionamento offline completo de imagens nunca vistas ou links externos.

## Instalação nas páginas iniciais

Em iPhone e iPad, a sugestão mantém as instruções do navegador e a alternativa Safari. Em Android, o guia indica as opções do menu e oferece a ação nativa somente quando o navegador disponibiliza `beforeinstallprompt`. A chamada a `prompt()` ocorre por ação explícita do visitante; cancelar ou falhar preserva a ajuda manual, e o evento não é reutilizado. A escolha de aceitar o diálogo oculta o painel naquela página; `appinstalled` e o modo standalone também o ocultam. A dispensa da sugestão continua restrita à sessão, inclusive entre idiomas. Não há detecção garantida de instalação em outra aba ou de navegadores que não exponham a API; instalação e atalhos dependem do navegador e do launcher. Desktop permanece inalterado. A ADR 0002 continua aplicável.

## Publicações e invalidação

O worker evita `skipWaiting()` forçado, pois trocar scripts enquanto uma aba usa a versão antiga pode causar inconsistência. Uma nova versão do worker espera as abas controladas terminarem; `clients.claim()` cobre a primeira instalação. HTML, CSS e JS são consultados na rede a cada acesso, de modo que uma publicação nova não fica presa em cache antigo enquanto há conexão. Incremente obrigatoriamente `CACHE_VERSION` em `sw.js` quando mudar o próprio worker, a política de cache, a lista `APP_SHELL` **ou o conteúdo de qualquer recurso pré-cacheado** (inclusive `/offline.html`, `/en/offline.html`, `/es/offline.html`, CSS, JS e páginas iniciais), mesmo se `sw.js` não tivesse outras alterações. Depois, execute `node --test .github/scripts/test-pwa.cjs`: os testes extraem a versão declarada em `sw.js` para construir os nomes atuais do cache; os nomes de versões antigas são mantidos apenas nos cenários de regressão. A versão explícita isola o cache do worker em instalação daquele que ainda controla abas abertas. Caches antigos com prefixo do projeto são limpos na ativação, sem afetar caches de terceiros.

## Identidade visual dos ícones

O monograma geométrico RO da arte principal é a referência visual. O vetor `assets/brand/ro-architect-mark.svg` documenta a geometria do símbolo para os ícones; o favicon e os PNGs para Android e Apple devem manter o mesmo monograma, fundo escuro e gradiente da marca. Os PNGs comuns usam o símbolo centralizado, ocupando aproximadamente 92% da área de desenho; a variante maskable usa 78% da área de desenho para preservar o símbolo dentro do círculo seguro central. O fundo dos PNGs é opaco, sem cantos arredondados pré-aplicados, para permitir a máscara do sistema.

Após alteração de identidade visual, conferir as dimensões dos arquivos, atualizar a revisão do cache e validar a instalação em dispositivos físicos. Sistemas que conservem o ícone antigo podem exigir a remoção e nova instalação do atalho após a publicação.

## Segurança e compatibilidade

A CSP mantém restrições existentes, liberando apenas `worker-src 'self'` onde o aplicativo é registrado. O Service Worker é servido na raiz, não intercepta requisições de outras origens e não armazena dados pessoais. Nada altera o WebMCP nem URLs canônicas, hreflang ou conteúdo indexável. As páginas de fallback usam `noindex` e não entram no sitemap. Instalação em tela inicial varia por navegador; o cache offline funciona em navegadores com suporte a Service Worker, inclusive sem instalação.

## Verificações

```sh
node --test .github/scripts/test-pwa.cjs
# CI: .github/workflows/pwa.yml executa Playwright em Chromium, Firefox e WebKit.
```

No dispositivo físico, testar: (1) adicionar à Tela de Início no iOS e Android; (2) abrir online; (3) ativar modo avião; (4) abrir uma página visitada; (5) abrir uma rota não visitada e conferir idioma do fallback; (6) desativar modo avião e confirmar conteúdo atualizado após deploy.

Referências: MDN Web Docs (Service Worker, Cache API, Lifecycle), web.dev (offline e PWA), Apple WebKit (web apps no iOS), documentação Playwright.
