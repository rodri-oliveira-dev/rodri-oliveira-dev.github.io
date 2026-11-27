mock_provider "azapi" {}
mock_provider "azuread" {}
mock_provider "azurerm" {}

variables {
  subscription_id = "00000000-0000-0000-0000-000000000001"
  tenant_id       = "00000000-0000-0000-0000-000000000002"
}

run "least_privilege_oidc_contract" {
  command = plan

  assert {
    condition = (
      azuread_application_federated_identity_credential.campaign_coordinator.subject ==
      "repo:rodri-oliveira-dev@3470248/rodri-oliveira-dev.github.io@1350159615:environment:web-push-notifications-dev" &&
      azuread_application_federated_identity_credential.queue_sender.subject ==
      azuread_application_federated_identity_credential.campaign_coordinator.subject
    )
    error_message = "As credenciais federadas devem corresponder exatamente ao Environment protegido e ao repositório imutável."
  }

  assert {
    condition = (
      azurerm_role_assignment.queue_sender.scope ==
      "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/rg-portfolio-push-workload-dev/providers/Microsoft.Storage/storageAccounts/stportpushdev1350159615/queueServices/default/queues/web-push-campaigns" &&
      endswith(azurerm_role_assignment.queue_sender.role_definition_id, "c6a89b2d-59bc-44d0-9896-0f6e12d7b80a")
    )
    error_message = "A identidade de enqueue deve ter somente Storage Queue Data Message Sender na fila necessária."
  }

  assert {
    condition = (
      azapi_resource.campaign_coordinator_cosmos.body.properties.scope ==
      "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/rg-portfolio-push-workload-dev/providers/Microsoft.DocumentDB/databaseAccounts/cos-portpush-dev-1350159615/dbs/notifications/colls/subscriptions" &&
      !contains(azapi_resource.campaign_coordinator_role.body.properties.permissions[0].dataActions, "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/items/delete")
    )
    error_message = "A identidade coordenadora deve ficar limitada ao container e sem exclusão de itens Cosmos."
  }
}
