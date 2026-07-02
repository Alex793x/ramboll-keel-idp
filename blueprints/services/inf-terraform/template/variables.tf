variable "environment" {
  description = "Deployment environment (matches the platform branch model)."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "location" {
  description = "Azure region for the stack."
  type        = string
  default     = "westeurope"
}

variable "tags" {
  description = "Extra resource tags merged onto the platform defaults."
  type        = map(string)
  default     = {}
}
