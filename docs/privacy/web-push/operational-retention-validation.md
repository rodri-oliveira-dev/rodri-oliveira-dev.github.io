# Validação operacional de retenção e diagnósticos

Status: comandos preparados, **não executados**. A configuração declarativa não comprova o comportamento do ambiente.

O Terraform define `retentionInDays = 30`, `immediatePurgeDataOn30Days = true`, cap de 0,1 GB/dia e categorias diagnósticas limitadas. Ainda é obrigatório verificar a resposta ARM, overrides por tabela, plano, retenção interativa e total, categorias disponíveis/ativadas e tabelas gerenciadas. `Usage` e `AzureActivity` podem manter pelo menos 90 dias; se qualquer dado pessoal ou correlacionável sujeito à decisão de 30 dias cair nessas exceções, isso é bloqueio humano/jurídico, não permissão para flexibilizar a política.

## Azure CLI — somente leitura

Preencher os placeholders localmente. Não publicar IDs completos nem saídas com dados operacionais.

```bash
az monitor log-analytics workspace show --resource-group <rg> --workspace-name <workspace> --query "{retentionInDays:retentionInDays,immediatePurgeDataOn30Days:features.immediatePurgeDataOn30Days,dailyQuotaGb:workspaceCapping.dailyQuotaGb,sku:sku.name,location:location}" -o json

az monitor log-analytics workspace table list --resource-group <rg> --workspace-name <workspace> --query "[].{table:name,plan:plan,retentionInDays:retentionInDays,totalRetentionInDays:totalRetentionInDays,archiveRetentionInDays:archiveRetentionInDays}" -o table

az monitor diagnostic-settings list --resource <resource-id> --query "[].{name:name,workspaceId:workspaceId,logs:logs[].{category:category,categoryGroup:categoryGroup,enabled:enabled},metrics:metrics[].{category:category,enabled:enabled}}" -o json

az monitor diagnostic-settings categories list --resource <resource-id> --query "[].{name:name,categoryType:categoryType,categoryGroups:categoryGroups}" -o table

az monitor log-analytics query --workspace <workspace-customer-id> --analytics-query "Usage | where TimeGenerated > ago(30d) | summarize DataGB=sum(Quantity)/1000 by DataType | order by DataGB desc" -o table
```

Repetir os dois comandos de Diagnostic Settings para Cosmos, Key Vault, Queue Service e Function. Comparar categorias disponíveis com as ativadas; `allLogs`, logs HTTP e categorias novas não devem aparecer implicitamente.

## Azure PowerShell — somente leitura

```powershell
$workspace = Get-AzOperationalInsightsWorkspace -ResourceGroupName '<rg>' -Name '<workspace>'
$workspace | Select-Object Name, Location, RetentionInDays, Sku, WorkspaceCapping, Features

Get-AzOperationalInsightsTable -ResourceGroupName '<rg>' -WorkspaceName '<workspace>' |
  Select-Object Name, Plan, RetentionInDays, TotalRetentionInDays, ArchiveRetentionInDays |
  Sort-Object Name

$resourceIds = @('<cosmos-id>', '<key-vault-id>', '<queue-service-id>', '<function-id>')
foreach ($resourceId in $resourceIds) {
  Get-AzDiagnosticSetting -ResourceId $resourceId
  Get-AzDiagnosticSettingCategory -ResourceId $resourceId
}

Invoke-AzOperationalInsightsQuery -WorkspaceId $workspace.CustomerId -Query @'
Usage
| where TimeGenerated > ago(30d)
| summarize DataGB=sum(Quantity)/1000 by DataType
| order by DataGB desc
'@
```

## Evidência e decisão

Registrar somente: data UTC, identidade do revisor, comandos/versões, propriedades relevantes, lista de tabelas e divergências, sem linhas de log. Classificar cada tabela como herança de workspace, override explícito, retenção gerenciada ou não aplicável; confirmar retenção total e interativa.

Impactos financeiros a avaliar: ingestão por categoria, retenção interativa acima do incluído, retenção total/archive, search/restore jobs, exportação e ultrapassagem eventual do cap diário. Reduzir coleta desnecessária pode baixar custo; não apagar evidência obrigatória nem alterar retenção sem decisão humana/jurídica.

Esta comprovação é gate obrigatório em #156, requisito de observabilidade/retenção em #165 e condição do go/no-go de #167.

Referências: [retenção do Log Analytics](https://learn.microsoft.com/azure/azure-monitor/logs/data-retention-configure) e [Diagnostic Settings](https://learn.microsoft.com/azure/azure-monitor/platform/diagnostic-settings).
