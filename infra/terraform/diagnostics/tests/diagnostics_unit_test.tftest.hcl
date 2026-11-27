mock_provider "azurerm" {}

variables {
  subscription_id = "00000000-0000-0000-0000-000000000000"
  tenant_id       = "00000000-0000-0000-0000-000000000000"
}

run "foundation_diagnostics" {
  command = plan

  assert {
    condition     = length(azurerm_monitor_diagnostic_setting.cosmos_audit.enabled_log) == 1 && tolist(azurerm_monitor_diagnostic_setting.cosmos_audit.enabled_log)[0].category_group == "audit" && length(azurerm_monitor_diagnostic_setting.cosmos_audit.enabled_metric) == 0
    error_message = "Cosmos deve exportar o grupo audit sem categorias de métricas não suportadas."
  }

  assert {
    condition     = length(azurerm_monitor_diagnostic_setting.key_vault_audit.enabled_log) == 1 && tolist(azurerm_monitor_diagnostic_setting.key_vault_audit.enabled_log)[0].category_group == "audit" && toset([for metric in azurerm_monitor_diagnostic_setting.key_vault_audit.enabled_metric : metric.category]) == toset(["AllMetrics"])
    error_message = "Key Vault deve preservar audit e AllMetrics."
  }

  assert {
    condition     = toset([for log in azurerm_monitor_diagnostic_setting.queue_service.enabled_log : log.category]) == toset(["StorageRead", "StorageWrite", "StorageDelete"]) && toset([for metric in azurerm_monitor_diagnostic_setting.queue_service.enabled_metric : metric.category]) == toset(["Transaction"])
    error_message = "Queue Service deve preservar as três categorias de logs e Transaction."
  }

  assert {
    condition     = length(azurerm_monitor_diagnostic_setting.function_app) == 0
    error_message = "Foundation não deve configurar uma Function ainda inexistente."
  }

  assert {
    condition     = azurerm_monitor_diagnostic_setting.cosmos_audit.target_resource_id == local.cosmos_id && azurerm_monitor_diagnostic_setting.key_vault_audit.target_resource_id == local.vault_id && azurerm_monitor_diagnostic_setting.queue_service.target_resource_id == local.queue_id
    error_message = "Os alvos devem apontar para os recursos existentes do workload."
  }

  assert {
    condition     = azurerm_monitor_diagnostic_setting.cosmos_audit.log_analytics_workspace_id == local.workspace_id && azurerm_monitor_diagnostic_setting.key_vault_audit.log_analytics_workspace_id == local.workspace_id && azurerm_monitor_diagnostic_setting.queue_service.log_analytics_workspace_id == local.workspace_id
    error_message = "Todos os diagnósticos devem apontar para o workspace dedicado."
  }
}

run "function_diagnostics" {
  command = plan

  variables {
    include_function = true
  }

  assert {
    condition     = length(azurerm_monitor_diagnostic_setting.function_app) == 1 && azurerm_monitor_diagnostic_setting.function_app[0].target_resource_id == local.function_id && azurerm_monitor_diagnostic_setting.function_app[0].log_analytics_workspace_id == local.workspace_id
    error_message = "A Function existente deve ter diagnóstico no workspace correto."
  }

  assert {
    condition     = toset([for log in azurerm_monitor_diagnostic_setting.function_app[0].enabled_log : log.category]) == toset(["FunctionAppLogs"]) && toset([for metric in azurerm_monitor_diagnostic_setting.function_app[0].enabled_metric : metric.category]) == toset(["AllMetrics"])
    error_message = "A Function deve excluir logs HTTP e preservar somente FunctionAppLogs e AllMetrics, categorias suportadas pelo recurso Flex."
  }
}
