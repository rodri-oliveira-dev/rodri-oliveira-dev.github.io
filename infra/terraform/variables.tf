variable "subscription_id" {
  description = "ID da assinatura Azure que contém os recursos do backend Web Push."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.subscription_id))
    error_message = "subscription_id deve ser um UUID válido."
  }
}

variable "tenant_id" {
  description = "ID do tenant Microsoft Entra usado pela assinatura Azure."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.tenant_id))
    error_message = "tenant_id deve ser um UUID válido."
  }
}

variable "resource_group_name" {
  description = "Nome do Resource Group existente que receberá os recursos do backend Web Push."
  type        = string
  default     = "rg-portfolio-push-dev"
  nullable    = false
}

variable "location" {
  description = "Região Azure prevista para os recursos de dados do backend Web Push."
  type        = string
  default     = "brazilsouth"
  nullable    = false

  validation {
    condition     = lower(var.location) == "brazilsouth"
    error_message = "A ADR 0009 exige que a região permaneça brazilsouth."
  }
}
