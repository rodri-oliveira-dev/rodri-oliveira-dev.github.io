locals {
  rg_id        = "/subscriptions/${var.subscription_id}/resourceGroups/rg-portfolio-push-workload-dev"
  workspace_id = "${local.rg_id}/providers/Microsoft.OperationalInsights/workspaces/log-portfolio-push-dev"
  cosmos_id    = "${local.rg_id}/providers/Microsoft.DocumentDB/databaseAccounts/cos-portpush-dev-1350159615"
  vault_id     = "${local.rg_id}/providers/Microsoft.KeyVault/vaults/kv-push-dev-1350159615"
  queue_id     = "${local.rg_id}/providers/Microsoft.Storage/storageAccounts/stportpushdev1350159615/queueServices/default"
  function_id  = "${local.rg_id}/providers/Microsoft.Web/sites/func-portpush-dev-1350159615"
}

resource "azurerm_monitor_diagnostic_setting" "cosmos_audit" {
  name                       = "send-audit-to-log-analytics"
  target_resource_id         = local.cosmos_id
  log_analytics_workspace_id = local.workspace_id

  enabled_log {
    category_group = "audit"
  }

  # Cosmos DB does not expose AllMetrics for diagnostic export.
  # Keep native Azure Monitor metrics and the audit log category group.

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_monitor_diagnostic_setting" "key_vault_audit" {
  name                       = "send-audit-to-log-analytics"
  target_resource_id         = local.vault_id
  log_analytics_workspace_id = local.workspace_id

  enabled_log {
    category_group = "audit"
  }

  enabled_metric {
    category = "AllMetrics"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_monitor_diagnostic_setting" "function_app" {
  count = var.include_function ? 1 : 0

  name                       = "send-runtime-to-log-analytics"
  target_resource_id         = local.function_id
  log_analytics_workspace_id = local.workspace_id

  # HTTP access logs can contain client network metadata and request URLs that
  # are unnecessary for the capability-based API.
  enabled_log {
    category = "FunctionAppLogs"
  }

  enabled_log {
    category = "AppServicePlatformLogs"
  }

  enabled_metric {
    category = "AllMetrics"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_monitor_diagnostic_setting" "queue_service" {
  name                       = "send-queue-audit-to-log-analytics"
  target_resource_id         = local.queue_id
  log_analytics_workspace_id = local.workspace_id

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

  lifecycle {
    prevent_destroy = true
  }
}
