resource "azapi_resource" "log_analytics_workspace" {
  type      = "Microsoft.OperationalInsights/workspaces@2025-07-01"
  parent_id = data.azurerm_resource_group.web_push.id
  name      = local.log_analytics_name
  location  = data.azurerm_resource_group.web_push.location
  tags      = local.common_tags

  body = {
    properties = {
      features = {
        disableLocalAuth                            = true
        enableLogAccessUsingOnlyResourcePermissions = true
      }
      publicNetworkAccessForIngestion = "Enabled"
      publicNetworkAccessForQuery     = "Enabled"
      retentionInDays                 = var.log_analytics_retention_days
      sku = {
        name = "PerGB2018"
      }
      workspaceCapping = {
        dailyQuotaGb = var.log_analytics_daily_quota_gb
      }
    }
  }
}

resource "azurerm_monitor_diagnostic_setting" "cosmos_audit" {
  name                       = "send-audit-to-log-analytics"
  target_resource_id         = azapi_resource.cosmos_account.id
  log_analytics_workspace_id = azapi_resource.log_analytics_workspace.id

  enabled_log {
    category_group = "audit"
  }

  # Cosmos DB does not expose AllMetrics for diagnostic export.
  # Keep native Azure Monitor metrics and the audit log category group.
}

resource "azurerm_monitor_diagnostic_setting" "key_vault_audit" {
  name                       = "send-audit-to-log-analytics"
  target_resource_id         = azurerm_key_vault.vapid.id
  log_analytics_workspace_id = azapi_resource.log_analytics_workspace.id

  enabled_log {
    category_group = "audit"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_monitor_diagnostic_setting" "function_app" {
  count = var.create_function_app ? 1 : 0

  name                       = "send-runtime-to-log-analytics"
  target_resource_id         = azapi_resource.function_app[0].id
  log_analytics_workspace_id = azapi_resource.log_analytics_workspace.id

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
  log_analytics_workspace_id = azapi_resource.log_analytics_workspace.id

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
