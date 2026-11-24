output "resource_group_id" {
  description = "ID do Resource Group existente referenciado pela configuração."
  value       = data.azurerm_resource_group.web_push.id
}

output "resource_group_location" {
  description = "Região informada pela Azure para o Resource Group existente."
  value       = data.azurerm_resource_group.web_push.location
}
