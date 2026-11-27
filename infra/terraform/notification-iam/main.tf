locals {
  environment_name         = "web-push-notifications-dev"
  github_actions_audiences = ["api://AzureADTokenExchange"]
  github_actions_issuer    = "https://token.actions.githubusercontent.com"
  github_actions_subject   = "repo:rodri-oliveira-dev@3470248/rodri-oliveira-dev.github.io@1350159615:environment:${local.environment_name}"
  resource_group_id        = "/subscriptions/${var.subscription_id}/resourceGroups/rg-portfolio-push-workload-dev"
  cosmos_account_id        = "${local.resource_group_id}/providers/Microsoft.DocumentDB/databaseAccounts/cos-portpush-dev-1350159615"
  cosmos_container_scope   = "${local.cosmos_account_id}/dbs/notifications/colls/subscriptions"
  campaign_queue_scope     = "${local.resource_group_id}/providers/Microsoft.Storage/storageAccounts/stportpushdev1350159615/queueServices/default/queues/web-push-campaigns"
  queue_sender_role_id     = "c6a89b2d-59bc-44d0-9896-0f6e12d7b80a"
}

resource "azuread_application" "campaign_coordinator" {
  display_name            = "app-portfolio-push-campaign-coordinator-dev"
  prevent_duplicate_names = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "azuread_service_principal" "campaign_coordinator" {
  client_id = azuread_application.campaign_coordinator.client_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "azuread_application_federated_identity_credential" "campaign_coordinator" {
  application_id = azuread_application.campaign_coordinator.id
  audiences      = local.github_actions_audiences
  display_name   = "github-web-push-campaigns-dev"
  issuer         = local.github_actions_issuer
  subject        = local.github_actions_subject
}

resource "azapi_resource" "campaign_coordinator_role" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlRoleDefinitions@2024-11-15"
  parent_id = local.cosmos_account_id
  name      = uuidv5("url", "${local.cosmos_container_scope}|campaign-coordinator")

  body = {
    properties = {
      assignableScopes = [local.cosmos_container_scope]
      permissions = [{
        dataActions = [
          "Microsoft.DocumentDB/databaseAccounts/readMetadata",
          "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/items/create",
          "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/items/read",
          "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/items/replace",
          "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/executeQuery",
          "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/readChangeFeed",
        ]
      }]
      roleName = "Portfolio campaign coordinator"
      type     = "CustomRole"
    }
  }
}

resource "azapi_resource" "campaign_coordinator_cosmos" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15"
  parent_id = local.cosmos_account_id
  name      = uuidv5("url", "${local.cosmos_container_scope}|${azuread_service_principal.campaign_coordinator.object_id}|data-contributor")

  body = {
    properties = {
      principalId      = azuread_service_principal.campaign_coordinator.object_id
      roleDefinitionId = azapi_resource.campaign_coordinator_role.id
      scope            = local.cosmos_container_scope
    }
  }
}

resource "azuread_application" "queue_sender" {
  display_name            = "app-portfolio-push-queue-sender-dev"
  prevent_duplicate_names = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "azuread_service_principal" "queue_sender" {
  client_id = azuread_application.queue_sender.client_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "azuread_application_federated_identity_credential" "queue_sender" {
  application_id = azuread_application.queue_sender.id
  audiences      = local.github_actions_audiences
  display_name   = "github-web-push-enqueue-dev"
  issuer         = local.github_actions_issuer
  subject        = local.github_actions_subject
}

resource "azurerm_role_assignment" "queue_sender" {
  principal_id       = azuread_service_principal.queue_sender.object_id
  scope              = local.campaign_queue_scope
  role_definition_id = "/subscriptions/${var.subscription_id}/providers/Microsoft.Authorization/roleDefinitions/${local.queue_sender_role_id}"
  description        = "Permite somente adicionar IDs de campanha à fila Web Push privada."
}
