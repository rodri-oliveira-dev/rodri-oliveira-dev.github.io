resource "azurerm_user_assigned_identity" "functions_runtime" {
  name                = local.runtime_identity_name
  location            = data.azurerm_resource_group.web_push.location
  resource_group_name = data.azurerm_resource_group.web_push.name
  tags                = local.common_tags
}

resource "azurerm_role_assignment" "functions_key_vault_secrets_user" {
  count = var.manage_runtime_role_assignments ? 1 : 0

  principal_id         = azurerm_user_assigned_identity.functions_runtime.principal_id
  scope                = azurerm_key_vault.vapid.id
  role_definition_name = "Key Vault Secrets User"

  description = "Permite ao runtime da Function ler o segredo VAPID; ativação exige execução IAM separada e aprovada."
}

resource "azurerm_cosmosdb_sql_role_assignment" "functions_subscriptions_contributor" {
  count = var.manage_runtime_role_assignments ? 1 : 0

  account_name        = azurerm_cosmosdb_account.notifications.name
  principal_id        = azurerm_user_assigned_identity.functions_runtime.principal_id
  resource_group_name = data.azurerm_resource_group.web_push.name
  role_definition_id  = "${azurerm_cosmosdb_account.notifications.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  scope               = "${azurerm_cosmosdb_account.notifications.id}/dbs/${azurerm_cosmosdb_sql_database.notifications.name}/colls/${azurerm_cosmosdb_sql_container.subscriptions.name}"
}

resource "azurerm_role_assignment" "functions_storage_blob_data_owner" {
  count = var.manage_runtime_role_assignments ? 1 : 0

  principal_id         = azurerm_user_assigned_identity.functions_runtime.principal_id
  scope                = azurerm_storage_account.functions.id
  role_definition_name = "Storage Blob Data Owner"
  description          = "Permite ao host da Function acessar artefatos e leases; ativação exige execução IAM separada e aprovada."
}

resource "azurerm_role_assignment" "functions_storage_queue_data_contributor" {
  count = var.manage_runtime_role_assignments ? 1 : 0

  principal_id         = azurerm_user_assigned_identity.functions_runtime.principal_id
  scope                = azurerm_storage_account.functions.id
  role_definition_name = "Storage Queue Data Contributor"
  description          = "Permite ao Queue Trigger consumir campanhas; ativação exige execução IAM separada e aprovada."
}
