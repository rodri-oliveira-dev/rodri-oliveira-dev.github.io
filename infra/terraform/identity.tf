resource "azurerm_user_assigned_identity" "functions_runtime" {
  name                = local.runtime_identity_name
  location            = data.azurerm_resource_group.web_push.location
  resource_group_name = data.azurerm_resource_group.web_push.name
  tags                = local.common_tags
}
