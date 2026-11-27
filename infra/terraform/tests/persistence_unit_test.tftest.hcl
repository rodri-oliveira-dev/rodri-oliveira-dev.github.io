mock_provider "azurerm" {
  mock_data "azurerm_resource_group" {
    defaults = {
      id       = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-workload-dev"
      location = "brazilsouth"
      name     = "rg-portfolio-push-workload-dev"
    }
  }

  mock_resource "azurerm_key_vault" {
    defaults = {
      id        = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-workload-dev/providers/Microsoft.KeyVault/vaults/kv-push-dev-1350159615"
      vault_uri = "https://kv-push-dev-1350159615.vault.azure.net/"
    }
  }

  mock_resource "azurerm_user_assigned_identity" {
    defaults = {
      id           = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-workload-dev/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-portfolio-push-runtime-dev"
      principal_id = "11111111-1111-1111-1111-111111111111"
    }
  }

  mock_resource "azurerm_storage_account" {
    defaults = {
      id                     = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-workload-dev/providers/Microsoft.Storage/storageAccounts/stportpushdev1350159615"
      primary_blob_endpoint  = "https://stportpushdev1350159615.blob.core.windows.net/"
      primary_queue_endpoint = "https://stportpushdev1350159615.queue.core.windows.net/"
    }
  }

  mock_resource "azurerm_service_plan" {
    override_during = plan

    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/serverFarms/providers/Microsoft.Web/serverFarms/asp-portfolio-push-dev"
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
    condition     = azapi_resource.cosmos_database.parent_id == "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-workload-dev/providers/Microsoft.DocumentDB/databaseAccounts/cos-portpush-dev-1350159615"
    error_message = "O parent ID do banco deve ser conhecido no plan e apontar para a conta no RG real, sem placeholder."
  }

  assert {
    condition     = azapi_resource.subscriptions_container.parent_id == "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-workload-dev/providers/Microsoft.DocumentDB/databaseAccounts/cos-portpush-dev-1350159615/sqlDatabases/notifications"
    error_message = "O parent ID do container deve ser conhecido no plan e apontar para o banco no RG real."
  }

  assert {
    condition     = azapi_resource.cosmos_account.location == "brazilsouth" && length(azapi_resource.cosmos_account.body.properties.locations) == 1 && azapi_resource.cosmos_account.body.properties.locations[0].locationName == "Brazil South" && azapi_resource.cosmos_account.body.properties.locations[0].failoverPriority == 0 && !azapi_resource.cosmos_account.body.properties.locations[0].isZoneRedundant
    error_message = "Cosmos deve preservar Brazil South, uma região sem redundância zonal e o nome canônico retornado pelo ARM."
  }

  assert {
    condition     = jsonencode([for item in azapi_resource.subscriptions_container.body.properties.resource.indexingPolicy.excludedPaths : item.path]) == jsonencode(["/endpoint/?", "/keys/*", "/cancellationCapabilityHash/?", "/recoveryCapabilityHash/?", "/\"_etag\"/?"])
    error_message = "As exclusões devem preservar os paths sensíveis e explicitar a exclusão padrão de _etag na ordem retornada pelo ARM."
  }

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
    condition     = azapi_resource.log_analytics_workspace.location == "brazilsouth" && azapi_resource.log_analytics_workspace.body.properties.retentionInDays == 30 && azapi_resource.log_analytics_workspace.body.properties.features.immediatePurgeDataOn30Days && azapi_resource.log_analytics_workspace.body.properties.workspaceCapping.dailyQuotaGb == 0.1
    error_message = "Logs devem permanecer em Brazil South com retenção inicial de 30 dias e quota diária de 0,1 GB."
  }

  assert {
    condition     = azapi_resource.log_analytics_workspace.body.properties.features.disableLocalAuth && azapi_resource.log_analytics_workspace.body.properties.features.enableLogAccessUsingOnlyResourcePermissions
    error_message = "Log Analytics deve bloquear autenticação local e limitar consultas às permissões do recurso."
  }

  assert {
    condition     = local.function_app_settings["Notifications__SubscriptionRecoveryEpoch"] == "baseline-2026-11-26"
    error_message = "A Function deve exigir uma epoch de recuperacao externa ao backup do Cosmos."
  }

  assert {
    condition     = azurerm_service_plan.functions.sku_name == "FC1" && azapi_resource.function_app[0].body.properties.functionAppConfig.runtime.name == "dotnet-isolated" && azapi_resource.function_app[0].body.properties.functionAppConfig.runtime.version == "10.0"
    error_message = "A Function deve usar Flex Consumption FC1 com .NET 10 isolated."
  }

  assert {
    condition     = azapi_resource.function_app[0].body.properties.serverFarmId == "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/serverFarms/providers/Microsoft.Web/serverfarms/asp-portfolio-push-dev"
    error_message = "O serverFarmId deve normalizar apenas o tipo posterior a Microsoft.Web e preservar os demais segmentos."
  }

  assert {
    condition     = azapi_resource.function_app[0].body.properties.functionAppConfig.scaleAndConcurrency.maximumInstanceCount == 2 && azapi_resource.function_app[0].body.properties.functionAppConfig.scaleAndConcurrency.instanceMemoryMB == 2048
    error_message = "A Function deve limitar escala a duas instâncias de 2048 MB."
  }

  assert {
    condition     = azurerm_storage_account.functions.identity[0].type == "SystemAssigned" && azapi_resource.function_app[0].identity[0].type == "UserAssigned"
    error_message = "Storage deve ter identidade própria; a Function deve preservar sua identidade de runtime dedicada."
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
    condition     = local.function_app_settings["CampaignQueue__credential"] == "managedidentity" && contains(keys(local.function_app_settings), "CampaignQueue__queueServiceUri") && !contains(keys(local.function_app_settings), "CampaignQueue")
    error_message = "O Queue Trigger deve usar endpoint de dados e Managed Identity, sem connection string."
  }

  assert {
    condition     = local.function_app_settings["AzureWebJobs.ProcessWebPushCampaign.Disabled"] == "true"
    error_message = "O primeiro deploy deve manter o processamento de campanhas desabilitado até o gate de ativação da issue #150."
  }

  assert {
    condition     = local.function_app_settings["AzureWebJobs.register-subscription.Disabled"] == "true" && local.function_app_settings["AzureWebJobs.revoke-subscription.Disabled"] == "true"
    error_message = "Registro e revogação devem permanecer desabilitados até os gates humanos de piloto e produção."
  }

  assert {
    condition     = azapi_resource.function_app[0].body.properties.httpsOnly && azapi_resource.function_app[0].body.properties.siteConfig.http20Enabled
    error_message = "A Function deve exigir HTTPS e preservar HTTP/2."
  }

  assert {
    condition     = length(azapi_update_resource.function_tls_config) == 1 && azapi_update_resource.function_tls_config[0].body.properties.minTlsVersion == "1.2" && azapi_update_resource.function_tls_config[0].body.properties.scmMinTlsVersion == "1.2"
    error_message = "Os endpoints principal e SCM devem exigir TLS 1.2 pelo recurso config/web do Flex."
  }

  assert {
    condition     = azapi_resource.function_app[0].body.properties.functionAppConfig.deployment.storage.authentication.type == "UserAssignedIdentity" && length(azapi_resource.function_app[0].body.properties.functionAppConfig.scaleAndConcurrency.alwaysReady) == 0
    error_message = "O Storage de deploy deve usar identidade gerenciada e não haver Always Ready."
  }

  assert {
    condition     = length(azapi_update_resource.function_publishing_policy) == 2 && !azapi_update_resource.function_publishing_policy["scm"].body.properties.allow && !azapi_update_resource.function_publishing_policy["ftp"].body.properties.allow
    error_message = "SCM e FTP não podem permitir autenticação básica."
  }

  assert {
    condition     = length(azapi_resource.function_app[0].response_export_values) == 1 && contains(azapi_resource.function_app[0].response_export_values, "properties.defaultHostName")
    error_message = "A Function deve exportar somente o hostname público."
  }
}

run "foundation_before_runtime_iam" {
  command = plan

  variables {
    create_function_app = false
  }

  assert {
    condition     = azapi_resource.cosmos_database.parent_id == "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-workload-dev/providers/Microsoft.DocumentDB/databaseAccounts/cos-portpush-dev-1350159615"
    error_message = "O parent ID do banco deve ser conhecido no plan e apontar para a conta no RG real, sem placeholder."
  }

  assert {
    condition     = azapi_resource.subscriptions_container.parent_id == "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-workload-dev/providers/Microsoft.DocumentDB/databaseAccounts/cos-portpush-dev-1350159615/sqlDatabases/notifications"
    error_message = "O parent ID do container deve ser conhecido no plan e apontar para o banco no RG real."
  }

  assert {
    condition     = length(azapi_resource.function_app) == 0 && length(azapi_update_resource.function_tls_config) == 0 && length(azapi_update_resource.function_publishing_policy) == 0
    error_message = "Bootstrap deve criar dependências sem criar Function App."
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
    condition     = azapi_resource.cosmos_database.parent_id == "${data.azurerm_resource_group.web_push.id}/providers/Microsoft.DocumentDB/databaseAccounts/cos-portpush-staging-1350159615" && azapi_resource.subscriptions_container.parent_id == "${data.azurerm_resource_group.web_push.id}/providers/Microsoft.DocumentDB/databaseAccounts/cos-portpush-staging-1350159615/sqlDatabases/notifications"
    error_message = "Os parent IDs do Cosmos devem acompanhar o nome de conta derivado do ambiente."
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

run "reject_state_resource_group_as_workload" {
  command = plan

  variables {
    resource_group_name = "rg-portfolio-push-dev"
  }

  expect_failures = [
    var.resource_group_name,
  ]
}
