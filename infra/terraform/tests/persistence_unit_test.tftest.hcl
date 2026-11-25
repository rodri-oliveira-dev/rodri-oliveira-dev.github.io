mock_provider "azurerm" {
  mock_data "azurerm_resource_group" {
    defaults = {
      id       = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-dev"
      location = "brazilsouth"
      name     = "rg-portfolio-push-dev"
    }
  }

  mock_resource "azurerm_key_vault" {
    defaults = {
      id        = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-dev/providers/Microsoft.KeyVault/vaults/kv-push-dev-1350159615"
      vault_uri = "https://kv-push-dev-1350159615.vault.azure.net/"
    }
  }

  mock_resource "azurerm_user_assigned_identity" {
    defaults = {
      id           = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-dev/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-portfolio-push-runtime-dev"
      principal_id = "11111111-1111-1111-1111-111111111111"
    }
  }

  mock_resource "azurerm_storage_account" {
    defaults = {
      id                     = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-dev/providers/Microsoft.Storage/storageAccounts/stportpushdev1350159615"
      primary_blob_endpoint  = "https://stportpushdev1350159615.blob.core.windows.net/"
      primary_queue_endpoint = "https://stportpushdev1350159615.queue.core.windows.net/"
    }
  }

  mock_resource "azurerm_function_app_flex_consumption" {
    defaults = {
      default_hostname = "func-portpush-dev-1350159615.azurewebsites.net"
      id               = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-dev/providers/Microsoft.Web/sites/func-portpush-dev-1350159615"
    }
  }
}

mock_provider "azapi" {}

variables {
  subscription_id = "00000000-0000-0000-0000-000000000000"
  tenant_id       = "00000000-0000-0000-0000-000000000000"
}

run "default_cost_and_security_baseline" {
  command = plan

  assert {
    condition     = azapi_resource.cosmos_account.body.properties.enableFreeTier == false
    error_message = "Free Tier não é compatível com Cosmos DB Serverless."
  }

  assert {
    condition     = azapi_resource.cosmos_account.body.properties.disableLocalAuth
    error_message = "Cosmos DB deve bloquear autenticação por chaves locais."
  }

  assert {
    condition     = contains([for capability in azapi_resource.cosmos_account.body.properties.capabilities : capability.name], "EnableServerless") && !can(azapi_resource.cosmos_account.body.properties.capacity) && !can(azapi_resource.cosmos_database.body.properties.options.throughput) && !can(azapi_resource.subscriptions_container.body.properties.options.throughput)
    error_message = "Serverless não pode provisionar throughput nem limite de RU/s."
  }

  assert {
    condition     = azapi_resource.subscriptions_container.body.properties.resource.defaultTtl == -1 && azapi_resource.subscriptions_container.body.properties.resource.partitionKey.paths[0] == "/partitionKey"
    error_message = "O container deve habilitar TTL por item sem expiração padrão e usar a partition key documentada."
  }

  assert {
    condition     = azurerm_key_vault.vapid.rbac_authorization_enabled && azurerm_key_vault.vapid.purge_protection_enabled
    error_message = "Key Vault deve usar RBAC e purge protection."
  }

  assert {
    condition     = azurerm_log_analytics_workspace.notifications.location == "brazilsouth" && azurerm_log_analytics_workspace.notifications.retention_in_days == 30
    error_message = "Logs devem permanecer em Brazil South com retenção inicial de 30 dias."
  }

  assert {
    condition     = azurerm_service_plan.functions.sku_name == "FC1" && azurerm_function_app_flex_consumption.notifications[0].runtime_name == "dotnet-isolated" && azurerm_function_app_flex_consumption.notifications[0].runtime_version == "10.0"
    error_message = "A Function deve usar Flex Consumption FC1 com .NET 10 isolated."
  }

  assert {
    condition     = azurerm_function_app_flex_consumption.notifications[0].maximum_instance_count == 2 && azurerm_function_app_flex_consumption.notifications[0].instance_memory_in_mb == 2048
    error_message = "A Function deve limitar escala a duas instâncias de 2048 MB."
  }

  assert {
    condition     = !azurerm_storage_account.functions.shared_access_key_enabled && azurerm_storage_container.function_releases.container_access_type == "private"
    error_message = "Storage deve bloquear Shared Key e manter artefatos privados."
  }

  assert {
    condition     = azurerm_storage_queue.campaigns.name == "web-push-campaigns" && azurerm_storage_queue.campaigns_poison.name == "web-push-campaigns-poison"
    error_message = "As filas privada e poison devem ter nomes estáveis."
  }

  assert {
    condition     = azurerm_function_app_flex_consumption.notifications[0].app_settings["CampaignQueue__credential"] == "managedidentity" && contains(keys(azurerm_function_app_flex_consumption.notifications[0].app_settings), "CampaignQueue__queueServiceUri") && !contains(keys(azurerm_function_app_flex_consumption.notifications[0].app_settings), "CampaignQueue")
    error_message = "O Queue Trigger deve usar endpoint de dados e Managed Identity, sem connection string."
  }
}

run "foundation_before_runtime_iam" {
  command = plan

  variables {
    create_function_app = false
  }

  assert {
    condition     = length(azurerm_function_app_flex_consumption.notifications) == 0 && length(azurerm_monitor_diagnostic_setting.function_app) == 0
    error_message = "Bootstrap deve criar dependências sem criar Function App ou seu diagnostic setting."
  }

  assert {
    condition     = output.function_app_name == null && output.function_app_health_url == null
    error_message = "Bootstrap não deve exportar coordenadas de deploy inexistentes."
  }
}

run "staging_names_fit_azure_limits" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition     = azurerm_key_vault.vapid.name == "kv-push-stg-1350159615" && length(azurerm_key_vault.vapid.name) <= 24
    error_message = "O nome do Key Vault de staging deve usar o ambiente abreviado e respeitar 24 caracteres."
  }
}

run "reject_suffix_that_exceeds_storage_limit" {
  command = plan

  variables {
    resource_name_suffix = "abcdefghijkl"
  }

  expect_failures = [
    var.resource_name_suffix,
  ]
}

run "reject_non_brazil_south_region" {
  command = plan

  variables {
    location = "eastus"
  }

  expect_failures = [
    var.location,
  ]
}
