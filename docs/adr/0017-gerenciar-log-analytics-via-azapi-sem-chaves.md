# ADR 0017: Gerenciar Log Analytics via AzAPI sem chaves locais

## Status

Proposed

## Context

O workspace regional recebe os diagnósticos da fundação Web Push e precisa preservar retenção e quota compatíveis com o orçamento. Na versão fixada do AzureRM, `azurerm_log_analytics_workspace` lista workspaces excluídos em toda a assinatura antes da criação. Durante a leitura, o recurso também tenta obter as shared keys do workspace, embora tolere a negação dessa chamada.

A identidade de provisionamento deve permanecer restrita ao Resource Group do workload, sem leitura no nível da assinatura e sem acesso a credenciais. Conceder `Microsoft.OperationalInsights/deletedworkspaces/read` na assinatura ou `Microsoft.OperationalInsights/workspaces/sharedKeys/action` contrariaria esse limite e aumentaria o impacto de uma eventual violação.

## Decision

Propor o gerenciamento do workspace com `azapi_resource` e a mesma API `Microsoft.OperationalInsights/workspaces@2025-07-01` usada pelo AzureRM 5.14.0. O corpo declara SKU `PerGB2018`, retenção e quota diária, habilita acesso público de ingestão e consulta necessário nesta fundação sem rede privada e configura `disableLocalAuth=true` e `enableLogAccessUsingOnlyResourcePermissions=true`.

Não exportar customer ID, shared keys ou outra resposta do workspace. Preservar somente o ID ARM usado pelos diagnostic settings. Manter o preflight do AzAPI e incluir, ainda como candidata, a leitura de status de operação assíncrona do Log Analytics. A operação deve ser comprovada por plano e provisionamento controlado antes de considerar a Custom Role suficiente.

Esta decisão permanece `Proposed` até aprovação humana explícita. O PR e seus testes não autorizam criação de papel, atribuição IAM, `terraform apply` ou provisionamento.

## Consequences

A criação deixa de depender da listagem de workspaces excluídos no escopo da assinatura e o refresh deixa de solicitar shared keys. A autenticação local fica bloqueada por configuração declarativa e as consultas passam a respeitar permissões no recurso.

O State continua contendo o corpo de configuração conhecido pelo Terraform e metadados retornados pelo ARM conforme o comportamento do AzAPI. Nenhum segredo pode ser adicionado ao corpo. A detecção de drift fica limitada às propriedades retornadas pela API e mescladas pelo provider; não serão concedidas permissões de chaves ou credenciais para ampliar essa visibilidade.

A mudança de endereço Terraform não exige `moved` porque nenhum workspace foi provisionado. Se um recurso passar a existir fora deste State antes do primeiro apply, o fluxo deve parar para reconciliação explícita, sem sobrescrita automática.
