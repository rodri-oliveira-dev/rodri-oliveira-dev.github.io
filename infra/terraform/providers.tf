provider "azapi" {
  disable_default_output = true
  enable_preflight       = true
  subscription_id        = var.subscription_id
  tenant_id              = var.tenant_id
}

provider "azurerm" {
  features {}

  subscription_id                 = var.subscription_id
  storage_use_azuread             = true
  tenant_id                       = var.tenant_id
  resource_provider_registrations = "none"
}
