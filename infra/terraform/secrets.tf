resource "azurerm_key_vault" "vapid" {
  name                = local.key_vault_name
  location            = data.azurerm_resource_group.web_push.location
  resource_group_name = data.azurerm_resource_group.web_push.name
  tenant_id           = var.tenant_id
  sku_name            = "standard"

  enabled_for_deployment          = false
  enabled_for_disk_encryption     = false
  enabled_for_template_deployment = false
  public_network_access_enabled   = true
  purge_protection_enabled        = true
  rbac_authorization_enabled      = true
  soft_delete_retention_days      = 90

  tags = local.common_tags

  lifecycle {
    prevent_destroy = true
  }
}

# O valor VAPID não é um recurso Terraform. Ele será inserido por um operador
# autorizado diretamente no Key Vault para nunca entrar no Git, plano ou State.
