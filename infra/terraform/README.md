# Terraform do backend Web Push na Azure

Esta pasta contém apenas a base de infraestrutura definida pela [ADR 0009](../../docs/adr/0009-adotar-azure-para-web-push-por-custo.md). Ela referencia o Resource Group existente `rg-portfolio-push-dev`, valida a região `brazilsouth` e prepara o state remoto no Azure Blob Storage. Nenhum Azure Functions, Cosmos DB ou outro workload é modelado nesta etapa.

## Versões e autenticação

- Terraform CLI `>= 1.15.0, < 1.18.0`; o CI usa exatamente `1.17.2`.
- Provider `hashicorp/azurerm ~> 5.14.0`; o `.terraform.lock.hcl` versionado fixa a seleção e seus checksums.
- Provider e backend usam Microsoft Entra. No GitHub Actions, a autenticação prevista é OIDC, sem client secret nem chave compartilhada do Storage Account.

Os identificadores da assinatura e do tenant não são segredos, mas variam por ambiente. Forneça-os por um `terraform.tfvars` local ignorado pelo Git ou pelas variáveis de ambiente `TF_VAR_subscription_id` e `TF_VAR_tenant_id`. Credenciais devem permanecer fora de arquivos Terraform, planos, logs e commits.

## Bootstrap manual do state remoto

O backend precisa existir antes de `terraform init` e, por isso, não é criado por esta configuração. Um operador autenticado deve criá-lo manualmente ou reutilizar recursos já aprovados:

```bash
az login --tenant <tenant-id>
az account set --subscription <subscription-id>

az group create \
  --name <resource-group-do-state> \
  --location brazilsouth

az storage account create \
  --name <storage-account-globalmente-unico> \
  --resource-group <resource-group-do-state> \
  --location brazilsouth \
  --sku Standard_LRS \
  --kind StorageV2 \
  --allow-blob-public-access false \
  --allow-shared-key-access false

az storage container create \
  --name tfstate \
  --account-name <storage-account-globalmente-unico> \
  --auth-mode login
```

Antes desses comandos, confirme se o Resource Group, o Storage Account ou o contêiner já existem. Não os recrie. Habilite versionamento e soft delete do Blob conforme a política operacional aprovada. A identidade federada do repositório precisa de acesso de leitura ao Resource Group do workload e de `Storage Blob Data Contributor` no escopo mínimo do contêiner ou Storage Account do state. O bootstrap e essas atribuições são ações manuais fora desta issue.

Copie `backend.hcl.example` para o arquivo ignorado `backend.hcl` e preencha somente `storage_account_name`, `container_name` e `key`. IDs da identidade são fornecidos por ambiente:

```bash
export ARM_USE_OIDC=true
export ARM_USE_AZUREAD=true
export ARM_CLIENT_ID=<client-id-da-identidade-federada>
export ARM_TENANT_ID=<tenant-id>
export ARM_SUBSCRIPTION_ID=<subscription-id>

terraform init -backend-config=backend.hcl
```

Em GitHub Actions, `id-token: write` é necessário para obter o token OIDC. Nunca adicione `access_key`, SAS token, client secret ou token OIDC ao `backend.hcl`: além de violar a política do projeto, valores de backend podem ser copiados para `.terraform/` e arquivos de plano.

## Referenciar e importar recursos existentes

O Resource Group do workload é consultado com `data.azurerm_resource_group.web_push`; ele não pertence ao state e não será criado ou alterado. A consulta também confirma que a localização real corresponde a `brazilsouth`.

Para um recurso existente que passe a ser gerenciado em uma issue futura:

1. confirme o ID Azure e a configuração real do recurso;
2. declare o bloco `resource` correspondente sem mudar o recurso remoto;
3. adicione um bloco `import` versionável ou execute `terraform import ADDRESS RESOURCE_ID`;
4. execute `terraform plan` e elimine qualquer recriação ou alteração não intencional antes de considerar `apply`.

Não declare um recurso existente e execute `apply` antes da importação. Esta etapa não autoriza importar o Resource Group, provisionar serviços ou executar `terraform apply`.

## Validação sem credenciais

As verificações de PR não inicializam o backend e não acessam a Azure:

```bash
terraform fmt -check -recursive
terraform init -backend=false -input=false
terraform validate -no-color
```

Uma consulta real, `plan` ou importação exige autenticação e deve ocorrer apenas em contexto confiável e explicitamente autorizado.
