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

resource "azurerm_function_app_flex_consumption" "notifications" {
  count = var.create_function_app ? 1 : 0

  name                = local.function_app_name
  resource_group_name = data.azurerm_resource_group.web_push.name
  location            = data.azurerm_resource_group.web_push.location
  service_plan_id     = azurerm_service_plan.functions.id

  storage_container_type                         = "blobContainer"
  storage_container_endpoint                     = "${azurerm_storage_account.functions.primary_blob_endpoint}${azurerm_storage_container.function_releases.name}"
  storage_authentication_type                    = "UserAssignedIdentity"
  storage_user_assigned_identity_id              = azurerm_user_assigned_identity.functions_runtime.id
  runtime_name                                   = "dotnet-isolated"
  runtime_version                                = "10.0"
  instance_memory_in_mb                          = var.function_instance_memory_mb
  maximum_instance_count                         = var.function_maximum_instance_count
  webdeploy_publish_basic_authentication_enabled = false
  https_only                                     = true
  public_network_access_enabled                  = true

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.functions_runtime.id]
  }

  app_settings = {
    AzureWebJobsStorage__accountName         = azurerm_storage_account.functions.name
    AzureWebJobsStorage__credential          = "managedidentity"
    AzureWebJobsStorage__clientId            = azurerm_user_assigned_identity.functions_runtime.client_id
    CampaignQueue__queueServiceUri           = azurerm_storage_account.functions.primary_queue_endpoint
    CampaignQueue__credential                = "managedidentity"
    CampaignQueue__clientId                  = azurerm_user_assigned_identity.functions_runtime.client_id
    Notifications__CosmosEndpoint            = "https://${local.cosmos_account_name}.documents.azure.com:443/"
    Notifications__CosmosDatabaseName        = local.subscriptions_database
    Notifications__CosmosContainerName       = local.subscriptions_container
    Notifications__KeyVaultUri               = azurerm_key_vault.vapid.vault_uri
    Notifications__DeploymentEnvironment     = var.environment
    Notifications__VapidSubject              = "https://rodri-oliveira-dev.github.io/"
    Notifications__VapidPublicKeySecretName  = "vapid-public-key"
    Notifications__VapidPrivateKeySecretName = "vapid-private-key"
    Notifications__PushTimeToLiveSeconds     = "86400"
    Notifications__RequestTimeoutSeconds     = "15"
    AZURE_CLIENT_ID                          = azurerm_user_assigned_identity.functions_runtime.client_id
  }

  lifecycle {
    prevent_destroy = true
  }

  site_config {
    health_check_path                 = "/api/health"
    health_check_eviction_time_in_min = 2
    http2_enabled                     = true
    minimum_tls_version               = "1.2"
  }

  tags = local.common_tags
}
