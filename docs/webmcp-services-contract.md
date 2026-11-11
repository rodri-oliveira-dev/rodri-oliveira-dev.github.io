# Contrato WebMCP de serviços (v1)

> **Status:** contrato definido (etapa 1) e catálogo multilíngue modelado (etapa 2). **As quatro ferramentas ainda não estão implementadas nem registradas no navegador**. As ferramentas gerais existentes continuam inalteradas.

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
6. Dados e mensagens nos três idiomas devem refletir suas páginas HTML. Alterações editoriais no site exigirão sincronização dos dados de serviços e testes de *drift* na etapa 5.

## Versionamento e critérios de aceite

- **Versão inicial:** `1.0.0`, exposta por `contractVersion`. O nome das ferramentas não contém versão, para manter uma interface simples dentro do documento.
- **PATCH:** correções editoriais sem mudança de semântica ou estrutura.
- **MINOR:** campos opcionais novos ou extensões compatíveis para consumidores existentes.
- **MAJOR:** remoção ou renomeação de ferramentas, campos, IDs, alterações de obrigatoriedade, semântica ou tipo. Exige atualização explícita dos consumidores/testes e revisão da estratégia de migração.
- O arquivo JSON é a especificação verificável; este documento descreve a semântica. A implementação e os testes serão introduzidos em etapas posteriores, **não nesta alteração**.

Critérios para considerar o contrato implementado: quatro ferramentas disponíveis nas três páginas, saída coerente em PT-BR/EN/ES-419, `outputSchema` compatível com cada resposta, IDs constantes, tratamento de erros, ausência de efeitos colaterais e testes automatizados de igualdade entre HTML e dados expostos. O smoke test em navegador compatível complementa o CI; mocks não comprovam disponibilidade real.

**Condição desta etapa:** apenas documentação contratual, sem alterações em HTML, JavaScript de produção, workflows, SEO ou `sitemap.xml`.

Referências: [Guia WebMCP do projeto](webmcp.pt-BR.md), [API imperativa do Chrome](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [especificação comunitária WebMCP](https://webmachinelearning.github.io/webmcp/).
