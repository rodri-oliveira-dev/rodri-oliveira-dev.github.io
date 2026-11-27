---
name: portfolio-agent-readiness
description: >-
  Manter Content Signals, Agent Skills Discovery, ARD e Poppy no portfólio
  estático, incluindo geração determinística, digests, domínio canônico,
  skills públicas, validação e empacotamento no GitHub Pages.
---

# Agent Readiness do portfólio

## Fontes de verdade

- `.github/agent-readiness.json` concentra origem canônica, domínio futuro, identidade pública e metadados compartilhados das cinco skills.
- `.well-known/agent-skills/*/SKILL.md` contém somente instruções públicas de descoberta; nunca publique `.agents/skills/` ou `.github/skills/`.
- `.github/scripts/sync-agent-readiness.py` gera o índice Agent Skills v0.2.0, o manifesto ARD e o documento Poppy.
- `docs/adr/0021-publicar-contratos-estaticos-agent-readiness.md` registra as versões, limites e decisões arquiteturais.

## Manutenção

Preserve o modelo static-first e anuncie apenas páginas e capacidades públicas existentes. Edite a configuração ou as skills públicas, execute o sincronizador e revise os três JSONs gerados. Os digests devem corresponder aos bytes versionados de cada `SKILL.md`.

Mantenha todas as URLs publicadas na origem canônica configurada. O domínio planejado existe apenas para preparar uma migração futura; não o emita enquanto ela não for aprovada e executada em mudança própria. Poppy permanece no perfil website-only, sem OAuth, sessões, APIs ou agentes de conversa. ARD não anuncia MCP, Azure, notificações ou `ai-catalog.json`.

Enquanto o Lighthouse não reconhecer `Content-Signal`, preserve a exclusão restrita do audit `robots-txt` e a validação bloqueante equivalente em `test_agent_readiness.py`. Não reduza o threshold SEO nem exclua outros audits para acomodar essa divergência.

## Validação

Execute:

```text
python3 .github/scripts/sync-agent-readiness.py
python3 .github/scripts/sync-agent-readiness.py --check
python3 -m unittest discover -s .github/scripts -p 'test_agent_readiness.py'
python3 -m unittest discover -s .github/scripts -p 'test_assemble_site.py'
```

Depois aplique as verificações de SEO e regressão definidas no `AGENTS.md`. Confirme no artefato do Pages a presença de `.well-known`. Content-Type, `GET`/`HEAD` e CORS dos novos caminhos só podem ser comprovados contra a publicação real; o GitHub Pages não oferece configuração de cabeçalhos por arquivo neste repositório, embora os tipos `.json` e `.md` já publicados atualmente retornem media types adequados e `Access-Control-Allow-Origin: *`.
