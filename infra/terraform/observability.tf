resource "azurerm_log_analytics_workspace" "notifications" {
  name                = local.log_analytics_name
  location            = data.azurerm_resource_group.web_push.location
  resource_group_name = data.azurerm_resource_group.web_push.name
  sku                 = "PerGB2018"
  retention_in_days   = var.log_analytics_retention_days
  daily_quota_gb      = var.log_analytics_daily_quota_gb

  tags = local.common_tags
}

resource "azurerm_monitor_diagnostic_setting" "cosmos_audit" {
  name                       = "send-audit-to-log-analytics"
  target_resource_id         = azapi_resource.cosmos_account.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.notifications.id

  enabled_log {
    category_group = "audit"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_monitor_diagnostic_setting" "key_vault_audit" {
  name                       = "send-audit-to-log-analytics"
  target_resource_id         = azurerm_key_vault.vapid.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.notifications.id

  enabled_log {
    category_group = "audit"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_monitor_diagnostic_setting" "function_app" {
  name                       = "send-runtime-to-log-analytics"
  target_resource_id         = azurerm_function_app_flex_consumption.notifications.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.notifications.id

  enabled_log {
    category_group = "allLogs"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_monitor_diagnostic_setting" "queue_service" {
  name                       = "send-queue-audit-to-log-analytics"
  target_resource_id         = "${azurerm_storage_account.functions.id}/queueServices/default"
  log_analytics_workspace_id = azurerm_log_analytics_workspace.notifications.id

  enabled_log {
    category = "StorageDelete"
  }

  enabled_log {
    category = "StorageRead"
  }

  enabled_log {
    category = "StorageWrite"
  }

  enabled_metric {
    category = "Transaction"
  }
}
