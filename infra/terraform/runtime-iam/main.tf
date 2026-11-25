data "azurerm_user_assigned_identity" "functions_runtime" {
  name                = var.runtime_identity_name
  resource_group_name = var.resource_group_name
}

locals {
  resource_group_id = "/subscriptions/${var.subscription_id}/resourceGroups/${var.resource_group_name}"
  cosmos_account_id = "${local.resource_group_id}/providers/Microsoft.DocumentDB/databaseAccounts/${var.cosmos_account_name}"
  cosmos_scope      = "${local.cosmos_account_id}/dbs/${var.cosmos_database_name}/colls/${var.cosmos_container_name}"
  key_vault_id      = "${local.resource_group_id}/providers/Microsoft.KeyVault/vaults/${var.key_vault_name}"
  storage_id        = "${local.resource_group_id}/providers/Microsoft.Storage/storageAccounts/${var.storage_account_name}"
}

resource "azurerm_role_assignment" "functions_key_vault_secrets_user" {
  principal_id         = data.azurerm_user_assigned_identity.functions_runtime.principal_id
  scope                = local.key_vault_id
  role_definition_name = "Key Vault Secrets User"
  description          = "Permite ao runtime da Function ler somente os segredos VAPID no vault dedicado."
}

resource "azapi_resource" "functions_subscriptions_contributor" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15"
  parent_id = local.cosmos_account_id
  name      = uuidv5("url", "${local.cosmos_scope}|${data.azurerm_user_assigned_identity.functions_runtime.principal_id}|data-contributor")

  body = {
    properties = {
      principalId      = data.azurerm_user_assigned_identity.functions_runtime.principal_id
      roleDefinitionId = "${local.cosmos_account_id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
      scope            = local.cosmos_scope
    }
  }
}

resource "azurerm_role_assignment" "functions_storage_blob_data_owner" {
  principal_id         = data.azurerm_user_assigned_identity.functions_runtime.principal_id
  scope                = local.storage_id
  role_definition_name = "Storage Blob Data Owner"
  description          = "Permite ao host da Function acessar artefatos e leases na conta dedicada."
}

resource "azurerm_role_assignment" "functions_storage_queue_data_contributor" {
  principal_id         = data.azurerm_user_assigned_identity.functions_runtime.principal_id
  scope                = local.storage_id
  role_definition_name = "Storage Queue Data Contributor"
  description          = "Permite ao Queue Trigger consumir e continuar campanhas na fila dedicada."
}
