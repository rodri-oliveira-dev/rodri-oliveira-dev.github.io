variable "cosmos_database_throughput" {
  description = "Throughput compartilhado da base Cosmos DB em RU/s; 400 é o mínimo provisionado e limita o custo inicial."
  type        = number
  default     = 400
  nullable    = false

  validation {
    condition     = var.cosmos_database_throughput >= 400 && var.cosmos_database_throughput <= var.cosmos_total_throughput_limit && var.cosmos_database_throughput % 100 == 0
    error_message = "cosmos_database_throughput deve ser múltiplo de 100 entre 400 e cosmos_total_throughput_limit."
  }
}

variable "cosmos_enable_free_tier" {
  description = "Habilita o Free Tier somente após confirmar elegibilidade da assinatura; a opção é definida apenas na criação da conta."
  type        = bool
  default     = false
  nullable    = false
}

variable "cosmos_total_throughput_limit" {
  description = "Teto de throughput da conta Cosmos DB em RU/s para impedir expansão acidental acima do orçamento aprovado."
  type        = number
  default     = 1000
  nullable    = false

  validation {
    condition     = var.cosmos_total_throughput_limit >= 400 && var.cosmos_total_throughput_limit <= 1000 && var.cosmos_total_throughput_limit % 100 == 0
    error_message = "cosmos_total_throughput_limit deve ser múltiplo de 100 entre 400 e 1000 RU/s."
  }
}

variable "environment" {
  description = "Ambiente lógico usado em nomes e tags dos recursos."
  type        = string
  default     = "dev"
  nullable    = false

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment deve ser dev, staging ou prod."
  }
}

variable "function_instance_memory_mb" {
  description = "Memória por instância FC1 em MB."
  type        = number
  default     = 2048
  nullable    = false

  validation {
    condition     = contains([512, 2048, 4096], var.function_instance_memory_mb)
    error_message = "function_instance_memory_mb deve ser 512, 2048 ou 4096."
  }
}

variable "function_maximum_instance_count" {
  description = "Limite rígido de escala horizontal do plano Flex para conter custo e fan-out."
  type        = number
  default     = 2
  nullable    = false

  validation {
    condition     = var.function_maximum_instance_count >= 1 && var.function_maximum_instance_count <= 2
    error_message = "function_maximum_instance_count deve ficar entre 1 e 2 nesta baseline."
  }
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

variable "log_analytics_daily_quota_gb" {
  description = "Cap diário preventivo do Log Analytics em GB; pode haver pequena ultrapassagem faturável antes do bloqueio."
  type        = number
  default     = 0.1
  nullable    = false

  validation {
    condition     = var.log_analytics_daily_quota_gb >= 0.1 && var.log_analytics_daily_quota_gb <= 1
    error_message = "log_analytics_daily_quota_gb deve ficar entre 0.1 e 1 GB/dia."
  }
}

variable "log_analytics_retention_days" {
  description = "Retenção interativa do workspace; 30 dias evita retenção adicional cobrada."
  type        = number
  default     = 30
  nullable    = false

  validation {
    condition     = var.log_analytics_retention_days >= 30 && var.log_analytics_retention_days <= 31
    error_message = "log_analytics_retention_days deve ficar entre 30 e 31 dias para esta baseline de custo."
  }
}

variable "resource_group_name" {
  description = "Nome do Resource Group existente que receberá os recursos do backend Web Push."
  type        = string
  default     = "rg-portfolio-push-dev"
  nullable    = false
}

variable "resource_name_suffix" {
  description = "Sufixo público e estável para nomes Azure globalmente únicos; não deve conter credenciais ou identificadores privados."
  type        = string
  default     = "1350159615"
  nullable    = false

  validation {
    condition     = can(regex("^[a-z0-9]{4,11}$", var.resource_name_suffix))
    error_message = "resource_name_suffix deve ter de 4 a 11 caracteres minúsculos ou numéricos para preservar os limites dos nomes Azure."
  }
}

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
