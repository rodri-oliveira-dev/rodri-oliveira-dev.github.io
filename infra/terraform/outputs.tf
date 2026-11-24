output "cosmos_account_endpoint" {
  description = "Endpoint não secreto da conta Cosmos DB usado pelo runtime com identidade gerenciada."
  value       = "https://${local.cosmos_account_name}.documents.azure.com:443/"
}

output "cosmos_subscriptions_container_id" {
  description = "ID do container de inscrições no Cosmos DB."
  value       = azapi_resource.subscriptions_container.id
}

output "function_app_health_url" {
  description = "URL não secreta do health check usada pelo smoke test; não expõe operação administrativa."
  value       = "https://${azurerm_function_app_flex_consumption.notifications.default_hostname}/api/health"
}

output "function_app_name" {
  description = "Nome da Function App usada pelo fluxo de deploy independente do site."
  value       = azurerm_function_app_flex_consumption.notifications.name
}

output "function_campaign_queue_id" {
  description = "ID da fila privada de campanhas."
  value       = azurerm_storage_queue.campaigns.id
}

output "function_storage_account_id" {
  description = "ID da conta dedicada ao host, artefatos e filas da Function App."
  value       = azurerm_storage_account.functions.id
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
