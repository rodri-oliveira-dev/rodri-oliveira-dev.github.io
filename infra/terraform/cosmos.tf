resource "azurerm_cosmosdb_account" "notifications" {
  name                = local.cosmos_account_name
  location            = data.azurerm_resource_group.web_push.location
  resource_group_name = data.azurerm_resource_group.web_push.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  access_key_metadata_writes_enabled = false
  analytical_storage_enabled         = false
  automatic_failover_enabled         = false
  free_tier_enabled                  = var.cosmos_enable_free_tier
  local_authentication_enabled       = false
  minimal_tls_version                = "Tls12"
  multiple_write_locations_enabled   = false
  public_network_access_enabled      = true

  capacity {
    total_throughput_limit = var.cosmos_total_throughput_limit
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    failover_priority = 0
    location          = data.azurerm_resource_group.web_push.location
    zone_redundant    = false
  }

  backup {
    interval_in_minutes = 240
    retention_in_hours  = 8
    storage_redundancy  = "Local"
    type                = "Periodic"
  }

  tags = local.common_tags

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = !var.cosmos_enable_free_tier || var.cosmos_total_throughput_limit <= 1000
      error_message = "A camada gratuita só pode ser modelada com limite total de até 1000 RU/s."
    }
  }
}

resource "azurerm_cosmosdb_sql_database" "notifications" {
  name                = local.subscriptions_database
  resource_group_name = data.azurerm_resource_group.web_push.name
  account_name        = azurerm_cosmosdb_account.notifications.name
  throughput          = var.cosmos_database_throughput
}

resource "azurerm_cosmosdb_sql_container" "subscriptions" {
  name                  = local.subscriptions_container
  resource_group_name   = data.azurerm_resource_group.web_push.name
  account_name          = azurerm_cosmosdb_account.notifications.name
  database_name         = azurerm_cosmosdb_sql_database.notifications.name
  partition_key_paths   = ["/partitionKey"]
  partition_key_version = 2
  default_ttl           = -1

  indexing_policy {
    indexing_mode = "consistent"

    included_path {
      path = "/*"
    }

    excluded_path {
      path = "/endpoint/?"
    }

    excluded_path {
      path = "/keys/*"
    }
  }
}
