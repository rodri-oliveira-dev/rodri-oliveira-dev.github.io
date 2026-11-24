locals {
  application_display_name = "app-portfolio-push-deploy-dev"
  github_actions_audiences = ["api://AzureADTokenExchange"]
  github_actions_issuer    = "https://token.actions.githubusercontent.com"
  main_oidc_subject        = "repo:rodri-oliveira-dev@3470248/rodri-oliveira-dev.github.io@1350159615:ref:refs/heads/main"
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

# Built-in role IDs are public constants, independent of subscription.
locals {
  reader_role_id                = "acdd72a7-3385-48ef-bd42-f606fba81ae7"
  blob_data_contributor_role_id = "ba92f5b4-2d11-453d-a403-e96b0029c9fe"
  state_storage_scope           = "${data.azurerm_resource_group.web_push.id}/providers/Microsoft.Storage/storageAccounts/strotfstatepushdev"
  state_container_scope         = "${local.state_storage_scope}/blobServices/default/containers/tfstate"

  bootstrap_rbac = {
    subscription = {
      scope    = "/subscriptions/${var.subscription_id}"
      role_ids = []
    }
    resource_group = {
      scope    = data.azurerm_resource_group.web_push.id
      role_ids = [local.reader_role_id]
    }
    storage_account = {
      scope    = local.state_storage_scope
      role_ids = []
    }
    state_container = {
      scope    = local.state_container_scope
      role_ids = [local.blob_data_contributor_role_id]
    }
  }
}

# Audit direct assignments at the four known scopes. This does not grant IAM
# permissions or enumerate group membership / management-group inheritance.
data "azurerm_role_assignments" "deployment_bootstrap" {
  for_each = local.bootstrap_rbac

  scope          = each.value.scope
  principal_id   = data.azuread_service_principal.deployment.object_id
  limit_at_scope = true

  lifecycle {
    postcondition {
      condition = toset([
        for assignment in self.role_assignments :
        lower(basename(assignment.role_definition_id))
        if lower(assignment.role_assignment_scope) == lower(each.value.scope)
      ]) == toset(each.value.role_ids)
      error_message = "RBAC direto fora da baseline de bootstrap no escopo ${each.key}. Revise as atribuições antes de prosseguir."
    }
  }
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
