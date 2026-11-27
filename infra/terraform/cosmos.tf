locals {
  # Keep the parent IDs known during plan so AzAPI preflight uses the actual
  # workload RG rather than generating a placeholder scope outside its RBAC.
  cosmos_account_id  = "${data.azurerm_resource_group.web_push.id}/providers/Microsoft.DocumentDB/databaseAccounts/${local.cosmos_account_name}"
  cosmos_database_id = "${local.cosmos_account_id}/sqlDatabases/${local.subscriptions_database}"
}

resource "azapi_resource" "cosmos_account" {
  type      = "Microsoft.DocumentDB/databaseAccounts@2024-11-15"
  parent_id = data.azurerm_resource_group.web_push.id
  name      = local.cosmos_account_name
  location  = data.azurerm_resource_group.web_push.location
  tags      = local.common_tags

  body = {
    kind = "GlobalDocumentDB"
    properties = {
      backupPolicy = {
        type = "Periodic"
        periodicModeProperties = {
          backupIntervalInMinutes        = 240
          backupRetentionIntervalInHours = 8
          backupStorageRedundancy        = "Local"
        }
      }
      capabilities                       = [{ name = "EnableServerless" }]
      consistencyPolicy                  = { defaultConsistencyLevel = "Session" }
      databaseAccountOfferType           = "Standard"
      disableKeyBasedMetadataWriteAccess = true
      disableLocalAuth                   = true
      enableAnalyticalStorage            = false
      enableAutomaticFailover            = false
      enableFreeTier                     = false
      enableMultipleWriteLocations       = false
      ipRules                            = []
      isVirtualNetworkFilterEnabled      = false
      # ARM returns the canonical display name for this single permitted region.
      locations = [{
        failoverPriority = 0
        isZoneRedundant  = false
        locationName     = "Brazil South"
      }]
      minimalTlsVersion           = "Tls12"
      networkAclBypass            = "None"
      networkAclBypassResourceIds = []
      publicNetworkAccess         = "Enabled"
      virtualNetworkRules         = []
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azapi_resource" "cosmos_database" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15"
  parent_id = local.cosmos_account_id
  name      = local.subscriptions_database
  location  = data.azurerm_resource_group.web_push.location

  # The deterministic ID no longer creates an implicit dependency.
  depends_on = [azapi_resource.cosmos_account]

  body = {
    properties = {
      options = {}
      resource = {
        id = local.subscriptions_database
      }
    }
  }
}

resource "azapi_resource" "subscriptions_container" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15"
  parent_id = local.cosmos_database_id
  name      = local.subscriptions_container
  location  = data.azurerm_resource_group.web_push.location

  depends_on = [azapi_resource.cosmos_database]

  body = {
    properties = {
      options = {}
      resource = {
        defaultTtl = -1
        id         = local.subscriptions_container
        indexingPolicy = {
          automatic    = true
          indexingMode = "consistent"
          includedPaths = [{
            path = "/*"
          }]
          excludedPaths = [
            { path = "/endpoint/?" },
            { path = "/keys/*" },
            { path = "/cancellationCapabilityHash/?" },
            { path = "/recoveryCapabilityHash/?" },
            # Cosmos adds this default exclusion in its ARM response.
            { path = "/\"_etag\"/?" },
          ]
        }
        partitionKey = {
          kind    = "Hash"
          paths   = ["/partitionKey"]
          version = 2
        }
      }
    }
  }
}
