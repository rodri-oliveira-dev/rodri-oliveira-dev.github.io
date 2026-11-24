output "cosmos_account_endpoint" {
  description = "Endpoint não secreto da conta Cosmos DB usado pelo runtime com identidade gerenciada."
  value       = azurerm_cosmosdb_account.notifications.endpoint
}

output "cosmos_subscriptions_container_id" {
  description = "ID do container de inscrições no Cosmos DB."
  value       = azurerm_cosmosdb_sql_container.subscriptions.id
}

output "functions_runtime_identity_id" {
  description = "ID da identidade gerenciada dedicada ao runtime da Function App."
  value       = azurerm_user_assigned_identity.functions_runtime.id
}

output "key_vault_uri" {
  description = "URI não secreta do Key Vault; nenhum valor de segredo é exportado."
  value       = azurerm_key_vault.vapid.vault_uri
}

output "log_analytics_workspace_id" {
  description = "ID do workspace regional de observabilidade."
  value       = azurerm_log_analytics_workspace.notifications.id
}

output "resource_group_id" {
  description = "ID do Resource Group existente referenciado pela configuração."
  value       = data.azurerm_resource_group.web_push.id
}

output "resource_group_location" {
  description = "Região informada pela Azure para o Resource Group existente."
  value       = data.azurerm_resource_group.web_push.location
}
