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
        immediatePurgeDataOn30Days                  = true
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
