# Publicar contratos estáticos de Agent Readiness

## Status

Accepted

## Context

O portfólio já oferece HTML trilíngue, SEO, sitemap, PWA e ferramentas WebMCP experimentais somente de leitura, mas agentes externos não possuem contratos padronizados para descobrir esse conteúdo. A solução precisa preservar a hospedagem no GitHub Pages, evitar exposição das skills operacionais do repositório e manter custo recorrente adicional zero.

As especificações relevantes evoluem de forma independente e alguns auditores ainda verificam nomes anteriores. Em 27 de novembro de 2026, as referências vigentes são o formato Agent Skills, o Agent Skills Discovery RFC draft v0.2.0, ARD v0.91 com status Proposal e Personal Agent Protocol v1.0. Content Signals permanece uma política declarativa que terceiros podem ignorar.

## Decision

Publicar `robots.txt` com a política aprovada e manter em `.well-known` cinco skills públicas, o índice Agent Skills, o manifesto ARD e o documento Poppy website-only. A descoberta será inteiramente estática e somente de leitura. Não serão anunciados MCP, APIs privadas, Azure, Web Push, autenticação ou capacidades inexistentes.

Uma configuração versionada concentra origem canônica, domínio futuro, identidade e metadados compartilhados. Um script Python sem dependências gera deterministicamente os JSONs e calcula SHA-256 sobre os bytes publicados dos `SKILL.md`. Testes locais verificam contratos, referências, digests e o allowlist do Pages; o gate `Site validation` detecta drift. A decisão foi aceita para implantação por aprovação humana no PR que introduz os contratos.

ARD adotará `/.well-known/ard.json`, conforme v0.91, e não duplicará o predecessor opcional `ai-catalog.json` para satisfazer auditores desatualizados. Poppy declarará somente `organization` e `web`, sem OAuth, sessões, APIs ou agente de conversa. O domínio planejado `rodrioliveira.com` não será emitido antes de uma migração aprovada.

O Lighthouse 13.0.3 considera `Content-Signal` inválido por não reconhecer a extensão e reduz o score SEO apesar de a diretiva seguir a fonte oficial. Até o suporte do auditor, excluir somente o audit `robots-txt` do Lighthouse e manter sua cobertura como validação bloqueante dedicada, sem reduzir o threshold SEO nem desabilitar outros audits.

### Alternativas consideradas

Manifestos manuais foram rejeitados pelo risco de drift e digests inconsistentes. Publicar as skills internas foi rejeitado por expor procedimentos operacionais. Adicionar Cloudflare, Worker ou backend para controlar cabeçalhos foi rejeitado por ampliar infraestrutura, segurança operacional e custo; `ai-catalog.json` foi rejeitado porque a compatibilidade com o predecessor é opcional na especificação vigente.

## Consequences

Agentes podem descobrir conteúdo público nos três idiomas e verificar a integridade das skills sem backend, banco de dados, modelos, embeddings ou serviços pagos. O custo recorrente adicional previsto é zero e a superfície de ataque permanece composta por arquivos estáticos sem credenciais ou operações de escrita.

### Segurança e privacidade

Os contratos expõem somente conteúdo profissional já público. Eles não contêm credenciais, dados privados, endpoints autenticados, instruções de infraestrutura ou operações de escrita. Content Signals declara preferência, mas não constitui controle técnico nem garantia de cumprimento.

### FinOps

A geração usa a biblioteca padrão do Python no CI existente e a hospedagem estática já adotada. Não há recurso provisionado, serviço pago ou custo recorrente adicional previsto.

### Limitações

O GitHub Pages deve servir os media types adequados, aceitar `GET` e `HEAD` e incluir os arquivos no artefato; isso só pode ser comprovado nos novos caminhos após publicação. O repositório não controla cabeçalhos CORS por arquivo. A publicação atual retorna media types adequados e `Access-Control-Allow-Origin: *` para arquivos JSON e Markdown existentes, mas os novos caminhos exigem verificação pós-publicação.

### Manutenção e evolução

A geração e os testes acrescentam manutenção ao CI. Mudanças nas especificações exigirão revisão explícita da configuração, gerador, testes e desta ADR. Uma migração de domínio deve alterar a fonte canônica e regenerar os contratos em mudança própria, sem anunciar simultaneamente duas origens.
