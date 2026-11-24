locals {
  application_display_name = "app-portfolio-push-deploy-dev"
  github_actions_audiences = ["api://AzureADTokenExchange"]
  github_actions_issuer    = "https://token.actions.githubusercontent.com"
  main_oidc_subject        = "repo:rodri-oliveira-dev/rodri-oliveira-dev.github.io:ref:refs/heads/main"
  resource_group_name      = "rg-portfolio-push-dev"
}

data "azuread_application" "deployment" {
  display_name = local.application_display_name
}

data "azuread_service_principal" "deployment" {
  client_id = data.azuread_application.deployment.client_id
}

data "azurerm_resource_group" "web_push" {
  name = local.resource_group_name
}

data "azurerm_role_definition" "contributor" {
  name  = "Contributor"
  scope = data.azurerm_resource_group.web_push.id
}

data "azurerm_role_assignments" "deployment_on_resource_group" {
  scope          = data.azurerm_resource_group.web_push.id
  principal_id   = data.azuread_service_principal.deployment.object_id
  limit_at_scope = true
}

resource "azuread_application_federated_identity_credential" "github_main" {
  application_id = data.azuread_application.deployment.id
  audiences      = local.github_actions_audiences
  display_name   = var.main_federated_credential_display_name
  issuer         = local.github_actions_issuer
  subject        = local.main_oidc_subject

  lifecycle {
    prevent_destroy = true
  }
}

import {
  to = azuread_application_federated_identity_credential.github_main
  id = var.main_federated_credential_import_id
}

check "temporary_contributor_assignment" {
  assert {
    condition = anytrue([
      for assignment in data.azurerm_role_assignments.deployment_on_resource_group.role_assignments :
      lower(assignment.role_definition_id) == lower(data.azurerm_role_definition.contributor.id)
    ])
    error_message = "A atribuição Contributor temporária da aplicação no Resource Group não foi encontrada no escopo exato."
  }
}
