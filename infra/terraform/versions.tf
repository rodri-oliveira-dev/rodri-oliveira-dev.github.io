terraform {
  required_version = ">= 1.15.0, < 1.18.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.14.0"
    }
  }

  backend "azurerm" {
    use_azuread_auth = true
    use_oidc         = true
  }
}
