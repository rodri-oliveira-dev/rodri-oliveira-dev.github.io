# WebMCP do portfólio (pt-BR)

[English](webmcp.en.md) | **Português (Brasil)** | [Español (América Latina)](webmcp.es-419.md)

## Objetivo e escopo

O site expõe seis ferramentas **somente de leitura** por meio da [API imperativa WebMCP](https://developer.chrome.com/docs/ai/webmcp/imperative-api). A integração funciona no navegador quando `document.modelContext.registerTool` está disponível; não é uma API REST, não inicia servidor MCP nem altera as páginas para visitantes.

- Idiomas suportados: `pt-BR`, `en` e `es-419`. A descrição das ferramentas acompanha o idioma da página; cada execução pode solicitar outro idioma.
- Cobertura: homepages PT/EN/ES, cinco estudos de caso em cada idioma e currículo em português.
- Dados: informações **públicas** do portfólio e cinco projetos em destaque, sem chamadas HTTP, credenciais, analytics ou alterações de estado.
- Compatibilidade: sem WebMCP ou sem contexto seguro, o site funciona normalmente e não registra ferramentas.
- Currículo: a página HTML e o PDF publicados são apenas em português. Respostas em inglês ou espanhol não implicam currículo traduzido.

O WebMCP é **experimental**. Ele não substitui SEO, JSON-LD, sitemap nem os links HTML; não garante indexação, descoberta ou recomendações por agentes. O suporte depende do navegador/cliente, versão e eventuais permissões/flags. Este repositório **não configura token de origin trial**.

## Arquitetura

| Arquivo | Responsabilidade |
| --- | --- |
| [`assets/js/webmcp.js`](../assets/js/webmcp.js) | Detecta suporte/idioma, registra ferramentas e cancela o registro em `pagehide` |
| [`assets/js/webmcp-tools.mjs`](../assets/js/webmcp-tools.mjs) | Contratos JSON Schema, validação de entrada e operações somente de leitura |
| [`assets/js/webmcp-data.mjs`](../assets/js/webmcp-data.mjs) | Catálogo público de projetos, perfil e competências nos dois idiomas |
| [`assets/js/webmcp-i18n.mjs`](../assets/js/webmcp-i18n.mjs) | Descrições, parâmetros, erros e seleção de idioma |
| [`.github/scripts/test-webmcp.mjs`](../.github/scripts/test-webmcp.mjs) | Testes de contrato, compatibilidade, segurança e consistência com o HTML |
| [`.github/workflows/site-validation.yml`](../.github/workflows/site-validation.yml) | Executa os testes WebMCP em PRs e pushes na `main` |
| [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) | Confirma a inclusão dos módulos no artefato estático do Pages |

As páginas importam somente o módulo `/assets/js/webmcp.js`. O JavaScript utiliza ES Modules nativos; não requer build ou pacote npm. A política CSP existente (`script-src 'self'` e `connect-src 'none'`) é preservada.

## Ferramentas publicadas

| Ferramenta | Entrada | Resposta |
| --- | --- | --- |
| `getProfile` | `language?` | Nome, cargo, resumo, tempo mínimo de experiência e URL do portfólio |
| `getSkills` | `language?` | Lista pública de competências técnicas |
| `searchProjects` | `query?`, `technology?`, `limit?`, `language?` | Total de resultados e projetos com descrições, tecnologias e URLs |
| `getProjectDetails` | `projectId`, `language?` | Detalhes de um dos cinco projetos em destaque |
| `getResume` | `language?` | URLs HTML/PDF e indicação de que o currículo está apenas em `pt-BR` |
| `getContactInfo` | `language?` | E-mail, LinkedIn, GitHub e site públicos |

Todos os nomes das ferramentas e das propriedades JSON são estáveis em inglês; os textos apresentados ao agente são localizados.

### Contrato de idioma e erros

- `language` é opcional. Quando ausente, usa `<html lang="pt-BR">` ou `<html lang="en">` da página atual.
- `language: "en"`, `language: "pt-BR"` e `language: "es-419"` podem ser usados independentemente do idioma da página.
- Qualquer idioma explicitamente diferente retorna `UNSUPPORTED_LANGUAGE` (sem fallback silencioso).
- Parâmetros não permitidos, tipos incorretos e limites violados retornam `INVALID_INPUT`.
- `getProjectDetails` retorna `PROJECT_NOT_FOUND` com `availableIds` quando o projeto não existe.
- `searchProjects` é case-insensitive e ignora acentos; reconhece termos em ambos os idiomas mesmo que a saída seja em outro idioma.
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
node .github/scripts/test-site-i18n.cjs
```

O primeiro comando verifica schemas, saídas PT/EN, filtros, erros, ciclo de vida/`AbortSignal`, política CSP e *drift* entre os registros públicos e o conteúdo dos cinco cartões de projeto nas páginas HTML. Não depende de rede nem instala pacotes. O gate `Site validation` executa os dois comandos no GitHub Actions com Node.js 24.

O build do Pages garante a presença dos quatro módulos WebMCP no artefato `_site`. **Testes com mocks não comprovam suporte em navegadores reais.** O smoke test manual abaixo complementa o CI.

## Smoke test manual em navegador compatível

1. Abra uma versão do Chrome que disponibilize a API experimental, acesse `chrome://flags/#enable-webmcp-testing`, habilite a flag e reinicie. A disponibilidade da flag e os requisitos de versão podem mudar; consulte [Chrome Developers: WebMCP](https://developer.chrome.com/docs/ai/webmcp).
2. Faça checkout da branch do PR. Na raiz, execute `python3 -m http.server 8000` e abra `http://localhost:8000/` (origem local considerada contexto seguro). Para testar a versão em inglês, abra `http://localhost:8000/en/`. Não abra o HTML diretamente via `file://`.
3. No DevTools Console, verifique `"modelContext" in document`. Se for `false`, o navegador não habilitou WebMCP; isso não caracteriza falha do site.
4. Na página PT/EN, execute:

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
7. Confirme que as seis ferramentas aparecem nas três versões do site. Feche/navegue para fora de uma página PT/EN/ES e verifique o cancelamento dos registros anteriores (`AbortSignal` em `pagehide`).

Se o navegador não expuser `getTools()` ou `executeTool()` à página/DevTools, use o [Model Context Tool Inspector](https://developer.chrome.com/docs/ai/webmcp) ou a ferramenta equivalente do navegador compatível. Não exponha tokens, nem realize alterações em produção para habilitar o teste. O funcionamento da flag não implica disponibilidade universal a agentes externos.

## Manutenção

Ao modificar um cartão de projeto em `index.html` ou `en/index.html`, atualize `assets/js/webmcp-data.mjs` no mesmo PR. Os testes impedem a divergência de título, descrição, tecnologias ou URLs. Mudanças em competências/identidade também devem preservar consistência com o JSON-LD público. Para novas ferramentas, mantenha descrições PT/EN, JSON Schema estrito, operações somente de leitura e testes de saída/erro.

Referências: [WebMCP no Chrome](https://developer.chrome.com/docs/ai/webmcp), [API imperativa](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [especificação comunitária](https://webmachinelearning.github.io/webmcp/).
