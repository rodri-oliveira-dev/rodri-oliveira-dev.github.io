variable "cosmos_account_name" {
  description = "Nome da conta Cosmos DB existente, sem ler chaves de conta."
  type        = string
  default     = "cos-portpush-dev-1350159615"
  nullable    = false
}

variable "cosmos_container_name" {
  description = "Nome do container Cosmos DB ao qual o runtime terá acesso."
  type        = string
  default     = "subscriptions"
  nullable    = false
}

variable "cosmos_database_name" {
  description = "Nome do banco Cosmos DB que contém as inscrições."
  type        = string
  default     = "notifications"
  nullable    = false
}

variable "key_vault_name" {
  description = "Nome do Key Vault existente que contém os segredos VAPID."
  type        = string
  default     = "kv-push-dev-1350159615"
  nullable    = false
}

variable "resource_group_name" {
  description = "Resource Group existente do backend Web Push."
  type        = string
  default     = "rg-portfolio-push-dev"
  nullable    = false
}

variable "runtime_identity_name" {
  description = "Nome da identidade gerenciada existente da Function App."
  type        = string
  default     = "id-portfolio-push-runtime-dev"
  nullable    = false
}

variable "storage_account_name" {
  description = "Nome da conta Storage existente usada pela Function App."
  type        = string
  default     = "stportpushdev1350159615"
  nullable    = false
}

variable "subscription_id" {
  description = "ID da assinatura Azure que contém o workload."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.subscription_id))
    error_message = "subscription_id deve ser um UUID válido."
  }
}

variable "tenant_id" {
  description = "ID do tenant Microsoft Entra usado pela assinatura Azure."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.tenant_id))
    error_message = "tenant_id deve ser um UUID válido."
  }
}
