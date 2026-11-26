# ADR 0019: Restringir escrita de Diagnostics do provisionador

## Status

Accepted

## Context

A [ADR 0018](0018-segregar-diagnostic-settings.md) transferiu os Diagnostic Settings para um root, State, identidade OIDC e Environment dedicados. A execução protegida `45881538182` criou os três settings de fundação com o mesmo fingerprint no Plan e no replan; a execução `45882175625` confirmou idempotência sem mudanças. O provisionador principal ainda recebe `Microsoft.Insights/diagnosticSettings/write` pela Custom Role do workload, embora seu root não declare mais esses recursos.

O gate da release principal continua usando ARM GET para verificar destino e categorias antes de criar a Function App e após reconciliar o quarto setting. Portanto, `Microsoft.Insights/diagnosticSettings/read` permanece uma dependência operacional. A role efetiva possui 41 Actions, nenhuma DataAction, nenhum curinga de gerenciamento e nenhuma `sharedKeys/action`, e coincide com `provisioner-candidate.json` no momento desta proposta.

## Decision

Remover exclusivamente `Microsoft.Insights/diagnosticSettings/write` da Custom Role `Portfolio Push Workload Provisioner`, preservando `diagnosticSettings/read` e todas as outras Actions até suas dependências serem avaliadas separadamente. A matriz canônica fica registrada em `provisioner-candidate.json` com 40 Actions.

A alteração foi aprovada explicitamente pelo responsável na issue #149 em 26/11/2026. Antes da execução, a definição efetiva foi relida e comparada ao baseline de 41 Actions. A atualização removeu somente a Action aprovada, sem trocar escopo, principal, atribuições, NotActions ou DataActions; a releitura confirmou 40 Actions, `diagnosticSettings/read` presente e `sharedKeys/action` ausente. O gate ARM somente leitura e um Plan protegido da fundação permanecem como validações pós-propagação. Não executar Apply da fundação para validar a redução.

Se a definição divergir do baseline, se o Plan exigir escrita de Diagnostics ou se um gate somente leitura falhar por autorização, interromper. O rollback restaura somente a Action removida na mesma definição e no mesmo escopo, seguido das mesmas verificações; não conceder Contributor, Owner, curingas ou papéis adicionais.

## Consequences

O provisionador principal deixará de criar ou redirecionar Diagnostic Settings, reduzindo o impacto de comprometimento e tornando a separação da ADR 0018 efetiva também no plano de gerenciamento. Ele continuará capaz de verificar os settings por ARM GET. A identidade de Diagnostics permanecerá como única escritora, inclusive para o futuro setting da Function App.

A Custom Role é compartilhada pela fundação e pela futura criação da Function App; falhas de autorização durante Plan devem ser classificadas sem ampliar permissões automaticamente. A atualização de role pode levar tempo para propagar. A proposta não altera recursos, State, custos, credenciais, atribuições ou o status das ADRs 0017 e 0018.
