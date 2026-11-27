output "campaign_coordinator_client_id" {
  description = "Client ID não secreto para AZURE_WEB_PUSH_COORDINATOR_CLIENT_ID no Environment protegido."
  value       = azuread_application.campaign_coordinator.client_id
}

output "queue_sender_client_id" {
  description = "Client ID não secreto para AZURE_WEB_PUSH_ENQUEUE_CLIENT_ID no Environment protegido."
  value       = azuread_application.queue_sender.client_id
}
