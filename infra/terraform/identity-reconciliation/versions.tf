terraform {
  required_version = ">= 1.15.0, < 1.18.0"

  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.10.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.14.0"
    }
  }

  backend "azurerm" {
    use_azuread_auth = true
  }
}
