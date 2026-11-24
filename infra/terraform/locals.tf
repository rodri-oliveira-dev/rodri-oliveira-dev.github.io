locals {
  common_tags = {
    environment = var.environment
    managed-by  = "terraform"
    project     = "portfolio-push"
  }

  cosmos_account_name     = "cos-portpush-${var.environment}-${var.resource_name_suffix}"
  key_vault_name          = "kv-push-${var.environment}-${var.resource_name_suffix}"
  log_analytics_name      = "log-portfolio-push-${var.environment}"
  runtime_identity_name   = "id-portfolio-push-runtime-${var.environment}"
  subscriptions_database  = "notifications"
  subscriptions_container = "subscriptions"
}
