# Automação e GitHub Actions

Este diretório concentra a automação de CI, qualidade, segurança e manutenção do portfólio.

A estratégia é manter o site estático simples, mas protegido por verificações automatizadas que cubram integridade do conteúdo, acessibilidade, segurança dos workflows, qualidade percebida, saúde de links externos e manutenção das próprias GitHub Actions.

## Instruções para agentes e skills

Agentes que modificam este repositório devem seguir o `AGENTS.md` da raiz, incluindo a regra obrigatória de atualizar `sitemap.xml` (datas `lastmod` das URLs afetadas) em toda mudança efetiva do site. As instruções especializadas ficam em `.github/skills/`, cobrindo SEO, idiomas, serviços, estudos de caso, acessibilidade, importação de conteúdo, WebMCP, currículo e workflows. Mudanças somente em documentação interna não alteram artificialmente o sitemap.

## WebMCP experimental (pt-BR, en e es-419)

A integração com agentes de navegador é feita por módulos JavaScript locais, somente leitura, sem backend. O registro das ferramentas depende de `document.modelContext` e de contexto seguro; navegadores sem suporte continuam usando o site normalmente.

- [Guia WebMCP em português](../docs/webmcp.pt-BR.md)
- [WebMCP guide in English](../docs/webmcp.en.md)
- [Guía de WebMCP en español](../docs/webmcp.es-419.md)
- Teste versionado: `node --test .github/scripts/test-webmcp.mjs` (executado automaticamente no gate `Site validation`).
- Teste de serviços: `node --test .github/scripts/test-webmcp-services.mjs` cobre os quatro contratos de serviços, paridade editorial PT-BR/EN/ES-419, rotas, simulação do registro e bfcache no mesmo gate.
- Publicação: `deploy-pages.yml` verifica os módulos JavaScript no artefato estático, sem configurar token experimental.

Nas páginas de serviços, o WebMCP adiciona quatro ferramentas somente de leitura às seis ferramentas gerais, totalizando dez ferramentas. Em outras páginas permanecem seis. As três versões (português, inglês e espanhol latino-americano) registram ferramentas WebMCP em navegadores compatíveis. A ativação em navegador de teste e a diferença entre CI com mocks e teste real estão descritas nos guias.

## Página de serviços em português, inglês e espanhol

As páginas `/servicos/`, `/en/services/` e `/es/servicios/` utilizam o mesmo CSS `assets/css/servicos.css` e apresentam quatro frentes de atuação, a abordagem de trabalho, três experiências independentes anteriores e quatro estudos de caso públicos por idioma. As experiências históricas não representam contratos vigentes, endossos das empresas ou resultados atribuídos aos estudos de caso open source.

O conteúdo segue o modelo estático do site, sem formulário ou backend. Cada página possui canonical própria, `hreflang` recíproco (`pt-BR`, `en`, `es`, `x-default`), metadados sociais e JSON-LD `WebPage`/`Service`/`BreadcrumbList` vinculados aos identificadores estáveis de `Person` e `WebSite`. O gerador `.github/scripts/sync-seo.py` deriva as quatro categorias de serviço diretamente dos títulos visíveis e atualiza o sitemap com as três rotas, sem inventar preços, avaliações ou ofertas.

### Quality gates específicos

- `node .github/scripts/test-services.cjs`: verifica conteúdo, hierarquia e landmarks, links de idioma, projetos independentes, estudos de caso, URLs locais, canonical/hreflang, JSON-LD, sitemap e cobertura dos workflows.
- `Site validation`: executa o teste dedicado, `html-validate`, Lychee e CSpell nas três páginas.
- `Accessibility`: executa Pa11y (WCAG 2 AA) e verifica layout responsivo em 320, 360, 390, 768, 1024 e 1440 px, além de menu mobile por teclado, âncoras e navegação para outras rotas.
- `Lighthouse CI`: mede também as três páginas de serviços, com os mesmos budgets das demais páginas: desempenho ≥ 80% (aviso), acessibilidade 100% (bloqueante), boas práticas ≥ 95% (bloqueante) e SEO ≥ 95% (bloqueante).
- `Publish site with resume PDF`: testa a presença dos HTMLs PT/EN/ES e de `assets/css/servicos.css` no artefato de GitHub Pages.
- `SEO validation`: verifica a sincronização determinística e o vínculo do schema com conteúdo realmente publicado.

Para manutenção, edite as três traduções no mesmo PR e execute `python3 .github/scripts/sync-seo.py` após alterações nos títulos, descrições ou categorias de serviço. Revise o diff gerado de HTML e sitemap antes do commit. Alterações em navegação devem manter o acesso `Serviços / Services / Servicios` nas três homepages e testar que o menu móvel segue os links corretamente.

## Visão geral

| Workflow | Arquivo | Execução | Objetivo |
| --- | --- | --- | --- |
| ADR Guard | [`adr-guard.yml`](workflows/adr-guard.yml) | Pull Request para `main`, push em `main` e manual | Validar ADRs versionadas sem gerar ou aprovar decisões |
| Terraform validation | [`terraform-validation.yml`](workflows/terraform-validation.yml) | Todo Pull Request e manual; operações autenticadas somente na `main` | Validar IaC sem credenciais em PR e restringir `plan`/`apply` ao Environment protegido |
| Azure OIDC Validation | [`azure-oidc-validation.yml`](workflows/azure-oidc-validation.yml) | Manual, somente `main` | Validar autenticação OIDC, acesso ao Resource Group, backend remoto e Blob Lease descartável |
| Site validation | [`site-validation.yml`](workflows/site-validation.yml) | Pull Request, push em `main` e manual | Validar HTML, links, ortografia e workflows |
| Release and Deploy | [`deploy-pages.yml`](workflows/deploy-pages.yml) | PR relevante (somente prévia); publicação manual em `main` | Validar gates, gerar PDFs, publicar o artefato, criar tag e release |
| SEO validation | [`seo-validation.yml`](workflows/seo-validation.yml) | Pull Request, push em `main` e manual | Validar JSON-LD, sitemap, RSS discovery e consistência dos artefatos SEO |
| Accessibility | [`accessibility.yml`](workflows/accessibility.yml) | Pull Request, push em `main` e manual | Aplicar verificações automatizadas de WCAG 2 AA |
| GitHub Actions security | [`actions-security.yml`](workflows/actions-security.yml) | Pull Request, push em `main` e manual | Auditar a segurança da automação com zizmor |
| Lighthouse CI | [`lighthouse.yml`](workflows/lighthouse.yml) | Pull Request, diário às 21h de São Paulo e manual | Medir Performance, Accessibility, Best Practices e SEO |
| External link health | [`external-link-health.yml`](workflows/external-link-health.yml) | Semanal, manual e quando o próprio workflow muda em PR | Detectar link rot com uma verificação externa mais tolerante |
| Import newsletter article | [`import-newsletter-article.yml`](workflows/import-newsletter-article.yml) | Manual | Importar metadados e atualizar catálogo, homepage, RSS, JSON-LD e sitemap via Pull Request |
| Sync newsletter articles | [`sync-newsletter-articles.yml`](workflows/sync-newsletter-articles.yml) | Manual, somente fallback | Reconciliar manualmente os artefatos da newsletter caso necessário |
| Sync DEV Community articles | [`sync-devto-articles.yml`](workflows/sync-devto-articles.yml) | Diário e manual | Sincronizar os artigos em inglês a partir do DEV Community |
| Sync Hashnode articles | [`sync-hashnode-articles.yml`](workflows/sync-hashnode-articles.yml) | Diário e manual | Sincronizar os artigos em espanhol a partir do Hashnode |
| Notify IndexNow | [`indexnow.yml`](workflows/indexnow.yml) | Chamado por Release and Deploy após sucesso | Notificar mecanismos compatíveis com IndexNow sobre URLs publicadas |
| Optimize Open Graph image | [`optimize-og-image.yml`](workflows/optimize-og-image.yml) | Push específico em `main` e manual | Gerar e validar o WebP e propor a atualização via Pull Request |

## Currículo HTML e PDF

Os currículos estão em [`../curriculo/index.html`](../curriculo/index.html), [`../en/resume/index.html`](../en/resume/index.html) e [`../es/curriculo/index.html`](../es/curriculo/index.html), com CSS compartilhado em [`../curriculo/curriculo.css`](../curriculo/curriculo.css). Cada botão de download aponta para `rodrigo-de-oliveira.pdf` na rota do idioma ativo.

O workflow [`deploy-pages.yml`](workflows/deploy-pages.yml) instala uma única vez Playwright/Chromium, produz os três PDFs A4 a partir dos HTMLs e do CSS e publica um único artifact com o site inteiro. Em Pull Requests, os PDFs são gerados, têm conteúdo, ordem de leitura e paginação validados e ficam disponíveis em um artifact de prévia, mas não são publicados. Merges na `main` não publicam. Somente o acionamento manual em `main` publica HTMLs e PDFs juntos, sem criar commits de binários na branch protegida.

**Configuração necessária:** em **Settings → Pages → Build and deployment → Source**, selecionar **GitHub Actions**. Sem essa configuração, o deploy nativo por branch pode publicar antes da release; o fluxo manual recusa executar. O ambiente `github-pages` deve permitir deploy somente da `main`. Essa opção substitui o deploy anterior direto da branch; por isso, o workflow publica o site estático completo e não apenas o PDF.

O gerador está em [`scripts/generate-resume-pdf.mjs`](scripts/generate-resume-pdf.mjs). Os PDFs não são mantidos como fonte no Git; o conteúdo editável são os três HTMLs e o CSS compartilhado.

As três versões são URLs canônicas indexáveis (`/curriculo/`, `/en/resume/` e `/es/curriculo/`) com metadados localizados, JSON-LD `ProfilePage`/`Person`/`BreadcrumbList`, `hreflang` recíproco, sitemap e notificações IndexNow. Cada homepage aponta para o currículo correspondente. As verificações de SEO, HTML, ortografia, Lighthouse e WCAG cobrem as três páginas.


## Release e publicação manual

1. Após os merges, aguarde os quality gates da `main` no SHA que pretende publicar. Site validation, Accessibility, GitHub Actions security, SEO validation e ADR Guard são obrigatórios. Execuções de PWA, Terraform e Lighthouse no mesmo SHA, quando existentes por push ou dispatch, também devem estar verdes. Os checks exigidos em PR continuam inalterados. Se uma integração automática não gerar checks de main, execute os gates manualmente na `main` e confira o SHA.
2. Em **Actions → Release and Deploy → Run workflow**, selecione `main` e `patch`, `minor` ou `major`. O fluxo usa a maior tag SemVer existente como base e reutiliza uma tag SemVer do mesmo SHA em reexecuções.
3. O fluxo confere a origem do Pages e validações, gera e valida os três PDFs, monta e publica um único artefato. Após o deploy, cria a tag e a GitHub Release com notas desde a última release; a primeira release registra o histórico first-parent. IndexNow é executado por último.
4. Em falha parcial, use **Re-run failed jobs** enquanto o SHA continuar sendo a ponta da `main`. A tag não é movida e a release existente não é duplicada. Se a main avançou, reconcilie o estado de produção e publique o novo SHA por uma nova execução; não reexecute deploy antigo. Falha de tag, release ou IndexNow não desfaz um deploy bem-sucedido.

Antes de mesclar a mudança de estratégia, confirme **Settings → Pages → Source → GitHub Actions** e a restrição do environment `github-pages` à `main`. Sem essa alteração externa, o deploy nativo por branch pode continuar publicando a cada merge. Consulte a [ADR 0012](../docs/adr/0012-controlar-publicacao-por-release-manual.md).

## Quality gates

### Terraform validation

O [`terraform-validation.yml`](workflows/terraform-validation.yml) executa `terraform fmt -check -recursive`, confere os lockfiles assinados para Linux, Windows e macOS, inicializa os dois roots com `terraform init -backend=false -input=false -lockfile=readonly` e aplica `terraform validate -no-color`. O gate roda em todo Pull Request, sem credenciais e sem acessar o backend remoto, para continuar publicando o status mesmo quando a mudança não envolve IaC.

Execuções manuais oferecem `validate`, `validate-oidc`, `plan` ou `apply`. As operações autenticadas são rejeitadas fora de `refs/heads/main`, usam serialização por branch e o Environment `terraform-dev`; `plan` e `apply` usam checkout explícito da `main`. `validate-oidc` comprova autenticação e leitura do Resource Group, sem inicializar o backend ou executar operações Terraform. Somente os jobs autenticados recebem `id-token: write`; as variáveis `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` e `AZURE_SUBSCRIPTION_ID` são mapeadas para OIDC/`ARM_*`, sem client secret. O plano e os logs potencialmente sensíveis permanecem apenas em arquivos efêmeros do runner e não são publicados como artefatos.

`apply` exige simultaneamente despacho manual, confirmação textual `APPLY` e aprovação humana configurada no Environment. Ele cria um plano novo após a aprovação e aplica exatamente esse arquivo; um plano de outra execução nunca é reutilizado. Antes de habilitar o job, o Environment deve impedir bypass de administradores e possuir uma credencial Entra com o subject exato documentado em [`infra/terraform/README.md`](../infra/terraform/README.md). A proteção da `main` também deve exigir Pull Request e impedir force-push/exclusão. Enquanto esses controles externos não estiverem comprovados, o job não está autorizado para uso.

### Rollback do Terraform

Não há rollback automático de infraestrutura. Se um `apply` falhar, não restaurar State, não executar `force-unlock` e não repetir a operação às cegas. Primeiro conferir recursos parcialmente alterados e o lease em uma sessão autorizada, preservar as versões/soft delete do backend e preparar uma mudança Terraform reversa em novo Pull Request. A reversão passa pelos mesmos `fmt`, `validate`, análise estática, `plan`, revisão e aprovação do Environment antes de outro `apply`. Reverter apenas o workflow ou o HCL não desfaz recursos Azure já alterados.

O workflow também verifica os checksums assinados de AzureRM e AzureAD para `linux_amd64`, `windows_amd64`, `darwin_amd64` e `darwin_arm64` com `terraform providers lock`, falhando se a geração alterar um lockfile versionado. O Terraform CLI é fixado em `1.17.2`, as actions usam SHA imutável, as credenciais do checkout não persistem e o `GITHUB_TOKEN` permanece em `contents: read`. Em PR, nenhum job executa `plan`, `import` ou `apply`, solicita token OIDC ou acessa a Azure.

### ADR Guard

O [workflow ADR Guard](workflows/adr-guard.yml) verifica os documentos em [`docs/adr`](../docs/adr/README.md) em todo PR para `main`, push em `main` e execução manual. O check é somente leitura e usa código fixado por SHA da release `v1.12.0`, runtime `1.12.0`, `contents: read` e `persist-credentials: false`.

O ADR Guard valida estrutura, nomes, status e relacionamentos; ele **não cria nem aprova decisões**. O registro e a passagem de `Proposed` para `Accepted` permanecem sob revisão humana. Para exigir o status antes do merge, habilitar `ADR Guard` nas regras de proteção de `main` após a primeira execução bem-sucedida.

### Site validation

O [`site-validation.yml`](workflows/site-validation.yml) é o gate estrutural principal do repositório.

Ele executa:

- teste de integridade i18n nas três homepages e nos cinco estudos de caso por idioma, incluindo idioma ativo, links equivalentes, canonical, hreflang, metadados, JSON-LD e recursos locais;
- `html-validate` nas três homepages, nas três páginas de serviços, no redirecionamento legado e em todos os estudos de caso PT/EN/ES;
- Lychee nos HTMLs e no `README.md` para detectar links inválidos;
- CSpell estrito para ortografia em português, inglês, espanhol e vocabulário técnico conhecido;
- `actionlint` para validar a sintaxe e a estrutura dos workflows do GitHub Actions.

O workflow roda em todo Pull Request, em todo push que chega à `main` e também pode ser executado manualmente.

LinkedIn e Medium são excluídos da verificação HTTP do Lychee porque esses serviços frequentemente rejeitam requisições automatizadas mesmo quando a URL é válida.

### SEO validation

O [`seo-validation.yml`](workflows/seo-validation.yml) valida os artefatos SEO gerados pelo repositório.

Ele verifica que:

- `index.html` e `en/index.html` possuem RSS autodiscovery, sem atribuir uma tradução inexistente à homepage espanhola;
- as três homepages e todos os estudos possuem canonical própria e alternates recíprocos `pt-BR`, `en`, `es` e `x-default`;
- o JSON-LD estruturado permanece válido e consistente;
- os estudos de caso reutilizam os `@id` canônicos de `Person` e `WebSite`, identificam a página principal e mantêm uma identidade estável para o repositório descrito como `SoftwareSourceCode`;
- `sitemap.xml` contém exatamente as 22 URLs indexáveis (incluindo três serviços), sem duplicação, e possui `lastmod` para todas elas;
- os cinco slugs de estudos de caso existem nos três idiomas;
- a geração de `lastmod` preserva datas versionadas para páginas sem alteração, sem depender do dia em que o runner executa;
- executar [`scripts/sync-seo.py`](scripts/sync-seo.py) não produz diferenças não commitadas.

Esse último ponto funciona como um gate de drift: se catálogo, homepage, dados estruturados ou sitemap ficarem fora de sincronia, o Pull Request falha antes do merge.

### Accessibility

O check `WCAG 2 AA accessibility` é publicado em todos os PRs. O job sempre executa os testes unitários do seletor de impacto e compara os SHAs do PR via Git (three-dot diff, incluindo exclusões e os dois caminhos de renomes). Quando todos os arquivos alterados pertencem à lista conservadora de entradas internas (por exemplo Terraform, documentação interna e workflows de infraestrutura), registra sucesso sem instalar Pa11y, iniciar servidor ou executar navegador. Qualquer entrada desconhecida, alteração de site, dependência compartilhada, configuração ou ferramenta da auditoria exige a suíte completa. Contexto ausente ou falha de comparação também exige auditoria completa. Em todo push para `main` e em execução manual a suíte completa continua obrigatória, independentemente do diff. Não há filtro de paths no gatilho nem alteração de thresholds; o resumo explicita quando não houve scan. O seletor e seus testes ficam em `scripts/select-accessibility-impact.cjs` e `scripts/test-select-accessibility-impact.cjs`.


As suítes de navegador acumulam falhas de cenários independentes por rota, viewport e tipo de validação, com detalhes no log e no `GITHUB_STEP_SUMMARY`. Interações dependentes continuam interrompendo o cenário em caso de falha para evitar erros em cascata; a execução prossegue para os outros cenários. Qualquer falha mantém o código de saída diferente de zero. O resumo final indica também suítes não executadas.

Em falhas do Pa11y, `diagnose-rendered-contrast.cjs` registra `violations` e `incomplete` separadamente, incluindo dados dos checks do axe. As suítes de navegador subsequentes executam mesmo se uma anterior falhar, desde que o servidor local tenha iniciado; o job continua bloqueante e o threshold do Pa11y permanece zero.

O contraste textual renderizado é verificado pelo axe no Pa11y CI sem exclusão global de `color-contrast`. O teste de tokens permanece complementar; casos inconclusivos (por exemplo, gradientes e imagens) e contraste não textual exigem avaliação adicional.

A suíte `scripts/test-accessibility-adaptations.cjs` complementa Pa11y com regressões de ampliação de fonte, reflow, espaçamento de texto e árvore AX do Chromium. Não substitui zoom nativo ou testes com leitores de tela.

O [`accessibility.yml`](workflows/accessibility.yml) sobe o site em um servidor HTTP local e executa Pa11y CI contra as três homepages, currículos e páginas de serviços, além de todos os estudos de caso e das três páginas de fallback offline em português, inglês e espanhol. A avaliação direta do fallback não substitui testes do fluxo offline com service worker.

A configuração usa WCAG 2 AA como baseline e threshold zero para os problemas considerados pelo gate. O objetivo é detectar regressões de semântica, ARIA, estrutura e outras regras automatizáveis de acessibilidade antes do merge.

Arquivos relacionados:

- [`../.pa11yci.cjs`](../.pa11yci.cjs) — configuração do Pa11y CI e descoberta dinâmica dos estudos de caso;
- `index.html`, `en/index.html`, `es/index.html` e os três diretórios `case-studies/` — páginas verificadas;
- [`scripts/test-responsive.cjs`](scripts/test-responsive.cjs) — ausência de overflow, imagens quebradas ou seletor cortado em 320, 360, 390, 768, 1024 e 1440 px, além de abertura/fechamento do menu mobile por teclado nos três idiomas.

Alguns ajustes de CSP são aplicados apenas ao fixture efêmero usado pelo runner local. A política CSP publicada no site não é alterada pelo workflow.

### GitHub Actions security

O [`actions-security.yml`](workflows/actions-security.yml) executa o zizmor sobre a automação do repositório.

O gate bloqueia findings com:

- severidade `Medium` ou superior;
- confiança `Medium` ou superior.

O scanner cobre workflows e também o `dependabot.yml`. A política de pinning está em [`../zizmor.yml`](../zizmor.yml): novos actions devem usar referência imutável por SHA, com exceções explícitas e restritas para os actions legados já documentados na configuração.

Em Pull Requests, o workflow publica um comentário idempotente com:

- estado do security gate;
- quantidade de findings bloqueantes;
- distribuição por severidade e confiança;
- audit, localização e descrição quando houver findings;
- link para o run do GitHub Actions.

O relatório estruturado é produzido por [`scripts/summarize-zizmor.mjs`](scripts/summarize-zizmor.mjs).

### Lighthouse CI

O [`lighthouse.yml`](workflows/lighthouse.yml) sobe o site localmente e executa Lighthouse CI contra `/`, `/en/`, `/es/`, os três currículos, as três páginas de serviços e todos os estudos de caso trilíngues descobertos.

Em Pull Requests, o seletor incremental compara a branch com a base, considera arquivos adicionados, modificados, renomeados e excluídos e percorre as dependências locais referenciadas por HTML, CSS e JavaScript. Cada página afetada é medida duas vezes. Recursos compartilhados selecionam todas as páginas dependentes; mudanças na configuração ou nos scripts do Lighthouse, falhas na comparação e impactos incertos provocam uma auditoria completa. Alterações apenas internas mantêm o check obrigatório verde sem iniciar o navegador.

Às 21h de São Paulo (`0 0 * * *` em UTC) e em execuções manuais, todas as páginas são medidas três vezes a partir da branch padrão. Em todos os modos, os valores usados para os gates são agregados pela mediana. Os relatórios JSON e HTML ficam disponíveis como artifact por um dia, inclusive quando o quality gate falha.

Os budgets estão definidos em [`../lighthouserc.cjs`](../lighthouserc.cjs):

| Categoria | Threshold | Enforcement |
| --- | ---: | --- |
| Performance | 80% | Warning |
| Accessibility | 100% | Blocking |
| Best Practices | 95% | Blocking |
| SEO | 95% | Blocking |

Em Pull Requests, o workflow mantém um único comentário atualizado com os scores das homepages e de todos os estudos de caso, os thresholds e o resultado de cada gate.

O resumo é produzido por [`scripts/summarize-lighthouse.mjs`](scripts/summarize-lighthouse.mjs).

### External link health

O [`external-link-health.yml`](workflows/external-link-health.yml) complementa a verificação rápida de links do `Site validation`.

Ele roda semanalmente e pode ser disparado manualmente. Em Pull Requests, é executado quando o próprio workflow é alterado, permitindo validar mudanças na configuração antes do merge.

Diferenças em relação ao link check do gate principal:

- timeout de 20 segundos;
- até 2 retries por link;
- `failIfEmpty` habilitado para impedir falso sucesso quando nenhum link é encontrado;
- relatório Markdown no Job Summary;
- comentário idempotente no PR quando executado em contexto de Pull Request.

Se o Lychee encontra links quebrados, o relatório é publicado antes de o passo final reprovar o gate.

## Automação de conteúdo

### Import newsletter article

O [`import-newsletter-article.yml`](workflows/import-newsletter-article.yml) é executado manualmente com uma URL de artigo e é o fluxo principal de atualização da newsletter no site.

O workflow tenta recuperar automaticamente título, descrição e data de publicação a partir da página pública. Quando a recuperação não é suficiente, aceita fallbacks manuais informados no `workflow_dispatch`.

O processo:

1. valida e acessa a URL informada;
2. extrai e normaliza os metadados disponíveis;
3. impede duplicidade de URL;
4. atualiza `assets/data/newsletter-articles.json` e mantém até 12 artigos ordenados por data de publicação;
5. executa [`scripts/render-newsletter.py`](scripts/render-newsletter.py) para renderizar a homepage;
6. executa [`scripts/generate-newsletter-feed.py`](scripts/generate-newsletter-feed.py) para regenerar o RSS;
7. executa [`scripts/sync-seo.py`](scripts/sync-seo.py) para sincronizar JSON-LD, RSS discovery e `sitemap.xml` com `lastmod`;
8. valida homepage, RSS e artefatos gerados e executa `git diff --check`;
9. cria uma branch `automation/import-newsletter-article-<run-id>` contendo catálogo e todos os artefatos gerados;
10. cria ou atualiza o Pull Request correspondente para `main`;
11. executa os quality gates aplicáveis, incluindo SEO validation;
12. mescla automaticamente o Pull Request somente quando todos os gates passam.

Cada execução usa uma branch derivada do `run-id`, evitando que uma nova importação sobrescreva outra importação ainda em revisão. Em uma reexecução do mesmo run, a branch correspondente é atualizada com `force-with-lease`.

O workflow não faz push direto para a `main`. Como ele já atualiza catálogo, homepage, RSS, JSON-LD e sitemap no mesmo ciclo da importação, o agendamento diário do `Sync newsletter articles` foi desativado por redundância.

As automações preservam os idiomas de publicação: newsletter/LinkedIn renderiza PT-BR em `index.html`, DEV Community renderiza EN em `en/index.html` e Hashnode renderiza ES-419 em `es/index.html`. Cada fluxo valida que os catálogos e feeds dos outros idiomas não foram alterados; somente metadados SEO compartilhados e determinísticos podem ser atualizados. Não há tradução automática nem equivalência entre artigos externos.

### Sync Hashnode articles

O [`sync-hashnode-articles.yml`](workflows/sync-hashnode-articles.yml) consulta diariamente o RSS público de **Arquitectura en Código**, na mesma frequência diária da integração DEV Community, e também aceita `workflow_dispatch`.

O fluxo:

1. baixa e valida RSS 2.0 ou Atom com a biblioteca padrão do Python;
2. aceita somente URLs HTTPS de `rodri-oliveira-dev.hashnode.dev`;
3. normaliza, deduplica e ordena título, URL, descrição, data e tags em `assets/data/hashnode-articles.json`;
4. preserva o último catálogo válido se o feed estiver vazio, indisponível ou sem itens válidos;
5. renderiza até quatro artigos entre os marcadores `HASHNODE_ARTICLES` de `es/index.html`;
6. sincroniza RSS autodiscovery, JSON-LD e sitemap;
7. encerra sem commit quando não existe diff;
8. caso haja mudança, cria ou atualiza a branch e o único PR `automation/sync-hashnode-articles`, executa os quality gates e deixa o merge para revisão manual.

Para executar manualmente, abra **Actions → Sync Hashnode articles → Run workflow**. Para investigar falhas, confira primeiro o passo de download/validação do RSS, depois o resumo do job e o diff do PR. HTTP 403 geralmente indica bloqueio ao cliente do feed; resposta vazia, XML inválido, data inválida ou URL de outra origem encerram a execução sem apagar o catálogo vigente.

Ao adicionar outra fonte no futuro, mantenha um catálogo e marcadores exclusivos por idioma, valide esquema/host HTTPS antes de qualquer escrita, preserve o último estado válido e limite o workflow aos artefatos editoriais sob sua responsabilidade.

O resultado detalhado da recuperação de metadados também é escrito no Job Summary.

### Sync newsletter articles

O [`sync-newsletter-articles.yml`](workflows/sync-newsletter-articles.yml) não possui mais execução agendada. O cron diário foi removido porque o [`import-newsletter-article.yml`](workflows/import-newsletter-article.yml) passou a cobrir integralmente a necessidade de atualização da newsletter e dos artefatos SEO no momento da importação.

O workflow permanece disponível somente por `workflow_dispatch` como mecanismo manual de reconciliação/fallback. Ele pode ser usado caso seja necessário regenerar a homepage, o RSS, o JSON-LD ou o sitemap a partir do catálogo persistido sem importar um novo artigo.

Quando executado manualmente, ele:

1. renderiza os quatro artigos mais recentes na homepage;
2. regenera o RSS;
3. sincroniza os metadados SEO e o sitemap;
4. valida o conteúdo gerado;
5. encerra sem alteração quando todos os artefatos já estão atualizados;
6. quando existe drift, cria ou atualiza a branch `automation/sync-newsletter-articles` e abre o Pull Request correspondente.

Essa separação mantém uma ferramenta de recuperação operacional sem consumir runners diariamente para uma reconciliação que o fluxo principal já garante.

#### Token das automações com Pull Request

Os workflows de importação, sincronização e otimização da imagem Open Graph usam o `GITHUB_TOKEN` com permissões explícitas de `contents: write` e `pull-requests: write` quando nenhum token dedicado é configurado.

O GitHub pode exigir aprovação manual para iniciar os workflows de um Pull Request criado ou atualizado pelo próprio `GITHUB_TOKEN`. Para permitir que esses gates sejam iniciados automaticamente, pode ser configurado o secret opcional `AUTOMATION_PR_TOKEN`, contendo um token dedicado com acesso mínimo ao repositório para conteúdo e Pull Requests.

Quando `AUTOMATION_PR_TOKEN` existe, ele é preferido. Caso contrário, os workflows usam `github.token` como fallback e informam essa condição no Job Summary.

### IndexNow

O [`indexnow.yml`](workflows/indexnow.yml) é chamado somente após deploy e GitHub Release bem-sucedidos. A execução usa o sitemap do mesmo SHA publicado e inclui o RSS. Como uma release pode acumular vários PRs, a submissão inclui todas as URLs do sitemap em vez de usar o diff do último push. Não há agendamento independente nem notificação por merge. Em falha, reexecute o job de notificação.

## Descoberta e mensuração de SEO e GEO

O site publica HTML estático com conteúdo, navegação, canonical, `hreflang` e JSON-LD disponíveis sem execução de JavaScript. O `robots.txt` permite o rastreamento público e referencia o sitemap. Essa regra geral já permite Googlebot, Bingbot e OAI-SearchBot; não há uma exceção específica para GPTBot porque descoberta em busca e eventual uso para treinamento são decisões distintas, e a política atual do proprietário não exige um tratamento diferente. A finalidade de cada crawler da OpenAI deve ser reavaliada pela [documentação oficial](https://developers.openai.com/api/docs/bots) antes de qualquer mudança.

Não há `llms.txt`: o projeto não depende desse arquivo para descoberta e não existe benefício demonstrado que justifique manter uma segunda representação do conteúdo. Os sinais canônicos continuam sendo o HTML visível, os dados estruturados, os links internos e o sitemap.

Os arquivos de verificação do Google Search Console e do Bing Webmaster Tools já estão publicados na raiz. Eles comprovam a preparação técnica, mas este repositório não contém credenciais nem acesso aos painéis e, portanto, não registra números externos como se fossem resultados validados.

### Rotina mensal de acompanhamento

Use sempre o mesmo intervalo mensal e compare-o ao período anterior e, quando houver volume suficiente, ao mesmo mês do ano anterior.

| Dimensão | Fonte | Procedimento | Interpretação |
| --- | --- | --- | --- |
| URLs indexadas | Search Console e Bing Webmaster Tools | Conferir sitemap, relatórios de indexação e inspeção das 19 URLs canônicas | **Indexação** confirma elegibilidade no índice; não comprova impressão, clique ou citação |
| Impressões e cliques orgânicos | Relatórios de desempenho dos dois buscadores | Exportar totais e segmentar por país, idioma, página e dispositivo | **Impressão** é aparição no resultado; **clique** é visita originada nesse resultado |
| Consultas profissionais | Dimensão de consultas | Acompanhar grupos factuais como arquitetura de software, .NET, C#, modernização, sistemas distribuídos, integrações, APIs, cloud, DDD e observabilidade, sem esperar correspondência exata em consultas anonimizadas | Tendência de descoberta por competência; não é evidência de contratação nem de domínio temático isoladamente |
| Páginas de entrada orgânica | Dimensão de páginas | Comparar homepages e estudos de caso por impressões, cliques e CTR | Identifica quais conteúdos levam visitas; CTR deve ser lida junto com consulta e posição |
| Citações por mecanismos de IA | Painel ou relatório oficial do provedor, quando disponível | Registrar provedor, resposta/consulta, URL citada e data; separar referência navegacional de citação usada na resposta | **Citação** não equivale a indexação nem garante uma visita |
| Visitas provenientes de IA | Logs ou analytics já disponíveis na hospedagem, se houver | Separar referrals identificáveis, como links com origem do provedor, sem inferir tráfego não atribuído | **Visita** comprova acesso; não prova que a página foi citada ou indexada pelo provedor |

Para Google, use o [relatório de desempenho do Search Console](https://support.google.com/webmasters/answer/7576553) para consultas, páginas, impressões, cliques e CTR e a inspeção de URL para confirmar o estado de indexação. No Bing Webmaster Tools, verifique Search Performance, Site Explorer/URL Inspection e o histórico de submissões do sitemap e do IndexNow. O sucesso HTTP do workflow de IndexNow confirma apenas a aceitação da notificação; não garante rastreamento ou inclusão no índice.

Registre a evolução em uma planilha externa ou issue restrita com: mês, fonte, definição da métrica, valor, variação absoluta, variação percentual e observações sobre mudanças editoriais ou técnicas. Não armazene neste repositório exports com consultas potencialmente sensíveis, credenciais ou identificadores de usuários.

### Optimize Open Graph image

O [`optimize-og-image.yml`](workflows/optimize-og-image.yml) gera `assets/social/rodrigo-de-oliveira-og.webp` a partir da imagem PNG de origem.

Ele roda manualmente ou quando, na `main`, muda:

- o próprio workflow;
- `assets/social/rodrigo-de-oliveira-og.png`.

O processo:

1. parte sempre do estado atual da `main`;
2. gera o WebP com Pillow, qualidade 80 e as mesmas dimensões do PNG;
3. reprova a execução se as dimensões mudarem ou se o arquivo final atingir 300 KB;
4. encerra sem commit quando o WebP já está atualizado;
5. quando há mudança, cria um commit na branch fixa `automation/optimize-og-image`;
6. cria ou atualiza um único Pull Request dessa branch para `main`;
7. deixa o asset otimizado passar pelos quality gates antes do merge;
8. registra dimensões, tamanho do arquivo, estado da alteração e Pull Request no Job Summary.

O workflow não faz mais push direto para a `main`. O checkout usa credenciais não persistentes, e uma nova otimização atualiza a branch automatizada com `force-with-lease`, evitando sobrescrever silenciosamente uma alteração remota inesperada.

## Dependabot

O [`dependabot.yml`](dependabot.yml) mantém as GitHub Actions atualizadas sem abandonar o pinning por SHA.

A política atual é:

- verificação semanal às segundas-feiras, 09:00 em `America/Sao_Paulo`;
- atualizações minor e patch agrupadas;
- atualizações major em PRs separados;
- limite de 5 Pull Requests abertos;
- cooldown de 7 dias para version updates;
- commits com prefixo `ci`.

O cooldown reduz a exposição imediata a releases recém-publicadas. Atualizações de segurança continuam sendo tratadas pelo mecanismo próprio de security updates do Dependabot.

## Relatórios em Pull Requests

Três workflows publicam feedback diretamente na conversa do PR:

| Workflow | Marcador do comentário | Conteúdo |
| --- | --- | --- |
| Lighthouse CI | `<!-- lighthouse-ci-report -->` | Scores e status dos quality gates |
| GitHub Actions security | `<!-- zizmor-security-report -->` | Findings e status do security gate |
| External link health | `<!-- external-link-health-report -->` | Contagens, redirects, erros e status do link gate |

Os marcadores tornam os comentários idempotentes: novas execuções atualizam o comentário existente em vez de criar um novo comentário para cada commit.

## Princípios de segurança e manutenção

Os workflows seguem algumas regras comuns:

- permissões do `GITHUB_TOKEN` são mantidas no menor escopo necessário para cada job;
- actions novas devem ser fixadas por SHA sempre que possível;
- checks usados como gates de PR não dependem de filtros de caminho que poderiam impedir a emissão do status obrigatório;
- runs anteriores do mesmo contexto são cancelados quando isso é seguro, reduzindo consumo desnecessário de runner;
- workflows que precisam escrever no repositório mantêm essa permissão explícita e limitada ao caso operacional;
- automações de conteúdo devem preferir branch + Pull Request em vez de push direto para a `main` protegida;
- relatórios são publicados antes do enforcement final quando isso é necessário para preservar o diagnóstico de uma falha.

## Arquivos relacionados

Além dos workflows, a automação depende destes arquivos:

- [`dependabot.yml`](dependabot.yml) — atualização das GitHub Actions;
- [`../zizmor.yml`](../zizmor.yml) — política do scanner de segurança;
- [`../lighthouserc.cjs`](../lighthouserc.cjs) — URLs, número de runs e budgets do Lighthouse;
- [`../.pa11yci.cjs`](../.pa11yci.cjs) — configuração de acessibilidade e descoberta das páginas;
- [`scripts/render-newsletter.py`](scripts/render-newsletter.py) — renderização dos artigos;
- [`scripts/generate-newsletter-feed.py`](scripts/generate-newsletter-feed.py) — geração do RSS;
- [`scripts/sync-devto-articles.py`](scripts/sync-devto-articles.py) — catálogo e renderização da publicação inglesa;
- [`scripts/sync-hashnode-articles.py`](scripts/sync-hashnode-articles.py) — catálogo e renderização da publicação espanhola;
- [`scripts/sync-seo.py`](scripts/sync-seo.py) — sincronização de JSON-LD, RSS discovery e sitemap;
- [`scripts/summarize-lighthouse.mjs`](scripts/summarize-lighthouse.mjs) — resumo e comentário do Lighthouse;
- [`scripts/summarize-zizmor.mjs`](scripts/summarize-zizmor.mjs) — resumo e comentário do zizmor.

Ao alterar um workflow ou um desses arquivos de suporte, o Pull Request deve permanecer verde nos gates aplicáveis antes do merge.

A baseline RBAC atual da identidade de deploy é `Reader` no Resource Group e `Storage Blob Data Contributor` no contêiner `tfstate`; não há permissão de provisionamento concedida. A reconciliação de identidade verifica as atribuições diretas nos escopos conhecidos por pós-condições de data sources, em plano local do operador autorizado. O CI sem credenciais não comprova essa baseline efetiva. Antes do primeiro apply, revisar os papéis específicos dos recursos modelados, a separação de IAM e a aprovação do plano efetivo; ver [baseline e riscos](../infra/terraform/README.md#baseline-rbac-de-bootstrap-e-evolução).

### Azure OIDC Validation

O [workflow](workflows/azure-oidc-validation.yml) é exclusivamente manual e o job autenticado roda apenas na `main`. Reutiliza as três variáveis Azure existentes e `id-token: write`; não executa com credenciais em PRs. Valida o Resource Group, testa escrita, aquisição/liberação de lease de 60 segundos e exclusão de um blob sintético descartável em `tfstate/_validation/`, inicializa o backend remoto com OIDC e executa `terraform validate`. Não executa plan/apply/import nem publica state ou credenciais. O teste de lease não representa concorrência entre dois processos Terraform; a retenção do armazenamento pode manter versões do blob de teste. Veja [bootstrap e riscos](../infra/terraform/README.md). Após aprovação e merge, execute manualmente e registre o link na issue #139.
