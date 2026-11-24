provider "azurerm" {
  features {}

  subscription_id                 = var.subscription_id
  storage_use_azuread             = true
  tenant_id                       = var.tenant_id
  resource_provider_registrations = "none"
}
