mock_provider "azurerm" {
  mock_data "azurerm_resource_group" {
    defaults = {
      id       = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-dev"
      location = "brazilsouth"
      name     = "rg-portfolio-push-dev"
    }
  }

  mock_resource "azurerm_cosmosdb_account" {
    defaults = {
      endpoint = "https://cos-portpush-dev-1350159615.documents.azure.com:443/"
      id       = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-portfolio-push-dev/providers/Microsoft.DocumentDB/databaseAccounts/cos-portpush-dev-1350159615"
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
}

variables {
  subscription_id = "00000000-0000-0000-0000-000000000000"
  tenant_id       = "00000000-0000-0000-0000-000000000000"
}

run "default_cost_and_security_baseline" {
  command = plan

  assert {
    condition     = azurerm_cosmosdb_account.notifications.free_tier_enabled == false
    error_message = "Free Tier deve permanecer desabilitado sem confirmação de elegibilidade."
  }

  assert {
    condition     = !azurerm_cosmosdb_account.notifications.local_authentication_enabled
    error_message = "Cosmos DB deve bloquear autenticação por chaves locais."
  }

  assert {
    condition     = azurerm_cosmosdb_sql_database.notifications.throughput == 400
    error_message = "A baseline deve limitar o banco compartilhado a 400 RU/s."
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
    condition     = length(azurerm_role_assignment.functions_key_vault_secrets_user) == 0 && length(azurerm_cosmosdb_sql_role_assignment.functions_subscriptions_contributor) == 0
    error_message = "Atribuições IAM não podem ser aplicadas pelo fluxo padrão."
  }
}

run "eligible_free_tier_and_separate_runtime_iam" {
  command = plan

  variables {
    cosmos_enable_free_tier         = true
    manage_runtime_role_assignments = true
  }

  assert {
    condition     = azurerm_cosmosdb_account.notifications.free_tier_enabled
    error_message = "Free Tier deve ser habilitado quando explicitamente confirmado."
  }

  assert {
    condition     = length(azurerm_role_assignment.functions_key_vault_secrets_user) == 1 && length(azurerm_cosmosdb_sql_role_assignment.functions_subscriptions_contributor) == 1
    error_message = "A execução IAM aprovada deve modelar somente os acessos de runtime necessários."
  }
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
