# Especificação da integração com SonarCloud

## 1. Contexto e estado atual

Esta especificação registra a etapa 1 de 4 da integração do projeto
`rodri-oliveira-dev_rodri-oliveira-dev.github.io` com o SonarCloud. O levantamento
foi realizado em 12 de novembro de 2026, sem alterar o site, os workflows ou as
configurações externas do repositório.

O repositório contém um site estático publicado no GitHub Pages. O código
analisável é composto principalmente por HTML, CSS e JavaScript, além de scripts
de automação e testes em Python, JavaScript, CommonJS e ECMAScript modules. Os
workflows GitHub Actions são escritos em YAML. Não existem manifesto de pacote,
etapa de compilação ou dependências de aplicação versionadas.

As validações existentes já cobrem responsabilidades específicas:

- `Site validation`: contratos editoriais e de localização, HTML, links,
  ortografia e sintaxe dos workflows;
- `SEO validation`: geração determinística, JSON-LD e sitemap;
- `Accessibility`: WCAG 2 AA, responsividade e navegação por teclado;
- `Lighthouse CI`: desempenho, acessibilidade, boas práticas e SEO;
- `GitHub Actions security`: segurança dos workflows com zizmor.

### 1.1 Evidências observadas

- Não há `sonar-project.properties`, `.sonarcloud.properties`, workflow, action,
  token ou referência versionada ao SonarCloud/SonarQube.
- O histórico Git consultado não mostrou integração Sonar anterior.
- O repositório não possui secret chamado `SONAR_TOKEN`; somente os nomes dos
  secrets e variables foram consultados, sem ler valores.
- O SonarCloud possui uma análise bem-sucedida da `main`, concluída em
  `2026-11-12T14:15:59Z`, para o commit
  `9201b8b82a4bcf96bad2ed736838a364eb8e76eb`.
- Essa é a única análise encontrada. Ela indexou 74 arquivos e 18.305 linhas de
  código, com HTML, CSS, JavaScript, Python, XML e YAML.
- O snapshot reportou 3 bugs, 8 vulnerabilidades, 202 code smells e 8,7% de
  duplicação. Esses totais são inventário inicial, não uma decisão de aceite ou
  justificativa para desabilitar regras.
- O Quality Gate está `NOT_COMPUTED`, sem condições retornadas. A documentação
  oficial informa que isso pode ocorrer quando existe apenas uma análise; também
  pode ocorrer quando a definição de código novo não está configurada.
- O commit analisado não possui check run do SonarCloud no GitHub. Os checks
  observados são os workflows já existentes.
- A `main` é protegida por um repository ruleset ativo: exige Pull Request,
  resolução de conversas, branch atualizada e os checks `Site validation`,
  `WCAG 2 AA accessibility`, `Lighthouse quality`, `zizmor security audit` e
  `SEO metadata consistency`.

### 1.2 Método de análise atual e limitação

As evidências são consistentes, com alta confiança, com **Automatic Analysis**:
houve análise do SHA atual sem configuração de scanner, workflow ou credencial no
repositório. Porém, o endpoint administrativo usado para consultar diretamente o
método de análise e o contexto do scanner respondeu HTTP 404 para a credencial
disponível. Por isso, o método não está administrativamente confirmado nesta
etapa e não deve ser tratado como fato absoluto.

Antes de qualquer implementação, a etapa 2 deverá confirmar em **Project
Settings > Analysis Method** se Automatic Analysis está habilitado. Automatic
Analysis e análise por CI não podem operar simultaneamente; a documentação da
SonarSource informa que um scanner por CI falha quando Automatic Analysis está
ativo.

## 2. Problemas identificados

1. O Quality Gate ainda não produz resultado utilizável.
2. Não há configuração versionada do escopo, da classificação de testes ou das
   exclusões do projeto.
3. Arquivos gerados e arquivos de verificação de domínio foram indexados, embora
   não representem código-fonte mantido manualmente.
4. Testes em `.github/scripts/` aparecem no inventário analisado, mas não há
   evidência de que estejam classificados como código de teste.
5. Ainda não foi comprovada a análise de Pull Requests nem a decoração do PR no
   GitHub.
6. O check do SonarCloud não faz parte do ruleset da `main`.
7. Não existe relatório de cobertura. Os testes atuais validam comportamento e
   contratos, mas seus comandos não geram um formato de cobertura importável já
   configurado no repositório.

## 3. Objetivo e escopo

Estabelecer uma integração simples, segura e rastreável que analise código novo
em Pull Requests e na `main`, publique um Quality Gate confiável e complemente os
gates existentes sem reproduzir suas responsabilidades.

Inclui:

- confirmar e manter um único método de análise;
- versionar o escopo mínimo necessário;
- separar código-fonte de código de teste;
- configurar definição de código novo e Quality Gate;
- validar análise e decoração de Pull Requests;
- tornar o check obrigatório somente depois de estabilizado.

Não inclui:

- corrigir findings do snapshot inicial;
- introduzir dependências ou telemetria;
- substituir testes, Lighthouse, Pa11y, validadores de SEO ou zizmor;
- produzir cobertura artificial ou reduzir regras para obter aprovação;
- modificar conteúdo publicado, `sitemap.xml` ou artefatos gerados do site.

## 4. Requisitos

### 4.1 Requisitos funcionais

- **RF-01:** analisar a `main` e Pull Requests direcionados à `main`.
- **RF-02:** usar exatamente um método: Automatic Analysis ou CI, nunca ambos.
- **RF-03:** analisar todo arquivo-fonte suportado que seja mantido manualmente,
  incluindo páginas HTML, CSS, JavaScript, scripts Python/Node e workflows YAML.
- **RF-04:** classificar os arquivos `test_*.py`, `test-*.cjs` e `test-*.mjs` de
  `.github/scripts/` como testes, sem removê-los da análise.
- **RF-05:** excluir somente artefatos gerados, arquivos de comprovação de
  propriedade e formatos sem valor de análise estática.
- **RF-06:** publicar o resultado do Quality Gate no SonarCloud e, em PRs, no
  GitHub.
- **RF-07:** manter o Quality Gate do Sonar independente dos cinco gates atuais.
- **RF-08:** preservar o histórico completo do Git para atribuição SCM e cálculo
  correto de código novo.
- **RF-09:** impedir merge quando o check Sonar obrigatório e estabilizado
  falhar ou não for publicado.

### 4.2 Requisitos não funcionais

- **RNF-01 — Segurança:** nenhuma credencial em arquivos, argumentos exibidos ou
  logs. Se CI vier a ser necessário, usar um secret `SONAR_TOKEN` de escopo
  mínimo e sem disponibilizá-lo a código não confiável.
- **RNF-02 — Manutenção:** preferir configuração declarativa curta e o método já
  ativo, evitando um workflow adicional sem necessidade comprovada.
- **RNF-03 — Custo:** não executar novamente testes ou auditorias já cobertos por
  jobs existentes e não instalar dependências apenas para a análise.
- **RNF-04 — Reprodutibilidade:** versionar o escopo e revisar o conjunto de
  arquivos indexados após cada mudança de configuração.
- **RNF-05 — Proteção:** preservar o ruleset e os checks atuais da `main`.
- **RNF-06 — Qualidade:** não desabilitar regras, excluir código legítimo ou
  alterar thresholds para mascarar findings.
- **RNF-07 — Compatibilidade:** a integração não deve alterar o artefato do
  GitHub Pages, a CSP ou o comportamento do site.

## 5. Estratégia recomendada

### 5.1 Método

**Manter Automatic Analysis**, condicionado à confirmação administrativa no
início da etapa 2. Essa opção é adequada ao site estático, já produziu o primeiro
snapshot sem consumo de runner próprio, dispensa secret de análise no GitHub e
tem menor superfície de manutenção.

Se a tela administrativa mostrar que Automatic Analysis está desabilitado, a
implementação deve parar e esta decisão deve ser revisada. Somente nesse cenário
deve ser especificado um workflow dedicado de CI; não se deve adicionar scanner
“por garantia”.

### 5.2 Configuração versionada

Na etapa 2, foi criado `.sonarcloud.properties`, formato usado pela Automatic
Analysis, contendo apenas:

- `sonar.projectKey=rodri-oliveira-dev_rodri-oliveira-dev.github.io`;
- `sonar.organization=rodri-oliveira-dev`;
- `sonar.sources=.` para preservar todos os arquivos suportados a partir da raiz;
- `sonar.tests=.github/scripts` com inclusões restritas a `test_*.py`,
  `test-*.cjs` e `test-*.mjs`;
- exclusões somente para os quatro artefatos HTML/XML suportados que são gerados
  ou usados para comprovação de propriedade;
- `sonar.sourceEncoding=UTF-8`.

Não foram configurados sufixos de linguagem: os analisadores padrão já detectam
JavaScript, CSS e HTML, e sobrescrever os defaults aumentaria a manutenção. Não
foi criado `sonar-project.properties`, pois esse arquivo pertence à estratégia
com scanner/CI e introduzi-lo junto de Automatic Analysis tornaria ambíguo o
método escolhido.

Não duplicar configurações entre a interface e o arquivo. Parâmetros de escopo
devem ficar versionados; definição de código novo, Quality Gate e método de
análise ficam no SonarCloud.

A API disponível não expôs a confirmação administrativa do método. A pendência
permaneceu na etapa 3: antes de qualquer migração para CI ou de tornar um check
Sonar obrigatório, um administrador deve abrir **Project Settings > Analysis
Method** e confirmar que **Automatic Analysis** está habilitado e que CI-based
analysis não está configurada. Nenhum valor externo foi presumido ou alterado.

### 5.3 Quality Gate e código novo

- Usar inicialmente o **Sonar way**, sem criar um gate mais permissivo.
- Configurar uma definição explícita de código novo. Para a `main`, preferir uma
  janela de dias compatível com a cadência do repositório, pois as análises
  atuais não publicam `projectVersion`; o valor deve ser decidido e registrado na
  etapa 2. Em PRs, a base é a branch de destino.
- Executar uma segunda análise antes de diagnosticar `NOT_COMPUTED` como defeito.
- Não criar meta de cobertura sem relatório real. Se a cobertura se tornar
  requisito, tratá-la em iniciativa separada com geração e importação verificável,
  sem declarar os testes atuais como cobertura executada.

Na etapa 3, a API confirmou que `Sonar way` é o Quality Gate padrão e integrado
da organização. As condições publicadas para código novo são:

- security rating A;
- reliability rating A;
- maintainability rating A;
- cobertura mínima de 80%;
- duplicação máxima de 3%;
- 100% dos Security Hotspots revisados.

Isso não confirma que o projeto já tenha uma avaliação calculada: a `main` e o
PR 117 retornaram `NOT_COMPUTED`, sem condições, e o status de projeto retornou
`NONE`. A associação efetiva do projeto, a definição de código novo e o
comportamento da condição de cobertura sem relatório instrumentado devem ser
confirmados no painel antes de transformar o resultado em check obrigatório.
Não foi criada cobertura artificial nem alterado o gate padrão.

### 5.4 Pull Requests, `main` e proteção

Automatic Analysis deve analisar eventos de PR e mudanças na `main`. O mesmo PR
desta integração será usado para comprovar a análise de PR e a decoração. Depois
de pelo menos uma execução estável e com nome de check conhecido, adicionar esse
check ao repository ruleset da `main`.

O check não deve ser tornado obrigatório antes da comprovação, pois um nome
incorreto ou um evento que não publique status bloquearia todos os merges. A
análise pós-merge da `main` deverá ser verificada na conclusão da etapa 4.

Na etapa 3, o PR 117 continuou sem análise registrada no SonarCloud e sem check
Sonar no GitHub. O PR permanece draft e contém apenas configuração e
documentação; não há evidência suficiente para atribuir a ausência a uma causa
específica. O repository ruleset não foi alterado.

### 5.5 Reutilização dos mecanismos existentes

O SonarCloud será responsável por bugs, vulnerabilidades, security hotspots,
maintainability e duplicação. Permanecem nos workflows atuais:

- execução dos testes funcionais e editoriais;
- validação HTML, links e ortografia;
- acessibilidade e responsividade;
- Lighthouse e SEO determinístico;
- segurança dos próprios workflows com zizmor.

Não serão copiados comandos desses workflows para a análise Sonar. O resultado
do Sonar será um check adicional e ortogonal.

### 5.6 Decisão da etapa 3 sobre GitHub Actions

Não foi criado `.github/workflows/sonarcloud.yml`. A estratégia permanece
**Automatic Analysis**, pelos seguintes motivos:

1. já existe uma análise bem-sucedida da `main` sem scanner, workflow ou
   `SONAR_TOKEN` no GitHub;
2. `.sonarcloud.properties` é a configuração versionada escolhida para esse
   método;
3. a configuração administrativa remota continua inacessível pela API
   disponível, portanto não é possível afirmar que Automatic Analysis esteja
   desabilitada;
4. a documentação oficial proíbe executar CI-based analysis simultaneamente com
   Automatic Analysis, pois o scanner por CI falharia;
5. um workflow acrescentaria secret, consumo de runner e manutenção sem benefício
   demonstrado para este site estático.

Consequentemente, não existem eventos de GitHub Actions, permissões,
concorrência, timeout ou action SonarSource novos nesta etapa. Também não é
necessário criar `SONAR_TOKEN` enquanto Automatic Analysis for a estratégia
vigente.

## 6. Escopo de arquivos

### 6.1 Arquivos que devem ser analisados

- `**/*.html`, inclusive traduções, estudos de caso, serviços, currículo e o
  redirecionamento legado publicado;
- `assets/css/**/*.css` e `curriculo/**/*.css`;
- `assets/js/**/*.js` e `assets/js/**/*.mjs`;
- `.github/scripts/**/*.py`, `.github/scripts/**/*.js`,
  `.github/scripts/**/*.mjs` e `.github/scripts/**/*.cjs`;
- `.github/workflows/**/*.yml`;
- configurações analisáveis mantidas manualmente, como `lighthouserc.cjs`.

As versões traduzidas não devem ser excluídas para reduzir duplicação: elas são
artefatos publicados e podem conter defeitos ou riscos próprios.

### 6.2 Arquivos de teste

Devem continuar analisados, mas classificados como testes:

- `.github/scripts/test_*.py`;
- `.github/scripts/test-*.cjs`;
- `.github/scripts/test-*.mjs`.

Os demais arquivos de `.github/scripts/` permanecem código-fonte de automação.

### 6.3 Exclusões justificadas

| Padrão ou arquivo | Justificativa |
| --- | --- |
| `sitemap.xml` | Artefato determinístico gerado por `sync-seo.py`; a qualidade do conteúdo é coberta pelo gate SEO. |
| `newsletter/feed.xml` | Feed gerado; sua consistência é validada pelos scripts e pelo gate SEO. |
| `google03f812d1021f07e7.html` | Arquivo estático de verificação de propriedade, sem lógica mantida. |
| `BingSiteAuth.xml` | Arquivo estático de verificação de propriedade, sem lógica mantida. |
| `1e7dfc65bd806e29edef5985f15cdb79.txt` | Chave pública do IndexNow, sem código analisável. |
| `assets/brand/**`, `assets/profile/**`, `assets/social/**` | Imagens binárias; devem continuar no repositório, mas não têm análise estática de código. |
| `assets/contact/**` | Cartão de contato, sem código-fonte. |
| `assets/diagrams/**/*.svg` e `favicon.svg` | Ilustrações vetoriais declarativas, sem lógica executável; validações de presença e referências já existem. |
| `assets/data/**/*.json` | Catálogos de conteúdo gerados/sincronizados; seus contratos são validados pelos testes existentes. |
| `docs/**`, `README*.md`, `AGENTS.md`, `.github/skills/**` e `.github/AUTOMATION.md` | Documentação e instruções operacionais, fora do escopo de análise de código. |

Formatos que o scanner já ignora não precisam de padrões redundantes em
`.sonarcloud.properties`. As exclusões explícitas devem se limitar a arquivos
suportados que hoje são indexados, principalmente XML e HTML gerados ou de
verificação.

Por isso, a configuração implementada aplica explicitamente apenas:

- `sitemap.xml`;
- `newsletter/feed.xml`;
- `google03f812d1021f07e7.html`;
- `BingSiteAuth.xml`.

Mídias, SVG, JSON, TXT, Markdown e documentação permanecem documentados como fora
do escopo, mas não receberam padrões redundantes porque não apareceram como
código analisado no snapshot inicial. Não há diretório de dependências
versionado; dependências locais ignoradas pelo Git também são ignoradas pelo
scanner por padrão.

## 7. Arquivos e configurações afetados nas próximas etapas

| Item | Ação prevista | Etapa |
| --- | --- | --- |
| `docs/sonarcloud-integration.md` | Criar a especificação e registrar evidências posteriores. | 1–4 |
| `.sonarcloud.properties` | Criado com identidade, escopo, testes, exclusões mínimas e UTF-8. | 2 |
| `.github/workflows/sonarcloud.yml` | Não criado: CI duplicaria a estratégia escolhida sem confirmação de que Automatic Analysis está desabilitada. | 3 |
| SonarCloud: Analysis Method | Confirmação manual pendente; não habilitar CI em paralelo. | 2–3 |
| SonarCloud: New Code e Quality Gate | `Sonar way` identificado como padrão; associação, código novo e cálculo permanecem pendentes. | 2–3 |
| GitHub repository ruleset `main` | Preservado sem mudanças; check Sonar ainda não foi comprovado. | 3 |

Nenhum workflow existente precisa ser modificado na estratégia recomendada. Um
novo workflow e `sonar-project.properties` são alternativas de contingência,
somente após decisão documentada de migrar para CI e desabilitar Automatic
Analysis.

## 8. Riscos, dependências e decisões técnicas

| Risco ou dependência | Tratamento |
| --- | --- |
| Método atual não confirmado por permissão administrativa | Confirmar na interface antes de criar qualquer configuração. |
| Automatic Analysis e CI em paralelo | Proibir a implementação do segundo método enquanto o primeiro estiver ativo. |
| Quality Gate ainda não calculado | Obter segunda análise e confirmar a definição de código novo. |
| Check obrigatório antes de estar estável | Validar nome, eventos e decoração no PR antes de alterar o ruleset. |
| Findings no código legado | Aplicar gate em código novo; triar o legado separadamente, sem exclusões oportunistas. |
| Duplicação natural entre idiomas | Manter as páginas analisadas e avaliar findings reais, sem excluir traduções. |
| Ausência de cobertura | Não inventar métrica nem adicionar dependência nesta integração. |
| PRs de forks sem secrets | Automatic Analysis evita disponibilizar token; se houver migração para CI, redesenhar a ameaça antes de executar scanner autenticado. |
| Mudança externa no SonarCloud ou ruleset | Registrar data, responsável e evidência no PR, pois não aparece integralmente no diff Git. |
| Arquivos internos incluídos pelo `rsync` do Pages | Corrigido na etapa 4: `.sonarcloud.properties` e esta especificação são excluídos do artefato e sua ausência é verificada no build. |

Decisões:

1. Automatic Analysis é a opção preferida pela evidência atual e pelo menor
   custo operacional.
2. `Sonar way` é o baseline; regras não serão relaxadas para obter sucesso.
3. O Sonar complementa e não substitui os quality gates existentes.
4. A obrigatoriedade do check será aplicada somente após validação end-to-end.
5. Esta etapa é exclusivamente documental e não altera `sitemap.xml`.

## 9. Critérios de aceitação

### Etapa 1

- [x] Estado do repositório, workflows e integração anterior inspecionados.
- [x] Projeto SonarCloud e primeira análise consultados.
- [x] Limitação de confirmação do método registrada sem presunção absoluta.
- [x] Escopo, exclusões, riscos e estratégia definidos.
- [x] Nenhum workflow, dependência, arquivo publicado ou sitemap alterado.
- [x] Apenas esta especificação adicionada à branch e ao PR da integração.

### Etapa 2

- [x] `.sonarcloud.properties` criado para Automatic Analysis.
- [x] Projeto e organização identificados sem token ou credencial.
- [x] Raiz de fontes preservada, sem limitar linguagens suportadas.
- [x] Testes classificados por inclusões precisas e mantidos na análise.
- [x] Exclusões restritas a artefatos gerados ou de verificação.
- [x] Nenhum workflow, Quality Gate, relatório de cobertura ou regra alterado.
- [x] Nenhuma página HTML, recurso visual ou entrada do sitemap modificado.
- [ ] Método Automatic Analysis confirmado manualmente por administrador.

### Etapa 3

- [x] Workflows, gatilhos, permissões, timeouts e checks obrigatórios revisados.
- [x] Ruleset da `main` confirmado com os cinco checks existentes e preservado.
- [x] `Sonar way` identificado como Quality Gate padrão da organização.
- [x] Estados da `main` e do PR consultados: `NOT_COMPUTED`, sem condições.
- [x] Ausência de `SONAR_TOKEN` confirmada pela listagem de nomes dos secrets.
- [x] Workflow Sonar não criado para evitar análise paralela e secret desnecessário.
- [x] Nenhum workflow, regra de proteção ou conteúdo publicado modificado.
- [ ] Automatic Analysis e integração GitHub confirmadas por administrador.
- [ ] Definição de código novo e associação do Quality Gate confirmadas no painel.
- [ ] Primeira análise e decoração de PR observadas com resultado calculado.

### Integração completa

- [ ] Método de análise confirmado e único.
- [ ] Escopo versionado e conjunto de arquivos indexados revisado.
- [ ] Testes classificados corretamente e código legítimo preservado.
- [ ] Quality Gate calculado na `main` e em PR.
- [ ] Decoração e check do PR publicados com nome estável.
- [ ] Check Sonar adicionado ao ruleset sem remover os cinco checks existentes.
- [ ] Nenhuma credencial exposta e nenhum secret disponível ao site publicado.
- [ ] Todos os gates existentes permanecem verdes.
- [ ] Análise da `main` validada após o merge.

## 10. Plano resumido das etapas 2, 3 e 4

### Etapa 2 — configuração controlada

1. `.sonarcloud.properties` criado com escopo, testes e exclusões mínimas.
2. Confirmação administrativa do método permanece como ação manual documentada.
3. Definição de código novo e confirmação de `Sonar way` permanecem externas ao
   repositório e não foram alteradas nesta etapa.
4. A configuração será enviada à mesma branch e ao mesmo PR.

### Etapa 3 — validação de PR e proteção

1. A estratégia Automatic Analysis foi preservada e nenhum workflow foi criado.
2. Quality Gate, análises, secrets e ruleset foram consultados sem alteração.
3. A análise e a decoração deste PR ainda não foram publicadas pelo SonarCloud.
4. Confirmações administrativas e qualquer proteção adicional foram adiadas;
   nenhuma ação externa foi declarada como concluída sem evidência.

### Etapa 4 — aceite final

1. Configuração, resultados SonarCloud, workflows, secrets e ruleset revisados.
2. Publicação dos arquivos internos da integração impedida no build do Pages.
3. Evidências comprovadas e pendências remotas registradas neste documento.
4. Validação pós-merge da `main` permanece pendente e deve ser registrada no PR.

## 11. Arquitetura final

A integração final mantém um único mecanismo de análise:

1. o SonarCloud lê o repositório GitHub por **Automatic Analysis**;
2. `.sonarcloud.properties` define identidade, fontes, testes, exclusões e UTF-8;
3. nenhuma action Sonar, credencial ou dependência é executada no GitHub Actions;
4. o `Sonar way` permanece como Quality Gate padrão da organização;
5. os cinco checks existentes continuam independentes e obrigatórios;
6. `deploy-pages.yml` remove a configuração e esta especificação do artefato
   publicado.

Não há eventos de execução definidos no repositório para o SonarCloud. Quando
Automatic Analysis estiver confirmado no painel, o serviço remoto deve reagir a
mudanças na `main` e a Pull Requests. Não existe fallback por CI: qualquer
migração futura exige primeiro desabilitar Automatic Analysis e revisar esta
especificação.

## 12. Evidências da validação final

### 12.1 Implementação local

- `.sonarcloud.properties` possui sete propriedades únicas, sem token;
- `sonar.sources` e `sonar.tests` usam diretórios existentes e sem wildcard;
- dez arquivos correspondem às inclusões de teste;
- os quatro caminhos excluídos existem e têm justificativa versionada;
- `sonar-project.properties` e `.github/workflows/sonarcloud.yml` não existem;
- não há mecanismo de análise duplicado nem `SONAR_TOKEN` no repositório;
- o build do Pages exclui os dois arquivos internos da integração;
- nenhum HTML, CSS, JavaScript, catálogo ou sitemap foi alterado.

### 12.2 Snapshot remoto disponível

O único snapshot da `main` foi concluído em `2026-11-12T14:15:59Z` para o commit
`9201b8b82a4bcf96bad2ed736838a364eb8e76eb`, anterior a esta configuração.
Portanto, ele comprova acesso e análise do repositório, mas não comprova a
aplicação de `.sonarcloud.properties`.

| Evidência | Resultado observado |
| --- | --- |
| Arquivos / linhas de código | 74 / 18.305 |
| Issues abertas | 213: 202 code smells, 8 vulnerabilidades e 3 bugs |
| Impactos High / Blocker | 22 / 2; 24 issues no filtro combinado |
| Ratings gerais | confiabilidade D, segurança E e manutenibilidade A |
| Duplicação geral | 8,7% |
| Security Hotspots | 0 |
| Cobertura | medida ausente; nenhum dado real disponível |
| Quality Gate da `main` | `NOT_COMPUTED`, sem condições |
| Quality Gate do PR 117 | `NOT_COMPUTED`, sem condições |
| Análises de Pull Request | nenhuma registrada |

Os quatro arquivos configurados em `sonar.exclusions` ainda aparecem no snapshot
remoto porque a análise antecede o PR. Isso é uma limitação temporal, não
evidência de que as exclusões estejam incorretas. Bugs, vulnerabilidades e code
smells do código legado devem ser triados em trabalho separado; refatorá-los
nesta integração violaria o escopo e confundiria a validação do código novo.

### 12.3 Quality Gate e proteção da `main`

O `Sonar way` é o gate padrão da organização e prioriza código novo. O projeto,
contudo, ainda não possui resultado calculado. O ruleset da `main` permanece sem
check Sonar e continua exigindo:

- `Site validation`;
- `WCAG 2 AA accessibility`;
- `Lighthouse quality`;
- `zizmor security audit`;
- `SEO metadata consistency`.

Essa distinção é intencional: resultados de análise, estado do Quality Gate e
checks obrigatórios são mecanismos diferentes. O check Sonar só deve entrar no
ruleset depois de uma análise de PR produzir decoração estável e um resultado
calculado. A condição de cobertura do `Sonar way` não autoriza gerar ou declarar
cobertura inexistente; Automatic Analysis não recebeu relatório instrumentado.

## 13. Configurações manuais pendentes

Um administrador deve confirmar no SonarCloud:

1. **Project Settings > Analysis Method:** Automatic Analysis habilitada e
   CI-based analysis desabilitada;
2. vínculo do projeto ao repositório GitHub correto;
3. definição de código novo da `main`;
4. associação efetiva do projeto ao `Sonar way`;
5. decoração e check de Pull Requests habilitados.

Depois dessas confirmações, um novo commit neste PR deve produzir uma análise de
PR. Somente após observar o nome e o comportamento do check deve-se solicitar
autorização específica para alterar o ruleset. Nenhuma dessas ações foi declarada
como realizada nesta etapa.

## 14. Diagnóstico de falhas

1. **Sem nova análise:** conferir Analysis Method, vínculo GitHub e Background
   Tasks; confirmar que o SHA analisado corresponde ao commit esperado.
2. **Configuração ignorada:** verificar o scanner context da análise mais recente
   e comparar fontes, testes e exclusões com `.sonarcloud.properties`.
3. **Quality Gate `NOT_COMPUTED`:** confirmar que existe uma segunda análise e
   que a definição de código novo está configurada.
4. **Sem decoração no PR:** confirmar o vínculo do projeto, permissões do app
   SonarCloud e se o PR aparece na lista de Pull Requests do projeto.
5. **Check obrigatório ausente:** não adicionar um status “Expected” ao ruleset;
   primeiro obter ao menos uma publicação estável do check.
6. **Scanner CI falha:** verificar se Automatic Analysis continua habilitada;
   os dois métodos não podem operar simultaneamente.
7. **Exclusões não aplicadas:** comparar somente com uma análise posterior ao
   commit que introduziu `.sonarcloud.properties`.

## 15. Critérios finais: comprovados e pendentes

| Critério | Estado | Evidência |
| --- | --- | --- |
| Especificação coerente com a implementação | Comprovado | Automatic Analysis, sem workflow CI |
| Configuração sintaticamente válida | Comprovado localmente | propriedades, caminhos e padrões validados |
| Ausência de credenciais versionadas | Comprovado | busca local e nomes dos secrets |
| Ausência de mecanismos duplicados | Comprovado | sem scanner/workflow Sonar |
| Workflows e ruleset preservados | Comprovado | somente hardening do artefato Pages; ruleset intacto |
| Quality Gate adequado ao código novo | Parcial | `Sonar way` identificado; cálculo remoto ausente |
| Escopo e exclusões aplicados remotamente | Pendente | snapshot disponível é anterior ao PR |
| Análise e decoração de PR | Pendente | PR 117 não aparece no SonarCloud |
| Análise pós-merge da `main` | Pendente | merge não autorizado nesta etapa |
| Integração totalmente operacional | Não comprovado | depende das confirmações administrativas acima |

## 16. Referências

- [Métodos de análise para GitHub](https://docs.sonarsource.com/sonarqube-cloud/getting-started/github)
- [Conflito entre Automatic Analysis e CI](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/ci-based-analysis/overview-of-integrated-cis)
- [Escopo inicial de análise](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-analysis/setting-analysis-scope/setting-initial-scope)
- [Exclusões por caminho](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-analysis/setting-analysis-scope/excluding-files-based-on-patterns)
- [Quality Gates](https://docs.sonarsource.com/sonarqube-cloud/standards/quality-gates)
- [Integração do Quality Gate com GitHub](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/administering-your-projects/devops-platform-integration/github)
