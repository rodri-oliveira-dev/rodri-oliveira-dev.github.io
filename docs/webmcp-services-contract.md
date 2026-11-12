# Contrato WebMCP de serviços (v1)

> **Status:** etapas 1–6 implementadas e documentação consolidada em PT-BR, EN e ES-419. Os contratos e a integração são verificados pelo CI. **O smoke test com API WebMCP nativa continua uma verificação manual dependente de navegador compatível; não foi validado pelos mocks.**

Contrato legível por máquina: [`contracts/webmcp-services.v1.json`](contracts/webmcp-services.v1.json).

## Objetivo e limites

Oferecer a agentes em navegadores compatíveis uma consulta estruturada sobre os serviços profissionais publicados, sem substituir o HTML, SEO, JSON-LD, sitemap ou a interação humana. É uma integração **WebMCP local ao documento**, registrada com `document.modelContext.registerTool`; não é um endpoint REST nem um servidor MCP remoto.

O contrato cobre as três páginas de serviços e seus idiomas:

| Idioma da página | Caminho | Idioma de resposta padrão |
| --- | --- | --- |
| Português brasileiro | [`/servicos/`](../servicos/index.html) | `pt-BR` |
| Inglês americano | [`/en/services/`](../en/services/index.html) | `en` |
| Espanhol latino-americano | [`/es/servicios/`](../es/servicios/index.html) | `es-419` |

Os nomes das ferramentas, campos JSON e identificadores são estáveis em inglês. `titles`, `descriptions`, textos de resposta e mensagens de erro devem ser localizados. Uma chamada pode solicitar `language: "pt-BR" | "en" | "es-419"` independentemente do idioma do HTML. Quando omitido, vale o idioma da página. Nenhuma tradução de serviços fora desses três idiomas será oferecida implicitamente.

## Catálogo de ferramentas

| Ferramenta | Entrada | Resposta de sucesso | Fonte pública |
| --- | --- | --- | --- |
| `getServices` | `language?` | `services[4]` (id, title, description), `engagementNote` | Seção `#atuacao` |
| `getServiceDetails` | `serviceId` obrigatório, `language?` | `service` (id, title, description, potentialOutputs, scopeNote) | Quatro cartões de `#atuacao` e seu texto introdutório |
| `getEngagementProcess` | `language?` | `introduction`, `steps[3]` (id, title, description) | Seção `#abordagem` |
| `getConsultingContact` | `language?` | `email`, `emailUrl`, `linkedInUrl`, `guidance` | Seção `#contato` |

Todos os retornos bem-sucedidos incluem `contractVersion: "1.0.0"`, `language` e `sourceUrl` com a URL pública correspondente ao idioma da resposta. O campo `sourceUrl` deve apontar para a página de serviços, opcionalmente com a âncora real da seção. As ferramentas de serviços são registradas **somente nessas três rotas**, além das ferramentas gerais já existentes. Nas demais páginas continuam disponíveis apenas as ferramentas apropriadas ao portfólio geral.

### Identificadores estáveis

| `serviceId` | PT-BR | EN | ES-419 |
| --- | --- | --- | --- |
| `architecture-review` | Revisão e evolução arquitetural | Architecture reviews and evolution | Revisión y evolución de arquitecturas |
| `dotnet-modernization` | Modernização de sistemas .NET | .NET application modernization | Modernización de sistemas .NET |
| `apis-distributed-systems` | APIs e sistemas distribuídos | APIs and distributed systems | APIs y sistemas distribuidos |
| `technical-decision-support` | Apoio a decisões técnicas | Technical decision support | Asesoramiento en decisiones técnicas |

A ordem pública desses serviços é a mesma do HTML. Os identificadores de etapas, na ordem apresentada, são `context`, `alternatives` e `next-steps`, correspondendo a **compreender o cenário**, **explicitar trade-offs** e **definir próximos passos**, com traduções próprias nas outras páginas.

Os campos `potentialOutputs` e `scopeNote` **não estabelecem entregas garantidas**: podem mencionar somente exemplos já publicados, como recomendações priorizadas e decisões documentadas, sempre condicionados ao escopo acordado. Não inventar preços, disponibilidade, certificações, projetos de clientes, prazos, métricas ou resultados.

## Catálogo multilíngue preparado (etapa 2)

A implementação utilizará [`assets/js/webmcp-services-data.mjs`](../assets/js/webmcp-services-data.mjs), um módulo ES nativo **sem registro de ferramentas, acesso ao DOM ou operações de rede**. Ele contém os dados de serviços nas três línguas, extraídos do texto visível das páginas:

- `SERVICES_CONTRACT_VERSION`, `SERVICES_SUPPORTED_LANGUAGES` e `SERVICES_PAGE_URLS`: metadados alinhados ao contrato JSON.
- `SERVICES_SERVICE_IDS` e `SERVICES_PROCESS_STEP_IDS`: identificadores e ordenação estáveis, iguais em todos os idiomas.
- `SERVICES_CATALOG[language].services`: quatro cartões com `id`, `title` e `description`, correspondendo aos títulos e parágrafos do HTML.
- `engagementNote`, `potentialOutputs` e `scopeNote`: contexto e **exemplos condicionais** de entregas, não promessas específicas por serviço.
- `process.introduction` e `process.steps`: introdução e três etapas publicadas em `#abordagem`.
- `contact.emailUrl` e `contact.guidance`: URL `mailto:` localizada e orientação de contato visível; e-mail e LinkedIn são constantes públicas compartilhadas.

Os objetos e arrays exportados são congelados recursivamente para evitar mutação acidental durante as consultas. O módulo não contém preços, disponibilidade, dados privados, nomes de clientes no catálogo de serviços, compromissos de entrega ou coleta de informações dos visitantes.

**Sincronização obrigatória nas próximas etapas:** para uma alteração editorial nas três páginas de serviços, atualizar o catálogo em conjunto. A etapa 5 adicionará testes automatizados de consistência e cobertura contratual; a etapa 3 transformará os dados em resultados conformes a `outputSchema`. Este arquivo de dados isolado **não torna o WebMCP de serviços disponível aos agentes**.

## Handlers das ferramentas (etapa 3)

A implementação pura e independente do DOM está em [`assets/js/webmcp-services.mjs`](../assets/js/webmcp-services.mjs). Ela exporta `createServiceTools(pageLocale = "pt-BR")`, que constrói quatro definições `{ name, title, description, inputSchema, outputSchema, annotations, execute }`. As descrições de descoberta seguem o idioma da página; cada `execute` aceita um idioma de resposta independente.

- `getServices`: retorna as quatro frentes de atuação e a observação editorial sobre o escopo.
- `getServiceDetails`: localiza um dos quatro IDs estáveis; retorna dados do serviço, exemplos não vinculantes de resultados e nota condicionando-os ao escopo. IDs válidos mas inexistentes recebem `SERVICE_NOT_FOUND` e `availableIds`.
- `getEngagementProcess`: retorna a introdução e as três etapas publicadas da abordagem.
- `getConsultingContact`: retorna o e-mail, link `mailto:` localizado, LinkedIn e orientação pública de contato, **sem enviar mensagens**.

Todas retornam `contractVersion` e `language`; sucessos incluem `sourceUrl` do idioma solicitado. Rejeições de estrutura, chaves extras e IDs malformados retornam `INVALID_INPUT`; idioma explicitamente não suportado retorna `UNSUPPORTED_LANGUAGE` no idioma da página. O schema é estrito e a validação é repetida no handler para casos em que o navegador não a aplique.

As definições usam os `inputSchema`/`outputSchema` e textos de descoberta do contrato v1, sem requisições externas, efeitos colaterais ou novas dependências. A etapa 4 registra essas definições em `webmcp.js` **exclusivamente nas três páginas de serviços**. Os testes de integração e igualdade automática de HTML/dados serão ampliados na etapa 5. O contrato JSON está no estado `implemented-tested`, com verificações automatizadas versionadas no repositório.

## Registro condicional nas páginas de serviços (etapa 4)

A entrada [`assets/js/webmcp.js`](../assets/js/webmcp.js) mantém o registro das seis ferramentas gerais já existentes. Quando `document.location.pathname` corresponde a `/servicos/`, `/en/services/` ou `/es/servicios/` (ou ao respectivo `index.html`) **e** o idioma HTML coincide, realiza `import("./webmcp-services.mjs")` e registra as quatro ferramentas adicionais.

- **Páginas de serviços:** até 10 ferramentas registradas (6 gerais + 4 específicas), no idioma HTML atual, com opção de idioma diferente na chamada.
- **Outras páginas do portfólio:** 6 ferramentas gerais, sem carregar o módulo adicional de serviços.
- **Navegadores incompatíveis ou contexto inseguro:** nenhuma ferramenta registrada; o conteúdo HTML permanece acessível normalmente.
- **Falha no import ou registro de uma ferramenta:** o erro é registrado no resultado da tentativa, sem impedir o registro das demais. As seis ferramentas gerais permanecem independentes.
- **Ciclo de vida:** em `pagehide`, o `AbortSignal` cancela os registros. No retorno por bfcache (`pageshow.persisted`), todos os registros disponíveis são recriados com um sinal novo. Uma definição carregada após o cancelamento continua registrada no catálogo interno para essa restauração.
- **Publicação:** `.github/workflows/deploy-pages.yml` verifica os módulos adicionais no artefato e passa a executar também para alterações nos arquivos WebMCP de serviços.

O registro usa a API imperativa local ao navegador, sem rede, formulários ou ações de escrita. Não há alterações na estrutura visual das três páginas. Seus `lastmod` no sitemap já estão datados de `2026-11-11`, a data desta integração.

## Testes automatizados e gate de CI (etapa 5)

A suíte [`.github/scripts/test-webmcp-services.mjs`](../.github/scripts/test-webmcp-services.mjs) roda no gate obrigatório `Site validation`, juntamente com os testes preexistentes do WebMCP e das páginas de serviços:

```bash
node --test .github/scripts/test-webmcp-services.mjs
node --test .github/scripts/test-webmcp.mjs
node .github/scripts/test-services.cjs
```

A nova suíte verifica:

1. **Contrato versionado:** quatro nomes exclusivos, schemas de entrada/saída, anotações read-only, IDs estáveis, textos de descoberta nos três idiomas e fidelidade das definições à especificação JSON.
2. **Saídas válidas:** respostas para os quatro serviços e a abordagem em todos os idiomas, com alternância de idioma por chamada. Um validador da parcela de JSON Schema utilizada pelo contrato confere `oneOf`, objetos fechados, `required`, `enum`, `const`, limites, padrões e formatos.
3. **Erros:** entradas malformadas, propriedades extras, idiomas não suportados, IDs inválidos e `SERVICE_NOT_FOUND`, com mensagens localizadas e conformidade aos schemas de erro.
4. **Integridade:** resultados de chamadas não modificam o catálogo congelado.
5. **Consistência editorial:** os quatro cartões, a introdução, as três etapas de abordagem, as orientações de contato, os links e a nota de escopo coincidem com o HTML PT-BR/EN/ES-419.
6. **Isolamento de rotas:** apenas as páginas de serviços (inclusive URLs diretas com `index.html`) habilitam as quatro ferramentas adicionais.
7. **Registro e ciclo de vida:** simulação com processos Node.js independentes por rota, cobrindo 10 ferramentas nos serviços, 6 nas demais páginas, nenhum registro em navegadores sem a API ou em contextos inseguros, e restauração única após bfcache.
8. **Segurança e publicação:** proteção CSP, ausência de requisições externas e verificações dos módulos obrigatórios no artefato do Pages.

Esses testes usam `node:test` e ferramentas da biblioteca padrão do Node.js, sem servidor e sem dependências novas. Cobrem a lógica local e os contratos, mas não comprovam interoperabilidade em um navegador WebMCP real. Essa confirmação permanece como smoke test manual na etapa 6.

## Schemas e contrato de erros

O arquivo JSON versionado define os quatro `inputSchema` e `outputSchema`, com objetos fechados (`additionalProperties: false`), campos obrigatórios, tipos, limites e formatos. As respostas de sucesso e erro são alternativas explícitas (`oneOf`), para que os consumidores não confundam erros com conteúdo comercial.

- `INVALID_INPUT`: parâmetros extras, tipos inválidos ou valores fora dos limites; `serviceId` aceita slug de até 80 caracteres.
- `UNSUPPORTED_LANGUAGE`: idioma explicitamente diferente de `pt-BR`, `en` ou `es-419`.
- `SERVICE_NOT_FOUND`: `serviceId` sintaticamente válido, mas não publicado; retorna também os quatro `availableIds`.

Formato de erro dos handlers:

```json
{
  "contractVersion": "1.0.0",
  "language": "pt-BR",
  "error": {
    "code": "SERVICE_NOT_FOUND",
    "message": "Serviço não encontrado."
  },
  "availableIds": [
    "architecture-review",
    "dotnet-modernization",
    "apis-distributed-systems",
    "technical-decision-support"
  ]
}
```

O erro é localizado no idioma solicitado, quando suportado; para `UNSUPPORTED_LANGUAGE`, usa o idioma da página. O navegador pode rejeitar entradas que violem `inputSchema` antes de executar o handler, portanto o objeto de erro acima descreve a validação **no próprio handler**, não uma garantia de mensagem para toda rejeição do navegador.

Exemplo de chamada planejada:

```json
{
  "tool": "getServiceDetails",
  "arguments": {
    "serviceId": "architecture-review",
    "language": "en"
  }
}
```

Este envelope serve apenas como exemplo de invocação por um agente; não faz parte da entrada passada ao callback da ferramenta, que recebe somente `arguments`.

## Regras de segurança e compatibilidade

1. Todas as ferramentas são **somente leitura**, determinísticas para os dados publicados e sem efeitos colaterais. Definições devem trazer `readOnlyHint: true`; isso é uma anotação, não substitui o controle de implementação.
2. Não fazer `fetch`, telemetria, escrita local, acesso a contas, envio de e-mails, submissão de formulários, agendamento ou navegação programática. `emailUrl` é apenas uma informação pública; sua leitura **não** abre um cliente de e-mail.
3. Não obter dados privados, credenciais, parâmetros arbitrários de URLs ou conteúdo de outros sites. Restringir links à página pública e canais de contato já publicados.
4. Respeitar o mesmo suporte opcional existente: contexto seguro, `document.modelContext.registerTool` disponível e cancelamento em `pagehide`, com restauração controlada após bfcache.
5. Preservar os seis contratos existentes (`getProfile`, `getSkills`, `searchProjects`, `getProjectDetails`, `getResume`, `getContactInfo`). Não registrar nomes duplicados.
6. Dados e mensagens nos três idiomas devem refletir suas páginas HTML. Alterações editoriais exigem sincronização dos dados de serviços; o teste de *drift* está implementado no gate `Site validation`.

## Versionamento e critérios de aceite

- **Versão inicial:** `1.0.0`, exposta por `contractVersion`. O nome das ferramentas não contém versão, para manter uma interface simples dentro do documento.
- **PATCH:** correções editoriais sem mudança de semântica ou estrutura.
- **MINOR:** campos opcionais novos ou extensões compatíveis para consumidores existentes.
- **MAJOR:** remoção ou renomeação de ferramentas, campos, IDs, alterações de obrigatoriedade, semântica ou tipo. Exige atualização explícita dos consumidores/testes e revisão da estratégia de migração.
- O arquivo JSON é a especificação verificável; este documento descreve a semântica. O código foi integrado na etapa 4, com testes automatizados contratados ao CI na etapa 5.

Critérios para considerar o contrato implementado: quatro ferramentas disponíveis nas três páginas, saída coerente em PT-BR/EN/ES-419, `outputSchema` compatível com cada resposta, IDs constantes, tratamento de erros, ausência de efeitos colaterais e testes automatizados de igualdade entre HTML e dados expostos. O smoke test em navegador compatível complementa o CI; mocks não comprovam disponibilidade real.

## Revisão final e critérios de publicação (etapa 6)

A implementação foi revisada com os seguintes pontos de aceitação:

- **Contrato:** quatro ferramentas somente leitura, com IDs e JSON Schema v1.0.0 estáveis; erros localizados e suporte a `pt-BR`, `en` e `es-419`.
- **Isolamento:** até 10 ferramentas nas páginas de serviços e apenas as 6 gerais nas demais rotas, sem exposição adicional em contextos inseguros ou navegadores sem a API.
- **Ciclo de vida:** registro opcional, importação sob demanda, cancelamento em `pagehide`, restauração em `pageshow.persisted` e tratamento independente de falha de registro.
- **Conteúdo:** catálogo alinhado aos quatro serviços, três etapas de abordagem e canais públicos de contato das três páginas, sem criar preços, garantias ou interações de escrita.
- **Manutenção:** testes automatizados do contrato e da documentação trilíngue executados no `Site validation`; módulos incluídos no artefato GitHub Pages.
- **SEO:** as três rotas de serviços já possuem `lastmod` de `2026-11-11` no sitemap; alterações apenas nestes documentos técnicos não exigem nova data para as páginas HTML.
- **Compatibilidade real:** um teste manual em Chrome WebMCP compatível ainda é recomendável antes de depender operacionalmente das ferramentas. O CI usa simulações e **não confirma a API nativa em um navegador real**.

Guias de operação e smoke test: [português](webmcp.pt-BR.md), [inglês](webmcp.en.md) e [espanhol](webmcp.es-419.md).

O contrato e a documentação não substituem uma proposta comercial, nem indicam disponibilidade automática para atender novos projetos. Não há necessidade de criar serviços de backend, tokens, formulários ou autorizações de terceiros para estas ferramentas de consulta.


Referências: [Guia WebMCP do projeto](webmcp.pt-BR.md), [API imperativa do Chrome](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [especificação comunitária WebMCP](https://webmachinelearning.github.io/webmcp/).
