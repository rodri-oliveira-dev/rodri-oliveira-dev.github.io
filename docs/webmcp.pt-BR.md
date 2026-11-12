# WebMCP do portfólio (pt-BR)

[English](webmcp.en.md) | **Português (Brasil)** | [Español (América Latina)](webmcp.es-419.md)

## Objetivo e escopo

O site expõe seis ferramentas gerais **somente de leitura** e quatro ferramentas adicionais nas páginas de serviços, por meio da [API imperativa WebMCP](https://developer.chrome.com/docs/ai/webmcp/imperative-api). A integração funciona no navegador quando `document.modelContext.registerTool` está disponível; não é uma API REST, não inicia servidor MCP nem altera as páginas para visitantes.

- Idiomas suportados: `pt-BR`, `en` e `es-419`. A descrição das ferramentas acompanha o idioma da página; cada execução pode solicitar outro idioma.
- Cobertura: homepages PT/EN/ES, cinco estudos de caso em cada idioma, currículo em português e páginas de serviços `/servicos/`, `/en/services/`, `/es/servicios/`.
- Dados: informações **públicas** do portfólio, cinco projetos em destaque e quatro serviços de consultoria, sem chamadas HTTP, credenciais, analytics ou alterações de estado.
- Compatibilidade: sem WebMCP ou sem contexto seguro, o site funciona normalmente e não registra ferramentas.
- Currículo: a página HTML e o PDF publicados são apenas em português. Respostas em inglês ou espanhol não implicam currículo traduzido.

O WebMCP é **experimental**. Ele não substitui SEO, JSON-LD, sitemap nem os links HTML; não garante indexação, descoberta ou recomendações por agentes. O suporte depende do navegador/cliente, versão e eventuais permissões/flags. Este repositório **não configura token de origin trial**.

## Arquitetura

| Arquivo | Responsabilidade |
| --- | --- |
| [`assets/js/webmcp.js`](../assets/js/webmcp.js) | Detecta suporte/idioma, cancela registros em `pagehide` e restaura ferramentas após retorno pelo bfcache |
| [`assets/js/webmcp-tools.mjs`](../assets/js/webmcp-tools.mjs) | Contratos JSON Schema, validação de entrada e operações somente de leitura |
| [`assets/js/webmcp-data.mjs`](../assets/js/webmcp-data.mjs) | Catálogo público de projetos, perfil e competências em português, inglês e espanhol |
| [`assets/js/webmcp-i18n.mjs`](../assets/js/webmcp-i18n.mjs) | Descrições, parâmetros, erros e seleção de idioma |
| [`assets/js/webmcp-services.mjs`](../assets/js/webmcp-services.mjs) | Quatro ferramentas read-only de serviços, com schemas e erros localizados |
| [`assets/js/webmcp-services-data.mjs`](../assets/js/webmcp-services-data.mjs) | Catálogo de serviços e abordagem nas três línguas, fiel ao HTML |
| [`docs/contracts/webmcp-services.v1.json`](contracts/webmcp-services.v1.json) | Contrato versionado JSON Schema v1.0.0 |
| [`docs/webmcp-services-contract.md`](webmcp-services-contract.md) | Referência de semântica, versões, segurança e manutenção dos serviços |
| [`.github/scripts/test-webmcp-services.mjs`](../.github/scripts/test-webmcp-services.mjs) | Testes de paridade de contrato, HTML, locale e ciclo de vida em navegador simulado |
| [`.github/scripts/test-webmcp.mjs`](../.github/scripts/test-webmcp.mjs) | Testes de contrato, compatibilidade, segurança e consistência com o HTML |
| [`.github/workflows/site-validation.yml`](../.github/workflows/site-validation.yml) | Executa os testes WebMCP em PRs e pushes na `main` |
| [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) | Confirma a inclusão dos módulos no artefato estático do Pages |

As páginas importam somente o módulo `/assets/js/webmcp.js`. Nas três rotas de serviços o módulo importa sob demanda `webmcp-services.mjs`, registrando até dez ferramentas; nas demais, mantém as seis gerais. O JavaScript utiliza ES Modules nativos; não requer build ou pacote npm. A política CSP existente (`script-src 'self'` e `connect-src 'none'`) é preservada.

## Ferramentas publicadas

| Ferramenta | Entrada | Resposta |
| --- | --- | --- |
| `getProfile` | `language?` | Nome, cargo, resumo, tempo mínimo de experiência e URL do portfólio |
| `getSkills` | `language?` | Lista pública de competências técnicas |
| `searchProjects` | `query?`, `technology?`, `limit?`, `language?` | Total de resultados e projetos com descrições, tecnologias e URLs |
| `getProjectDetails` | `projectId`, `language?` | Detalhes de um dos cinco projetos em destaque |
| `getResume` | `language?` | URLs HTML/PDF e indicação de que o currículo está apenas em `pt-BR` |
| `getContactInfo` | `language?` | E-mail, LinkedIn, GitHub e site públicos |

### Ferramentas adicionais disponíveis apenas nas páginas de serviços

| Ferramenta | Entrada | Resposta |
| --- | --- | --- |
| `getServices` | `language?` | Os quatro serviços, IDs estáveis e orientação sobre escopo |
| `getServiceDetails` | `serviceId`, `language?` | Detalhes de um serviço e possíveis entregáveis condicionados ao escopo |
| `getEngagementProcess` | `language?` | Introdução e três etapas da abordagem |
| `getConsultingContact` | `language?` | Contato por e-mail, LinkedIn e orientação para uma conversa inicial |

Essas ferramentas não enviam mensagens, não solicitam dados pessoais e não criam contratos. Os IDs são `architecture-review`, `dotnet-modernization`, `apis-distributed-systems` e `technical-decision-support`. IDs desconhecidos retornam `SERVICE_NOT_FOUND` e `availableIds`. Os schemas e exemplos estão no [contrato de serviços v1](webmcp-services-contract.md).

Todos os nomes das ferramentas e das propriedades JSON são estáveis em inglês; os textos apresentados ao agente são localizados.

### Contrato de idioma e erros

- `language` é opcional. Quando ausente, utiliza o `lang` da página: `pt-BR` em `/`, `en` em `/en/` e `es-419` em `/es/`.
- `language: "en"`, `language: "pt-BR"` e `language: "es-419"` podem ser usados independentemente do idioma da página.
- Qualquer idioma explicitamente diferente retorna `UNSUPPORTED_LANGUAGE` (sem fallback silencioso).
- Parâmetros não permitidos, tipos incorretos e limites violados retornam `INVALID_INPUT`.
- `getProjectDetails` retorna `PROJECT_NOT_FOUND` com `availableIds` quando o projeto não existe.
- `searchProjects` é case-insensitive e ignora acentos; reconhece termos nos três idiomas, mesmo que a saída esteja em outro idioma.
- `limit` varia de 1 a 5 (padrão 5); `query` tem no máximo 120 caracteres e `technology` 80.
- Os retornos são objetos JSON serializáveis. Ao chamar `executeTool()`, alguns navegadores retornam sua representação serializada como string.

Exemplo de entrada:

```json
{
  "tool": "searchProjects",
  "arguments": {
    "technology": ".NET",
    "language": "en",
    "limit": 3
  }
}
```

## Validação automática

Na raiz do projeto:

```bash
node --test .github/scripts/test-webmcp.mjs
node --test .github/scripts/test-webmcp-services.mjs
node .github/scripts/test-site-i18n.cjs
```

O primeiro teste verifica as seis ferramentas gerais; o segundo cobre as quatro de serviços, o contrato JSON Schema v1.0.0, os idiomas, os erros, o registro condicionado à rota, o ciclo de vida/bfcache e a consistência com os cartões e textos de serviços do HTML. Nenhum exige rede ou pacotes adicionais. O gate `Site validation` executa as suítes com Node.js 24.

O build do Pages garante a presença dos módulos WebMCP gerais e de serviços no artefato `_site`. **Testes com mocks não comprovam suporte em navegadores reais.** O smoke test manual abaixo complementa o CI.

## Verificação manual adicional das páginas de serviços

No Chrome compatível, com a flag experimental ativada, abra cada rota no servidor local: `http://localhost:8000/servicos/`, `http://localhost:8000/en/services/` e `http://localhost:8000/es/servicios/`.

No DevTools, após a página carregar, execute:

```javascript
const context = document.modelContext;
const registered = await context.getTools();
console.log(registered.map((tool) => tool.name).sort());
const details = registered.find((tool) => tool.name === "getServiceDetails");
const result = await context.executeTool(details, {
  serviceId: "architecture-review",
  language: "en"
});
console.log(result);
```

São esperadas **dez ferramentas** em cada página de serviços (seis gerais e quatro novas), com uma resposta sobre a revisão arquitetural em inglês. Em `/`, `/en/` e `/es/`, o conjunto esperado permanece com **seis ferramentas**. Teste também `getServices`, `getEngagementProcess`, `getConsultingContact` e o erro `SERVICE_NOT_FOUND` para um ID desconhecido. A navegação para fora da página deve cancelar os registros; o retorno via bfcache deve restaurá-los sem duplicação.

Este roteiro é **manual e dependente de um navegador com WebMCP nativo habilitado**. Ele não é executado nem comprovado pelo CI com mocks. A API, a flag e o inspector podem variar de acordo com a versão do Chrome; consulte a documentação oficial antes de testar.

## Smoke test manual em navegador compatível

1. Abra uma versão do Chrome que disponibilize a API experimental, acesse `chrome://flags/#enable-webmcp-testing`, habilite a flag e reinicie. A disponibilidade da flag e os requisitos de versão podem mudar; consulte [Chrome Developers: WebMCP](https://developer.chrome.com/docs/ai/webmcp).
2. Faça checkout da branch do PR. Na raiz, execute `python3 -m http.server 8000` e abra `http://localhost:8000/` (origem local considerada contexto seguro). Para testar a versão em inglês, abra `http://localhost:8000/en/`. Não abra o HTML diretamente via `file://`.
3. No DevTools Console, verifique `"modelContext" in document`. Se for `false`, o navegador não habilitou WebMCP; isso não caracteriza falha do site.
4. Em uma página PT/EN/ES, execute:

```javascript
const ctx = document.modelContext;
const available = await ctx.getTools();
available.map((tool) => tool.name);
```

A lista deve conter: `getProfile`, `getSkills`, `searchProjects`, `getProjectDetails`, `getResume` e `getContactInfo`.

5. Experimente busca e troca de idioma:

```javascript
const search = available.find((tool) => tool.name === "searchProjects");
const output = await ctx.executeTool(search, {
  technology: ".NET",
  language: "en",
  limit: 3
});
console.log(output);
```

6. Repita em `/en/` com `language: "pt-BR"` e em `/es/` com `language: "es-419"`. Valide também erros `UNSUPPORTED_LANGUAGE`, `INVALID_INPUT` e `PROJECT_NOT_FOUND`.
7. Confirme que as seis ferramentas aparecem nas três versões. Navegue para fora da página e verifique que `pagehide` cancela os registros. Ao voltar pelo histórico, caso a página seja restaurada do bfcache (`pageshow.persisted`), as seis ferramentas devem ser registradas novamente com um novo `AbortSignal`.

Se o navegador não expuser `getTools()` ou `executeTool()` à página/DevTools, use o [Model Context Tool Inspector](https://developer.chrome.com/docs/ai/webmcp) ou a ferramenta equivalente do navegador compatível. Não exponha tokens, nem realize alterações em produção para habilitar o teste. O funcionamento da flag não implica disponibilidade universal a agentes externos.

## Manutenção

Ao modificar um cartão de projeto em `index.html`, `en/index.html` ou `es/index.html`, atualize `assets/js/webmcp-data.mjs` no mesmo PR. Os testes impedem a divergência de título, descrição, tecnologias ou URLs. Mudanças em competências/identidade também devem preservar consistência com o JSON-LD público. Qualquer mudança nas páginas de serviços deve atualizar também `assets/js/webmcp-services-data.mjs`, manter o contrato versionado e executar `node --test .github/scripts/test-webmcp-services.mjs`. Para alterações no conteúdo do site, mantenha o `lastmod` do sitemap sincronizado. Para novas ferramentas, preserve descrições PT-BR/EN/ES-419, schemas estritos e testes de saída/erro.

Referências: [WebMCP no Chrome](https://developer.chrome.com/docs/ai/webmcp), [API imperativa](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [especificação comunitária](https://webmachinelearning.github.io/webmcp/).
