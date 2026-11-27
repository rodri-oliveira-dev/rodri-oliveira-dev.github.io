resource "azurerm_storage_account" "functions" {
  name                             = local.function_storage_name
  resource_group_name              = data.azurerm_resource_group.web_push.name
  location                         = data.azurerm_resource_group.web_push.location
  account_tier                     = "Standard"
  account_replication_type         = "LRS"
  account_kind                     = "StorageV2"
  access_tier                      = "Hot"
  https_traffic_only_enabled       = true
  min_tls_version                  = "TLS1_2"
  shared_access_key_enabled        = false
  default_to_oauth_authentication  = true
  public_network_access            = "Enabled"
  allow_nested_items_to_be_public  = false
  cross_tenant_replication_enabled = false
  local_user_enabled               = false

  # The storage account has its own principal; it receives no RBAC assignments.
  # The Function continues to use its dedicated user-assigned runtime identity.
  identity {
    type = "SystemAssigned"
  }

  blob_properties {
    versioning_enabled = true

    container_delete_retention_policy {
      days = 7
    }

    delete_retention_policy {
      days = 7
    }
  }

  tags = local.common_tags
}

resource "azurerm_storage_container" "function_releases" {
  name                  = local.deployment_container
  storage_account_id    = azurerm_storage_account.functions.id
  container_access_type = "private"
}

resource "azurerm_storage_queue" "campaigns" {
  name               = local.campaign_queue_name
  storage_account_id = azurerm_storage_account.functions.id
}

resource "azurerm_storage_queue" "campaigns_poison" {
  name               = local.poison_queue_name
  storage_account_id = azurerm_storage_account.functions.id
}

resource "azurerm_service_plan" "functions" {
  name                = local.function_plan_name
  resource_group_name = data.azurerm_resource_group.web_push.name
  location            = data.azurerm_resource_group.web_push.location
  os_type             = "Linux"
  sku_name            = "FC1"

  tags = local.common_tags
}

locals {
  # Apenas configuração não secreta; valores VAPID ficam exclusivamente no Key Vault.
  function_app_settings = {
    AzureWebJobsStorage__accountName                    = azurerm_storage_account.functions.name
    AzureWebJobsStorage__credential                     = "managedidentity"
    AzureWebJobsStorage__clientId                       = azurerm_user_assigned_identity.functions_runtime.client_id
    CampaignQueue__queueServiceUri                      = azurerm_storage_account.functions.primary_queue_endpoint
    CampaignQueue__credential                           = "managedidentity"
    CampaignQueue__clientId                             = azurerm_user_assigned_identity.functions_runtime.client_id
    "AzureWebJobs.ProcessWebPushCampaign.Disabled"      = "true"
    "AzureWebJobs.register-subscription.Disabled"       = "true"
    "AzureWebJobs.revoke-subscription.Disabled"         = "true"
    Notifications__CosmosEndpoint                       = "https://${local.cosmos_account_name}.documents.azure.com:443/"
    Notifications__CosmosDatabaseName                   = local.subscriptions_database
    Notifications__CosmosContainerName                  = local.subscriptions_container
    Notifications__SubscriptionRecoveryEpoch            = var.subscription_recovery_epoch
    Notifications__KeyVaultUri                          = azurerm_key_vault.vapid.vault_uri
    Notifications__DeploymentEnvironment                = var.environment
    Notifications__VapidSubject                         = "https://rodri-oliveira-dev.github.io/"
    Notifications__VapidPublicKeySecretName             = "vapid-public-key"
    Notifications__VapidPrivateKeySecretName            = "vapid-private-key"
    Notifications__PushTimeToLiveSeconds                = "86400"
    Notifications__RequestTimeoutSeconds                = "15"
    Notifications__AllowedOrigin                        = "https://rodri-oliveira-dev.github.io"
    Notifications__MaximumRequestBodyBytes              = "8192"
    Notifications__MaximumConcurrentRequestsPerInstance = "8"
    AZURE_CLIENT_ID                                     = azurerm_user_assigned_identity.functions_runtime.client_id
  }

  function_service_plan_id_segments = split("/", azurerm_service_plan.functions.id)
}

resource "azapi_resource" "function_app" {
  count = var.create_function_app ? 1 : 0

  type      = "Microsoft.Web/sites@2024-11-01"
  parent_id = data.azurerm_resource_group.web_push.id
  name      = local.function_app_name
  location  = data.azurerm_resource_group.web_push.location
  tags      = local.common_tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.functions_runtime.id]
  }

  # A saída padrão já está desabilitada no provider. Não exportar a configuração.
  response_export_values = ["properties.defaultHostName"]

  body = {
    kind = "functionapp,linux"
    properties = {
      # O GET do Microsoft.Web normaliza somente o segmento do tipo para
      # `serverfarms`; o provider AzureRM expõe `serverFarms`. Preserve os
      # demais segmentos e normalize essa diferença para evitar update eterno.
      serverFarmId = join("/", [
        for index, segment in local.function_service_plan_id_segments :
        segment == "serverFarms" && try(local.function_service_plan_id_segments[index - 1] == "Microsoft.Web", false) ? "serverfarms" : segment
      ])
      enabled             = true
      httpsOnly           = true
      publicNetworkAccess = "Enabled"
      functionAppConfig = {
        deployment = {
          storage = {
            type  = "blobContainer"
            value = "${azurerm_storage_account.functions.primary_blob_endpoint}${azurerm_storage_container.function_releases.name}"
            authentication = {
              type                           = "UserAssignedIdentity"
              userAssignedIdentityResourceId = azurerm_user_assigned_identity.functions_runtime.id
            }
          }
        }
        runtime = {
          name    = "dotnet-isolated"
          version = "10.0"
        }
        scaleAndConcurrency = {
          instanceMemoryMB     = var.function_instance_memory_mb
          maximumInstanceCount = var.function_maximum_instance_count
          alwaysReady          = []
        }
      }
      siteConfig = {
        http20Enabled = true
        appSettings = [
          for name, value in local.function_app_settings : {
            name  = name
            value = value
          }
        ]
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Flex persiste TLS no filho config/web, mas o GET do site não devolve esse
# campo. Gerenciá-lo no recurso correto evita update perpétuo do site e inclui
# o endpoint SCM usado pelo OneDeploy, sem habilitar credenciais básicas.
resource "azapi_update_resource" "function_tls_config" {
  count = var.create_function_app ? 1 : 0

  type        = "Microsoft.Web/sites/config@2024-11-01"
  resource_id = "${azapi_resource.function_app[0].id}/config/web"
  locks       = [azapi_resource.function_app[0].id]

  body = {
    properties = {
      minTlsVersion    = "1.2"
      scmMinTlsVersion = "1.2"
    }
  }
}

# O RP pode materializar estas políticas junto com o site. Atualizar o recurso
# existente, sem import ou DELETE, em vez de tentar criar um filho já existente.
# A disponibilidade de ambos os endpoints no Flex precisa de validação operacional.
resource "azapi_update_resource" "function_publishing_policy" {
  for_each = var.create_function_app ? toset(["ftp", "scm"]) : toset([])

  type        = "Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01"
  resource_id = "${azapi_resource.function_app[0].id}/basicPublishingCredentialsPolicies/${each.key}"
  locks       = [azapi_resource.function_app[0].id]

  body = {
    properties = {
      allow = false
    }
  }
}
