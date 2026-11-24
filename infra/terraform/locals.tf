locals {
  environment_short = {
    dev     = "dev"
    staging = "stg"
    prod    = "prd"
  }[var.environment]

  common_tags = {
    environment = var.environment
    managed-by  = "terraform"
    project     = "portfolio-push"
  }

  cosmos_account_name     = "cos-portpush-${var.environment}-${var.resource_name_suffix}"
  function_app_name       = "func-portpush-${var.environment}-${var.resource_name_suffix}"
  function_plan_name      = "asp-portpush-${var.environment}-fc1"
  function_storage_name   = "stportpush${local.environment_short}${var.resource_name_suffix}"
  deployment_container    = "function-releases"
  campaign_queue_name     = "web-push-campaigns"
  poison_queue_name       = "web-push-campaigns-poison"
  key_vault_name          = "kv-push-${var.environment}-${var.resource_name_suffix}"
  log_analytics_name      = "log-portfolio-push-${var.environment}"
  runtime_identity_name   = "id-portfolio-push-runtime-${var.environment}"
  subscriptions_database  = "notifications"
  subscriptions_container = "subscriptions"
}
