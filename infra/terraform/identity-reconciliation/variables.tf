variable "main_federated_credential_display_name" {
  description = "Nome imutável da credencial federada existente para a branch main, confirmado no Entra antes do import."
  type        = string
  nullable    = false
}

variable "main_federated_credential_import_id" {
  description = "ID de import da credencial existente no formato <application-object-id>/federatedIdentityCredential/<credential-id>. Fornecer somente fora do repositório."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}/federatedIdentityCredential/[0-9a-fA-F-]{36}$", var.main_federated_credential_import_id))
    error_message = "main_federated_credential_import_id deve usar o formato de import do provider azuread."
  }
}

variable "subscription_id" {
  description = "ID da assinatura Azure que contém o Resource Group do backend Web Push."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.subscription_id))
    error_message = "subscription_id deve ser um UUID válido."
  }
}

variable "tenant_id" {
  description = "ID do tenant Microsoft Entra da aplicação de implantação existente."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.tenant_id))
    error_message = "tenant_id deve ser um UUID válido."
  }
}

variable "workload_provisioner_role_id" {
  description = "UUID da Custom Role revisada e atribuída ao RG do workload; null antes da concessão. Não cria atribuições."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.workload_provisioner_role_id == null ? true : can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.workload_provisioner_role_id))
    error_message = "Informe o UUID da Custom Role aprovada ou null antes da concessão."
  }
}
