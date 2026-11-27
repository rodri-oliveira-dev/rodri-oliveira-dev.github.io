variable "subscription_id" {
  description = "ID da assinatura Azure que contém o workload Web Push."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.subscription_id))
    error_message = "subscription_id deve ser um UUID válido."
  }
}

variable "tenant_id" {
  description = "ID do tenant Microsoft Entra usado pelas identidades OIDC."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.tenant_id))
    error_message = "tenant_id deve ser um UUID válido."
  }
}
