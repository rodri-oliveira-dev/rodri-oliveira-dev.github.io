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

Na etapa 2, criar `.sonarcloud.properties`, formato usado pela Automatic
Analysis, contendo apenas:

- raiz de fontes no repositório;
- diretório de testes e inclusões precisas para os padrões de teste existentes;
- exclusões justificadas desta especificação;
- codificação UTF-8, se necessária.

Não duplicar configurações entre a interface e o arquivo. Parâmetros de escopo
devem ficar versionados; definição de código novo, Quality Gate e método de
análise ficam no SonarCloud.

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

### 5.4 Pull Requests, `main` e proteção

Automatic Analysis deve analisar eventos de PR e mudanças na `main`. O mesmo PR
desta integração será usado para comprovar a análise de PR e a decoração. Depois
de pelo menos uma execução estável e com nome de check conhecido, adicionar esse
check ao repository ruleset da `main`.

O check não deve ser tornado obrigatório antes da comprovação, pois um nome
incorreto ou um evento que não publique status bloquearia todos os merges. A
análise pós-merge da `main` deverá ser verificada na conclusão da etapa 4.

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

## 7. Arquivos e configurações afetados nas próximas etapas

| Item | Ação prevista | Etapa |
| --- | --- | --- |
| `docs/sonarcloud-integration.md` | Criar a especificação e registrar evidências posteriores. | 1–4 |
| `.sonarcloud.properties` | Criar escopo, testes e exclusões para Automatic Analysis. | 2 |
| SonarCloud: Analysis Method | Confirmar Automatic Analysis; não habilitar CI em paralelo. | 2 |
| SonarCloud: New Code e Quality Gate | Configurar e validar `Sonar way`. | 2–3 |
| GitHub repository ruleset `main` | Adicionar o check Sonar comprovado, preservando os checks atuais. | 3 |

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

1. Confirmar o método em `Analysis Method` e interromper se divergir da estratégia.
2. Configurar definição de código novo e confirmar `Sonar way`.
3. Criar `.sonarcloud.properties` com escopo, testes e exclusões mínimas.
4. Enviar novo commit à mesma branch e ao mesmo PR.

### Etapa 3 — validação de PR e proteção

1. Confirmar análise, arquivos indexados, Quality Gate e decoração deste PR.
2. Triar falhas reais sem desabilitar regras nem excluir código legítimo.
3. Após estabilidade, adicionar o nome exato do check ao ruleset da `main`.
4. Registrar no documento as configurações externas efetivamente aplicadas.

### Etapa 4 — aceite final

1. Executar os gates pertinentes e revisar segurança, permissões e ausência de
   duplicação de análise.
2. Confirmar que o PR está atualizado e que todos os checks obrigatórios passam.
3. Atualizar a evidência final no documento antes do merge, sem ampliar o escopo.
4. Após o merge, validar a análise e o Quality Gate da `main` e registrar o
   resultado no próprio PR.

## 11. Referências

- [Métodos de análise para GitHub](https://docs.sonarsource.com/sonarqube-cloud/getting-started/github)
- [Conflito entre Automatic Analysis e CI](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/ci-based-analysis/overview-of-integrated-cis)
- [Escopo inicial de análise](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-analysis/setting-analysis-scope/setting-initial-scope)
- [Exclusões por caminho](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-analysis/setting-analysis-scope/excluding-files-based-on-patterns)
- [Quality Gates](https://docs.sonarsource.com/sonarqube-cloud/standards/quality-gates)
- [Integração do Quality Gate com GitHub](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/administering-your-projects/devops-platform-integration/github)
