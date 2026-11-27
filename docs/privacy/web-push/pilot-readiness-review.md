# Parecer consolidado de prontidão do Web Push

**Atualização aprovada pelo responsável em 27/11/2026, efetiva após merge do PR desta revisão:** a [ADR 0022](../../adr/0022-consolidar-privacidade-web-push-antes-do-piloto.md) distingue testes isolados, piloto individual e abertura pública. A revisão jurídica formal integral fica antes da abertura pública; para o piloto, permanece obrigatória avaliação documentada das obrigações aplicáveis ao fluxo efetivamente usado, inclusive transferências, aviso, segurança e retenção. Nenhum requisito legal é dispensado e nenhuma ativação é autorizada por este documento.

O parecer abaixo preserva o no-go e o inventário da data da revisão como evidência histórica. A exigência interna de revisão formal integral antes do piloto foi substituída pelos níveis da ADR; os bloqueios operacionais e as obrigações legais aplicáveis ao piloto não foram removidos.

Data da revisão: 27/11/2026

Escopo: issues #155 e #156, com base na `main` `8c959df5` após o PR #227

Natureza: revisão técnica e documental; não é parecer jurídico nem autorização de piloto

## Conclusão executiva

**Recomendação: não aprovar ainda a habilitação do piloto individual.** O MVP possui controles de consentimento, cancelamento, expiração, antiabuso, deduplicação, recuperação fail-closed e kill switches implementados e testados de forma isolada. O aviso candidato `1.0.0` está integrado à interface PT-BR, mas continua sujeito à revisão jurídica e à release manual.

Os bloqueios não justificam novos serviços ou arquitetura adicional. São necessários: aplicar/reconciliar a configuração já versionada em uma release autorizada; criar e validar o IAM mínimo do pós-release e o Environment protegido; comprovar retenção/categorias/custos no Azure; ensaiar recuperação sem reativar inscrições restauradas; concluir a revisão jurídica; e só então executar o piloto controlado da #166. Este documento não fecha issues, não altera ADRs e não remove nenhum bloqueio.

## Evidência consolidada

### Controles implementados e testados

| Controle | Evidência disponível | Limite da evidência |
| --- | --- | --- |
| Consentimento e minimização | Versão `1.0.0`, finalidade `new-articles-pt-br`, gesto afirmativo, validade absoluta de 365 dias, ausência de nome/e-mail/telefone/localização e evidência associada à geração | O aviso `1.0.0` ainda precisa de revisão jurídica; nenhum consentimento real foi coletado |
| Cancelamento e recuperação | Revogação remota antes da limpeza local, duas capacidades independentes, somente hashes no servidor, resposta idempotente e canal manual | Testado com mocks; dispositivo físico e falhas reais pertencem à #166 |
| Expiração e restauração | `expiresAtUtc` é fonte de verdade; TTL não autoriza envio; `recoveryEpoch` invalida inscrições restauradas e exige novo opt-in | O runbook existe, mas a rotação/recuperação real não foi ensaiada |
| API e antiabuso | Validação estrita, allowlist de provedores, limite de corpo, timeout, concorrência, CORS exato, rate limiting distribuído aproximado e fail-closed | CORS não autentica; tentativa negada ainda consome RU; pacote atual não está implantado |
| Proteção de dados | Cosmos/Storage sem autenticação local, Key Vault com RBAC, capacidades fora de URL/log, categorias diagnósticas reduzidas e logs estruturados sem PII | Configuração declarativa posterior à release precisa ser aplicada e comprovada no ambiente |
| Identidade de runtime e release | Managed identity, OIDC, States segregados, quatro atribuições de runtime e publicação separada foram comprovados na #149/#150 | As duas identidades específicas do pós-release ainda são somente Terraform declarativo |
| Deduplicação e reconciliação | Campanha determinística, create condicional, ETag, claim/lease, limite de 25, três tentativas, backoff e `OutcomeUnknown` sem retry automático | Fila é *at least once*; não existe garantia exactly-once e o código atual ainda não foi implantado |
| Kill switches | Frontend `enabled: false`; API sem base/chave pública; três gatilhos da Function declarados `Disabled=true`; dry-run padrão; enqueue exige issues fechadas, `ENQUEUE` e dois switches | O valor efetivo dos app settings precisa ser reconfirmado depois de qualquer apply/deploy |
| FinOps | Cosmos Serverless, FC1 sem Always Ready, máximo de duas instâncias, Log Analytics com cap declarativo de 0,1 GB/dia, budget mensal de assinatura registrado na #149 | Budget não bloqueia gasto; alertas e consumo atual precisam ser revistos antes do piloto |

Referências principais: [evidência das issues #151–#154](closure-evidence.md), [operação de campanhas](notification-operations.md), [runbook de recuperação](backup-recovery-runbook.md), [rastreabilidade](roadmap-traceability.md), [PR #219](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/pull/219) e [PR #227](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/pull/227). Os resultados automatizados desses PRs permanecem válidos para os commits revisados; não substituem observação do ambiente.

### Configuração declarativa ainda não aplicada ou não comprovada

A última release pública é `1.7.22`; o deployment Pages correspondente aponta para `f352a305`. A `main` revisada está em `8c959df5`. Portanto, não se deve inferir que o código, o aviso ou as mudanças Terraform posteriores estejam no Azure ou no site publicado.

| Origem versionada após `f352a305` | Operação futura autorizada necessária | Validação obrigatória depois da operação |
| --- | --- | --- |
| Backend das issues #152–#165 | Release coordenada do mesmo SHA, sem antecipar ativação | Hash/revisão do pacote, health, rotas ainda desabilitadas, logs sanitizados e ausência de inscrições/mensagens reais |
| App settings `register-subscription`, `revoke-subscription` e `ProcessWebPushCampaign` desabilitados; `SubscriptionRecoveryEpoch`; origem, limites e timeouts | Plan/apply do root de workload pela pipeline protegida | Valores efetivos dos settings, epoch esperada e três switches em `true` para `Disabled` |
| Exclusão de índices de hashes de capacidades no container Cosmos | Plan/apply protegido | `indexingPolicy.excludedPaths` efetiva, `defaultTtl = -1`, região única, local auth desabilitada e zero inscrição real |
| `immediatePurgeDataOn30Days = true` no workspace | Plan/apply protegido | Resposta ARM, retenção interativa/total por tabela, plano e exceções gerenciadas |
| Diagnósticos da Function restritos a `FunctionAppLogs` e `AppServicePlatformLogs`, sem `allLogs`/HTTP | Apply separado do root `diagnostics` | Categorias realmente ativadas nos quatro alvos e tabelas efetivamente ingeridas |
| Root isolado `notification-iam` | Revisão/aplicação manual separada, fora da release | Duas aplicações/Service Principals, subjects do Environment, função Cosmos sem delete e `Storage Queue Data Message Sender` somente na fila exata; ausência de papéis adicionais/herdados indevidos |
| Environment `web-push-notifications-dev` e suas variáveis não secretas | Configuração manual no GitHub | Restrição à `main`, revisores obrigatórios, IDs das duas identidades, URI exata da fila/Cosmos e switches ainda `false` |
| Aviso/consentimento `1.0.0` e link na homepage PT-BR | Revisão jurídica e release manual | Conteúdo publicado no mesmo SHA, âncora acessível, EN/ES sem controles e frontend ainda desativado até autorização posterior |

Consulta somente leitura em 27/11/2026 confirmou que o Environment `web-push-notifications-dev` **não existe** no repositório. Isso é bloqueio: um job não pode depender de um Environment ainda sem proteção, variáveis e credencial federada validadas.

## Validações operacionais pendentes

Os comandos abaixo são somente leitura. Substituir placeholders localmente, revisar a assinatura ativa antes de executar e registrar apenas propriedades/contagens sanitizadas — nunca State, tokens, endpoints Web Push, chaves, capacidades, linhas de log ou IDs desnecessários.

### 1. Revisão efetivamente publicada

```powershell
gh release view --repo rodri-oliveira-dev/rodri-oliveira-dev.github.io --json tagName,publishedAt,url
gh api 'repos/rodri-oliveira-dev/rodri-oliveira-dev.github.io/deployments?environment=github-pages&per_page=1' --jq '.[0] | {sha,created_at,environment}'
```

Confirmar que uma release futura usa o mesmo SHA para workload, backend, Pages, tag e GitHub Release. Não executar essa release nesta etapa.

### 2. Environment, OIDC e bloqueios do GitHub

```powershell
gh api repos/rodri-oliveira-dev/rodri-oliveira-dev.github.io/environments --jq '.environments[] | {name,protection_rules:[.protection_rules[].type],deployment_branch_policy}'
gh api repos/rodri-oliveira-dev/rodri-oliveira-dev.github.io/environments/web-push-notifications-dev/variables --jq '[.variables[].name]'
gh issue view 155 --repo rodri-oliveira-dev/rodri-oliveira-dev.github.io --json state
gh issue view 156 --repo rodri-oliveira-dev/rodri-oliveira-dev.github.io --json state
```

Depois da criação autorizada das aplicações, inspecionar cada credencial sem publicar identificadores:

```powershell
az ad app federated-credential list --id '<application-object-id>' --query "[].{name:name,issuer:issuer,subject:subject,audiences:audiences}" -o json
```

O subject esperado termina em `environment:web-push-notifications-dev`; audience e issuer devem ser exatos. Subjects iguais não tornam os Service Principals equivalentes: validar segregação de RBAC.

### 3. Function, kill switches e configuração pública

```powershell
az functionapp show --resource-group '<rg>' --name '<function>' --query "{state:state,location:location,httpsOnly:httpsOnly,publicNetworkAccess:publicNetworkAccess,identity:identity.type}" -o json

az functionapp config appsettings list --resource-group '<rg>' --name '<function>' --query "[?starts_with(name, 'AzureWebJobs.') || name=='Notifications__SubscriptionRecoveryEpoch' || name=='Notifications__AllowedOrigin' || name=='Notifications__MaximumRequestBodyBytes' || name=='Notifications__MaximumConcurrentRequestsPerInstance'].{name:name,value:value}" -o table
```

Exigir os três `AzureWebJobs.*.Disabled=true`. Confirmar health somente leitura; não chamar registro/cancelamento, não solicitar permissão do navegador e não habilitar trigger.

### 4. Cosmos, Storage e IAM mínimo

```powershell
az cosmosdb show --resource-group '<rg>' --name '<cosmos>' --query "{location:locations[0].locationName,disableLocalAuth:disableLocalAuth,publicNetworkAccess:publicNetworkAccess,backup:backupPolicy}" -o json

az cosmosdb sql container show --resource-group '<rg>' --account-name '<cosmos>' --database-name notifications --name subscriptions --query "{defaultTtl:resource.defaultTtl,excludedPaths:resource.indexingPolicy.excludedPaths[].path}" -o json

az storage queue metadata show --account-name '<storage>' --name '<queue>' --auth-mode login --query "{approximateMessageCount:approximateMessageCount}" -o json

az role assignment list --scope '<exact-resource-scope>' --include-inherited --query "[].{role:roleDefinitionName,scope:scope,principalType:principalType}" -o table
```

Executar a consulta de RBAC para o container Cosmos, fila de campanhas, Key Vault e Storage de runtime. Revisar também herança no Resource Group/assinatura; uma atribuição direta mínima não elimina privilégios herdados. A listagem de fila deve produzir apenas contagens/metadados — não ler corpos de mensagens.

### 5. Retenção, diagnósticos, logs e custos

Executar integralmente o [roteiro de retenção e diagnósticos](operational-retention-validation.md). Além disso:

```powershell
az monitor metrics list-definitions --resource '<resource-id>' --query "[].{name:name.value,unit:unit}" -o table
az consumption budget list --query "[].{name:name,amount:amount,timeGrain:timeGrain,start:timePeriod.startDate,end:timePeriod.endDate}" -o table
az monitor log-analytics query --workspace '<workspace-customer-id>' --analytics-query "Usage | where TimeGenerated > ago(30d) | summarize DataGB=sum(Quantity)/1000 by DataType | order by DataGB desc" -o table
```

Confirmar por métricas agregadas: zero documentos de inscrição antes do piloto; filas de campanha/poison vazias; RU, transações, execuções e ingestão compatíveis com o orçamento; cap e alertas existentes. Testar a entrega dos alertas sem criar custo ou alterar limiares exige procedimento humano separado.

### 6. Recuperação

O runbook foi revisado, mas um ensaio real de restore cria uma conta temporária e pode gerar custo. Ele **não é uma operação somente leitura e não está autorizado neste PR**. Antes do piloto, a #166 deve obter autorização específica, manter todos os kill switches ativos, rotacionar a epoch, provar que nenhuma inscrição restaurada é elegível e descartar/encerrar recursos temporários conforme o processo aprovado. Sem essa evidência, recuperação continua bloqueante.

## Pendências jurídicas

- confirmar a base legal proposta e a forma do consentimento;
- revisar o aviso público `1.0.0`, o controlador e o canal de atendimento;
- validar papéis, contratos, subprocessadores, países, transferências posteriores e mecanismo do art. 33 para Azure, GitHub, Google/FCM, Mozilla, Apple, WNS e Outlook;
- definir prazos necessários para prova de consentimento após o término, pedidos de titulares e incidentes, sem retenção indefinida;
- confirmar o procedimento de atendimento quando o titular perde as duas capacidades;
- revisar a transparência sobre IP/telemetria observados por infraestrutura e provedores e sobre retenções fora do controle do projeto.

Nenhuma expressão neste repositório deve ser apresentada como conformidade jurídica definitiva, garantia de residência integral no Brasil ou validação contratual dos fornecedores.

## Bloqueios efetivos para o piloto

1. Revisão jurídica do aviso, base legal, fornecedores e transferências não concluída.
2. Código/IaC posterior à release `1.7.22` ainda não implantado/reconciliado e, portanto, não comprovado no Azure.
3. Environment protegido, aplicações OIDC e RBAC mínimo de notificação ausentes/não aplicados.
4. Retenção por tabela, categorias efetivas, ausência de dados sensíveis nos logs e custos de ingestão sem evidência operacional atual.
5. Ensaio autorizado de restauração/reconciliação ainda não realizado.
6. Fluxos físicos de permissão, cancelamento, expiração, recuperação e concorrência multiaba ainda pertencem à #166.
7. Frontend, endpoints de inscrição/cancelamento e sender permanecem desativados; sua ativação não é consequência automática deste gate.

## Melhorias opcionais que não bloqueiam a continuidade

- Private Link/VNet para os endpoints Azure: reduz superfície, mas adiciona custo e operação desproporcionais ao piloto atual; requer ADR/FinOps próprios se reconsiderado.
- Ledger externo de revogações: aumentaria disponibilidade pós-restore, mas o descarte fail-closed e novo opt-in são proporcionais ao limite de até 100 inscritos.
- Budget adicional por Resource Group: o budget de assinatura cobre o workload; um budget granular pode melhorar atribuição, mas não substitui alertas nem constitui teto rígido.
- Automação adicional de relatórios de fornecedores: manter revisão humana simples enquanto o volume e a finalidade permanecerem restritos.

## Decisão humana requerida

O responsável deve decidir, após as evidências operacionais e jurídicas, se autoriza avançar à #166 com um único dispositivo controlado. A decisão deve registrar os riscos residuais aceitos, manter o piloto separado da produção e preservar a #167 como gate final. Fechar #155/#156 ou alterar ADRs continua sendo ação humana; este parecer não a executa.
