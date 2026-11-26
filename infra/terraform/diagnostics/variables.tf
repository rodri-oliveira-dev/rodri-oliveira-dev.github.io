variable "subscription_id" {
  description = "ID Azure do ambiente dev."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.subscription_id))
    error_message = "subscription_id deve ser um UUID válido."
  }
}

variable "tenant_id" {
  description = "ID Azure do ambiente dev."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.tenant_id))
    error_message = "tenant_id deve ser um UUID válido."
  }
}

variable "include_function" {
  description = "True somente após criar a Function App; manter true nas execuções seguintes."
  type        = bool
  default     = false
  nullable    = false
}
