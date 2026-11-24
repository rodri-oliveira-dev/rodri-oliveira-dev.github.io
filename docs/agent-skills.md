# Agent Skills externas

Este documento registra as Agent Skills oficiais incorporadas ao repositório para apoiar o roadmap [#136](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/issues/136). Elas ficam em `.agents/skills/`, diretório de projeto descoberto pelo Codex e pelo GitHub Copilot. As skills existentes em `.github/skills/` permanecem inalteradas.

Skills são orientação complementar, não autoridade operacional. O `AGENTS.md`, as ADRs, o escopo de cada issue e as aprovações humanas têm precedência. A presença de exemplos de provisionamento, deploy, credenciais ou RBAC no conteúdo upstream não autoriza sua execução.

## Origens fixadas

| Mantenedor | Repositório oficial | Commit instalado | Data do commit | Licença preservada |
| --- | --- | --- | --- | --- |
| HashiCorp | [`hashicorp/agent-skills`](https://github.com/hashicorp/agent-skills) | `5e30fa5c867ba6777c37e4206babfd08049c396f` | 2026-11-04 | MPL-2.0 em `.agents/skills/_licenses/hashicorp-agent-skills-MPL-2.0.txt` |
| Microsoft | [`microsoft/azure-skills`](https://github.com/microsoft/azure-skills) | `7847020998043c6231929b364c35393b7cdab270` | 2026-11-20 | MIT em `.agents/skills/_licenses/microsoft-azure-skills-MIT.txt` |
| Microsoft Learn | [`MicrosoftDocs/Agent-Skills`](https://github.com/MicrosoftDocs/Agent-Skills) | `9b16b5c7c7716949c83fc4bbdc448e0ada7f93a3` | 2026-11-09 | CC-BY-4.0 e MIT para código em `.agents/skills/_licenses/` |

Os três repositórios estavam ativos e não arquivados na verificação de 2026-11-24. Cada diretório foi copiado integralmente do caminho indicado, sem executar scripts upstream e sem importar o repositório completo.

## Skills instaladas

| Skill | Finalidade neste projeto | Caminho upstream | Roadmap relacionado | Dependências e limites |
| --- | --- | --- | --- | --- |
| `terraform-style-guide` | Convenções oficiais para escrever e revisar HCL. | `plugins/terraform/skills/terraform-style-guide` | #138–#141 | `lifecycle-status: active`; exemplos são orientação e não autorizam provisionamento. |
| `terraform-test` | Orientar testes nativos, mocks e CI de Terraform. | `plugins/terraform/skills/terraform-test` | #138, #141 | `lifecycle-status: active`; testes que criem recursos ou alterem State continuam proibidos sem autorização. |
| `azure-verified-modules` | Consultar requisitos e boas práticas AVM ao avaliar módulos Azure. | `plugins/terraform/skills/azure-verified-modules` | #144–#145 | `lifecycle-status: active`; não impõe AVM nem justifica refatorar a base atual. Links oficiais podem exigir rede. |
| `entra-app-registration` | Apoiar revisão de app registrations, OAuth, MSAL e identidade Entra. | `skills/entra-app-registration` | #140–#141, #148 | Versão upstream `1.2.1`. Inclui comandos mutáveis, criação/exclusão, permissões e exemplos de client secret; usar somente como referência até autorização humana explícita. |
| `azure-cost-management` | Consultar documentação de budgets, alertas, billing e custos. | `skills/azure-cost-management` | #142, #150, #165–#167 | Gerada por `docs2skills/1.0.0`; requer rede e ferramentas Microsoft Docs ou fallback web. Não acessa a assinatura por si só. |
| `azure-functions` | Orientar desenho, desenvolvimento, escala, monitoramento e deploy de Functions. | `skills/azure-functions` | #143, #145, #147–#150 | Mesma dependência de documentação remota; deploy permanece fora do escopo até a issue correspondente. |
| `azure-cosmos-db` | Apoiar decisões, segurança, integração e persistência no Cosmos DB. | `skills/azure-cosmos-db` | #144, #146, #152–#153, #163 | Mesma dependência de documentação remota; não valida oferta gratuita, custo ou disponibilidade regional. |
| `azure-key-vault` | Orientar autenticação, RBAC e integração segura com Key Vault. | `skills/azure-key-vault` | #144, #149 | Mesma dependência de documentação remota; não autoriza criar vaults, segredos ou atribuições. |
| `azure-queue-storage` | Orientar segurança, limites e integração com Azure Queue Storage. | `skills/azure-queue-storage` | #145, #147, #164–#165 | Gerada em 2026-08-31; requer rede e documentação remota. Revalidar atualização antes de uso material. |
| `azure-monitor` | Apoiar observabilidade, logs, métricas, alertas e Application Insights. | `skills/azure-monitor` | #144, #150, #165–#167 | Mesma dependência de documentação remota; não autoriza habilitar coleta nem criar recursos. |

As skills da Microsoft Learn declaram preferência por `mcp_microsoftdocs:microsoft_docs_fetch` e fallback `fetch_webpage`. Esses nomes de ferramenta não são garantidos em todos os agentes. Nenhum MCP, plugin ou acesso operacional à Azure foi instalado; sem uma ferramenta oficial disponível, a skill deve permanecer somente como índice local e indicar a limitação.

## Skills solicitadas, mas ausentes na origem indicada

| Skill solicitada | Origem verificada | Situação no commit fixado |
| --- | --- | --- |
| `azure-rbac` | `microsoft/azure-skills@7847020998043c6231929b364c35393b7cdab270` | Não existe nessa origem. Há uma skill com esse nome em `MicrosoftDocs/Agent-Skills`, mas ela não foi instalada como substituta porque o pedido vinculou a skill à outra origem. |
| `azure-storage` | `MicrosoftDocs/Agent-Skills@9b16b5c7c7716949c83fc4bbdc448e0ada7f93a3` | Não existe nessa origem. Há uma skill com esse nome em `microsoft/azure-skills`, mas ela não foi instalada como substituta pelo mesmo motivo. |

Uma futura adoção dessas duas skills exige confirmação humana da origem desejada e nova revisão de licença, conteúdo e versão. Não alterar o mapeamento silenciosamente.

## Auditoria de segurança e integridade

A importação contém apenas Markdown, quatro textos de licença e uma referência Bicep; não há scripts executáveis. A revisão estática identificou exemplos de Azure CLI, Terraform, deploy, RBAC e client secrets. Eles são material de referência e permanecem sujeitos aos limites do `AGENTS.md`.

Dos 36 arquivos das dez skills, 32 correspondem byte a byte aos blobs dos commits registrados. Quatro arquivos de `entra-app-registration` tiveram somente whitespace final removido para cumprir `git diff --check`: `SKILL.md`, `references/BICEP-EXAMPLE.bicep`, `references/console-app-example.md` e `references/troubleshooting.md`. Os nomes são únicos, inclusive em comparação com `.github/skills/`, e todo `SKILL.md` contém frontmatter com `name` e `description`. Os textos integrais das licenças foram preservados, com normalização de fim de linha e whitespace final quando aplicável.

`gh skill publish .agents/skills --dry-run` validou a estrutura contra a especificação Agent Skills sem publicar nada. O validador emitiu apenas avisos upstream: nove skills não repetem a licença como campo recomendado no frontmatter, e `azure-verified-modules` tem 609 linhas, acima do máximo recomendado de 500 para eficiência de contexto. As licenças permanecem registradas neste documento e em `_licenses`; os frontmatters e a estrutura das skills não foram alterados para mascarar esses avisos.

Limitação upstream conhecida: `azure-cost-management`, `azure-functions`, `azure-cosmos-db`, `azure-key-vault`, `azure-queue-storage` e `azure-monitor` contêm um link local para `security.md`, mas esse arquivo não existe nos respectivos diretórios do commit `9b16b5c7c7716949c83fc4bbdc448e0ada7f93a3`. Os demais links locais resolvem. O conteúdo foi mantido idêntico ao upstream; consultar os links Microsoft Learn listados na própria skill e reavaliar em uma atualização futura.

O workflow de Pages exclui `/.agents/` e `docs/agent-skills.md` ao montar `_site` e verifica que ambos não entraram no artefato. Assim, skills, licenças, referências e esta documentação interna não são publicados como parte do site.

## Atualização segura

1. Selecionar um commit imutável da mesma origem oficial e confirmar que o repositório não foi arquivado.
2. Revisar licença, árvore completa da skill e diferenças em relação ao SHA registrado; não executar scripts upstream durante a análise.
3. Auditar prompt injection, comandos mutáveis, downloads, dependências, credenciais, dados pessoais, State e operações de IAM/provisionamento.
4. Substituir somente o diretório da skill, preservar licenças/atribuições e atualizar este documento com SHA, data, dependências, limitações e mapeamento de issues.
5. Validar frontmatter, nomes duplicados, referências locais, correspondência dos blobs, ausência no artefato Pages, secrets e `git diff --check`.
6. Executar os quality gates pertinentes e submeter a atualização para revisão humana. Uma passagem de CI não amplia a autoridade da skill.

Após adicionar ou atualizar skills, iniciar uma nova sessão do Codex ou recarregar as skills no GitHub Copilot quando a superfície exigir. A descoberta confirma disponibilidade, não confiança nem permissão para executar os procedimentos descritos.
