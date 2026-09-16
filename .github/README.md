# Automação e GitHub Actions

Este diretório concentra a automação de CI, qualidade, segurança e manutenção do portfólio.

A estratégia é manter o site estático simples, mas protegido por verificações automatizadas que cubram integridade do conteúdo, acessibilidade, segurança dos workflows, qualidade percebida, saúde de links externos e manutenção das próprias GitHub Actions.

## Visão geral

| Workflow | Arquivo | Execução | Objetivo |
| --- | --- | --- | --- |
| Site validation | [`site-validation.yml`](workflows/site-validation.yml) | Pull Request, push em `main` e manual | Validar HTML, links, ortografia e workflows |
| SEO validation | [`seo-validation.yml`](workflows/seo-validation.yml) | Pull Request, push em `main` e manual | Validar JSON-LD, sitemap, RSS discovery e consistência dos artefatos SEO |
| Accessibility | [`accessibility.yml`](workflows/accessibility.yml) | Pull Request, push em `main` e manual | Aplicar verificações automatizadas de WCAG 2 AA |
| GitHub Actions security | [`actions-security.yml`](workflows/actions-security.yml) | Pull Request, push em `main` e manual | Auditar a segurança da automação com zizmor |
| Lighthouse CI | [`lighthouse.yml`](workflows/lighthouse.yml) | Pull Request, push em `main` e manual | Medir Performance, Accessibility, Best Practices e SEO |
| External link health | [`external-link-health.yml`](workflows/external-link-health.yml) | Semanal, manual e quando o próprio workflow muda em PR | Detectar link rot com uma verificação externa mais tolerante |
| Import newsletter article | [`import-newsletter-article.yml`](workflows/import-newsletter-article.yml) | Manual | Importar metadados e atualizar catálogo, homepage, RSS, JSON-LD e sitemap via Pull Request |
| Sync newsletter articles | [`sync-newsletter-articles.yml`](workflows/sync-newsletter-articles.yml) | Manual, somente fallback | Reconciliar manualmente os artefatos da newsletter caso necessário |
| Notify IndexNow | [`indexnow.yml`](workflows/indexnow.yml) | Push em `main`, diário e manual | Notificar mecanismos compatíveis com IndexNow sobre URLs públicas alteradas |
| Optimize Open Graph image | [`optimize-og-image.yml`](workflows/optimize-og-image.yml) | Push específico em `main` e manual | Gerar e validar o WebP e propor a atualização via Pull Request |

## Quality gates

### Site validation

O [`site-validation.yml`](workflows/site-validation.yml) é o gate estrutural principal do repositório.

Ele executa:

- `html-validate` em `index.html`, `en/index.html` e `pt-br/index.html`;
- Lychee nos HTMLs e no `README.md` para detectar links inválidos;
- CSpell para ortografia em português, inglês e vocabulário técnico conhecido;
- `actionlint` para validar a sintaxe e a estrutura dos workflows do GitHub Actions.

O workflow roda em todo Pull Request, em todo push que chega à `main` e também pode ser executado manualmente.

LinkedIn e Medium são excluídos da verificação HTTP do Lychee porque esses serviços frequentemente rejeitam requisições automatizadas mesmo quando a URL é válida.

### SEO validation

O [`seo-validation.yml`](workflows/seo-validation.yml) valida os artefatos SEO gerados pelo repositório.

Ele verifica que:

- `index.html` e `en/index.html` possuem RSS autodiscovery;
- o JSON-LD estruturado permanece válido e consistente;
- `sitemap.xml` é XML válido e possui `lastmod` para as URLs indexáveis;
- executar [`scripts/sync-seo.py`](scripts/sync-seo.py) não produz diferenças não commitadas.

Esse último ponto funciona como um gate de drift: se catálogo, homepage, dados estruturados ou sitemap ficarem fora de sincronia, o Pull Request falha antes do merge.

### Accessibility

O [`accessibility.yml`](workflows/accessibility.yml) sobe o site em um servidor HTTP local e executa Pa11y CI contra as páginas em português e inglês.

A configuração usa WCAG 2 AA como baseline e threshold zero para os problemas considerados pelo gate. O objetivo é detectar regressões de semântica, ARIA, estrutura e outras regras automatizáveis de acessibilidade antes do merge.

Arquivos relacionados:

- [`../.pa11yci`](../.pa11yci) — configuração do Pa11y CI;
- `index.html` e `en/index.html` — páginas verificadas.

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

O [`lighthouse.yml`](workflows/lighthouse.yml) sobe o site localmente e executa Lighthouse CI contra `/` e `/en/`.

Cada página é medida três vezes para reduzir variação do runner. Os valores usados para os gates são agregados pela mediana.

Os budgets estão definidos em [`../lighthouserc.cjs`](../lighthouserc.cjs):

| Categoria | Threshold | Enforcement |
| --- | ---: | --- |
| Performance | 80% | Warning |
| Accessibility | 90% | Warning |
| Best Practices | 95% | Blocking |
| SEO | 95% | Blocking |

Em Pull Requests, o workflow mantém um único comentário atualizado com os scores das duas páginas, os thresholds e o resultado de cada gate.

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

O [`indexnow.yml`](workflows/indexnow.yml) notifica o endpoint público do IndexNow quando alterações relevantes chegam à `main`.

O workflow também possui execução manual e uma execução diária de fallback. Esse agendamento é independente da sincronização da newsletter: ele existe apenas para cobrir cenários em que uma alteração tenha sido mesclada por uma credencial de automação que não origine um novo evento `push` de workflow.

A submissão é limitada às URLs públicas pertinentes à alteração, incluindo a homepage, a versão em inglês e o RSS quando aplicável.

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
- [`../.pa11yci`](../.pa11yci) — configuração de acessibilidade;
- [`scripts/render-newsletter.py`](scripts/render-newsletter.py) — renderização dos artigos;
- [`scripts/generate-newsletter-feed.py`](scripts/generate-newsletter-feed.py) — geração do RSS;
- [`scripts/sync-seo.py`](scripts/sync-seo.py) — sincronização de JSON-LD, RSS discovery e sitemap;
- [`scripts/summarize-lighthouse.mjs`](scripts/summarize-lighthouse.mjs) — resumo e comentário do Lighthouse;
- [`scripts/summarize-zizmor.mjs`](scripts/summarize-zizmor.mjs) — resumo e comentário do zizmor.

Ao alterar um workflow ou um desses arquivos de suporte, o Pull Request deve permanecer verde nos gates aplicáveis antes do merge.
