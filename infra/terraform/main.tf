data "azurerm_resource_group" "web_push" {
  name = var.resource_group_name

  lifecycle {
    postcondition {
      condition     = lower(self.location) == lower(var.location)
      error_message = "O Resource Group existente deve estar na região configurada em location."
    }
  }
}
