# Contratos públicos de Agent Readiness

O portfólio publica contratos estáticos de descoberta para agentes sem adicionar backend, autenticação, telemetria ou execução remota. A configuração compartilhada fica em `.github/agent-readiness.json`; os JSONs em `.well-known` são gerados por `.github/scripts/sync-agent-readiness.py`.

## Contratos adotados

- Content Signals em `robots.txt`: `search=yes, ai-input=yes, ai-train=no`. A diretiva declara uma preferência do publicador; não impede tecnicamente a coleta nem garante cumprimento por terceiros.
- Agent Skills: formato de `SKILL.md` vigente e Discovery RFC draft v0.2.0. O índice publica cinco skills somente de leitura, com SHA-256 calculado sobre os bytes versionados.
- ARD v0.91, status Proposal, de 26 de agosto de 2026. O manifesto usa `/.well-known/ard.json`; não publica o predecessor opcional `ai-catalog.json`, embora alguns auditores ainda o procurem.
- Personal Agent Protocol (Poppy) v1.0 no perfil website-only. O documento declara apenas identidade, domínio e navegação pública, sem OAuth, OIDC, sessões, registro de agentes, APIs ou autorização.

As skills públicas orientam a descoberta do portfólio, projetos, serviços, artigos e currículo em pt-BR, inglês e es-419. Skills operacionais de `.agents/skills/` e `.github/skills/` não integram o artefato público.

O audit `robots-txt` do Lighthouse 13.0.3 rejeita `Content-Signal` como diretiva desconhecida e reduz artificialmente o score SEO de todas as páginas. Enquanto o auditor não implementar a especificação, somente esse audit é excluído do Lighthouse; o threshold SEO de 95% e todos os demais audits permanecem bloqueantes. A política, o `Allow` e o sitemap são validados pelo gate dedicado de Agent Readiness.

## Geração e validação

Execute `python3 .github/scripts/sync-agent-readiness.py` após mudar a configuração ou uma skill pública. O modo `--check` detecta drift sem escrever. `test_agent_readiness.py` valida frontmatter, nomes, digests, URLs HTTPS, referências locais, consistência entre índice e ARD, perfil Poppy e a política única em `robots.txt`. O assembly do Pages inclui `.well-known` por allowlist e continua excluindo os diretórios internos.

O domínio canônico publicado continua sendo `rodri-oliveira-dev.github.io`. O domínio planejado `rodrioliveira.com` permanece somente na configuração interna para que uma migração futura altere uma fonte central; esta implementação não muda DNS, Cloudflare, canonical ou deploy.

## Limites de validação

Localmente é possível validar conteúdo, schemas estruturais, digests, referências e presença no artefato. Após uma publicação autorizada, ainda é necessário verificar por `GET` e `HEAD` os três manifestos e os cinco `SKILL.md`, incluindo os Content-Types exigidos (`application/json` para o índice e `text/markdown` ou `text/plain` para as skills).

Em 27 de novembro de 2026, verificações `HEAD` em um JSON e um Markdown já publicados neste mesmo GitHub Pages retornaram, respectivamente, `application/json` e `text/markdown`, além de `Access-Control-Allow-Origin: *`. Isso indica compatibilidade da plataforma com os requisitos, mas não comprova os novos caminhos antes da publicação. O repositório não controla esses cabeçalhos por arquivo; qualquer divergência observada depois do deploy deve permanecer documentada até uma decisão de hospedagem ou edge aprovada. Esta implementação não modifica Cloudflare nem adiciona serviço intermediário.
