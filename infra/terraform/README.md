# Terraform do backend Web Push na Azure

Esta pasta contém apenas a base de infraestrutura definida pela [ADR 0009](../../docs/adr/0009-adotar-azure-para-web-push-por-custo.md). Ela referencia o Resource Group existente `rg-portfolio-push-dev`, valida a região `brazilsouth` e prepara o state remoto no Azure Blob Storage. Nenhum Azure Functions, Cosmos DB ou outro workload é modelado nesta etapa.

## Versões e autenticação

- Terraform CLI `>= 1.15.0, < 1.18.0`; o CI usa exatamente `1.17.2`.
- Provider `hashicorp/azurerm ~> 5.14.0`; o `.terraform.lock.hcl` versionado fixa a seleção e seus checksums.
- Provider e backend usam Microsoft Entra. No GitHub Actions, a autenticação prevista é OIDC, sem client secret nem chave compartilhada do Storage Account.

Os identificadores da assinatura e do tenant não são segredos, mas variam por ambiente. Forneça-os por um `terraform.tfvars` local ignorado pelo Git ou pelas variáveis de ambiente `TF_VAR_subscription_id` e `TF_VAR_tenant_id`. Credenciais devem permanecer fora de arquivos Terraform, planos, logs e commits.

## Bootstrap manual do state remoto (#139)

O armazenamento foi preparado manualmente em 24/11/2026, fora do state do workload. Não recrie nem importe esses recursos para este root module.

| Recurso / propriedade | Configuração registrada |
| --- | --- |
| Resource Group | `rg-portfolio-push-dev` |
| Storage Account | `strotfstatepushdev` |
| Região / SKU / camada | `brazilsouth` / `Standard_LRS` / Hot |
| Contêiner / key | `tfstate` (privado) / `portfolio-push-dev.tfstate` |
| Autenticação | Microsoft Entra ID, Shared Key e acesso anônimo desabilitados |
| Transporte / repouso | HTTPS obrigatório, TLS mínimo 1.2, MMK |
| Recuperação | Versionamento de blobs; soft delete de blobs e contêineres por 7 dias |
| Rede | Endpoint público, todas as redes, roteamento Microsoft; sem Private Endpoint |
| RBAC | Operador: Storage Blob Data Contributor na conta; aplicação `app-portfolio-push-deploy-dev`: mesma função no contêiner |
| Proteção administrativa | Lock `protect-terraform-state`, tipo CanNotDelete, na conta |
| Tags | project=portfolio-push, environment=dev, purpose=terraform-state, managed-by=manual-bootstrap |
| Defender for Storage | Desabilitado inicialmente |

Registro baseado na configuração informada pelo operador; a comprovação de acesso efetivo pelo runner está pendente. O lock protege a conta no plano de gerenciamento, não impede a exclusão de blobs pelo plano de dados. A identidade de deploy pode ter permissões adicionais herdadas no Resource Group; a atribuição de dados específica está limitada ao contêiner.

### Custo e riscos residuais

Consultar a [calculadora Azure](https://azure.microsoft.com/pt-br/pricing/calculator/) para Brazil South, Blob Storage Standard LRS Hot, incluindo capacidade, operações, versões e retenção. A hipótese inicial de dimensionamento é 1 GB e 1.000 leituras/1.000 escritas por mês; não é uma cotação, franquia nem limite. Registrar o total estimado, moeda e data na issue #139 antes de encerrá-la. Os valores efetivos da assinatura não foram verificados.

LRS não oferece recuperação de falha regional. O endpoint público é necessário para o runner hospedado atual, sem IP fixo contratado; RBAC, HTTPS, ausência de Shared Key e acesso anônimo bloqueado reduzem a exposição, mas não substituem isolamento de rede. Reavaliar rede privada e Defender conforme sensibilidade, custo e evolução do workload. Revisar o acúmulo de versões periodicamente; não introduzir regra de expiração que possa apagar o state ativo. Soft delete/versionamento não substituem uma estratégia de recuperação testada.

### Inicialização

O arquivo versionado `backend.hcl.example` contém apenas os identificadores não secretos do backend já criado. No GitHub Actions, a autenticação usa a identidade OIDC existente, com `id-token: write` e as variáveis `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` e `AZURE_SUBSCRIPTION_ID` mapeadas para `ARM_*`. O backend usa Entra no plano de dados, sem lookup do endpoint pelo plano de gerenciamento.

Para inicialização local interativa por um operador autorizado, a partir de `infra/terraform/`:

```bash
az login --tenant <tenant-id>
az account set --subscription <subscription-id>
terraform init -input=false -lockfile=readonly \
  -backend-config=backend.hcl.example \
  -backend-config=use_oidc=false \
  -backend-config=use_cli=true
```

Use um diretório de trabalho limpo, sem state local ou configuração de backend anterior; se houver state existente, interrompa e avalie migração separadamente. Não use `-migrate-state` ou `-force-copy` nesta etapa. A inicialização pode criar um state vazio se ainda não houver state remoto. Nunca adicione `access_key`, SAS, client secret, token OIDC ou conteúdo de state a arquivos, logs ou commits.

### Validação autenticada

Após revisão e integração do PR, execute **Azure OIDC Validation** em Actions > Run workflow, selecionando exclusivamente `main`. O workflow verifica o Resource Group, inicializa o backend real com OIDC e verifica o plano de dados/lease usando um blob descartável com nome único no prefixo `_validation/`. O teste cria apenas conteúdo sintético, confirma aquisição e liberação de um lease com prazo de 60 segundos, e tenta remover somente o próprio blob, inclusive em caso de falha. Se o runner for interrompido, o lease expira; versões/soft delete podem manter resíduos e gerar custo. Se a limpeza falhar, investigar o blob de teste, nunca o state ativo.

O teste verifica o mecanismo de lease do Azure, não simula concorrência entre dois processos Terraform. Não executa `plan`, `apply`, `import`, `state pull` ou `force-unlock`. Não exporta state, credenciais ou artefatos. A execução em PR permanece sem autenticação Azure. Registre o link da execução bem-sucedida na issue #139; não encerre a issue antes da evidência e avaliação de custo.

Referências: [backend azurerm](https://developer.hashicorp.com/terraform/language/backend/azurerm), [Azure CLI Blob Lease](https://learn.microsoft.com/pt-br/cli/azure/storage/blob/lease), [autorização de operações Blob](https://learn.microsoft.com/en-us/azure/storage/blobs/authorize-data-operations-cli).

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
terraform init -backend=false -input=false -lockfile=readonly
terraform validate -no-color
```

### Manutenção do lockfile de providers

Ao incluir uma plataforma ou atualizar um provider deliberadamente, use o Terraform CLI fixado no CI e o registry oficial. Preserve a seleção existente (sem `-upgrade`) quando a intenção for apenas complementar checksums:

```bash
terraform providers lock \
  -platform=linux_amd64 \
  -platform=windows_amd64 \
  -platform=darwin_amd64 \
  -platform=darwin_arm64
```

Revise a assinatura apresentada pelo Terraform, a versão e o diff de `.terraform.lock.hcl`. Versione o lockfile gerado, não hashes calculados manualmente ou obtidos de fontes não verificadas. A inicialização em PR e na validação autenticada usa `-lockfile=readonly` para não ocultar divergências. Se um checksum não corresponder, investigue a origem do pacote antes de atualizar o arquivo; não desabilite a verificação.

Referência: [terraform providers lock](https://developer.hashicorp.com/terraform/cli/commands/providers/lock).

Uma consulta real, `plan` ou importação exige autenticação e deve ocorrer apenas em contexto confiável e explicitamente autorizado.

## Reconciliação da identidade existente (#140)

O root module separado [`identity-reconciliation/`](identity-reconciliation/) representa, sem recriar o bootstrap:

- a aplicação Entra existente `app-portfolio-push-deploy-dev` e seu service principal, consultados por data sources;
- a atribuição temporária `Contributor` no escopo exato de `rg-portfolio-push-dev`, consultada em vez de criada;
- a credencial federada já funcional da branch `main`, declarada com `prevent_destroy` e um bloco `import` obrigatório.

A credencial da `main` aceita somente o issuer `https://token.actions.githubusercontent.com`, a audience `api://AzureADTokenExchange` e o subject exato:

```text
repo:rodri-oliveira-dev/rodri-oliveira-dev.github.io:ref:refs/heads/main
```

Não execute esse root module com a própria identidade de deploy. As consultas do provider `azuread` exigem leitura de diretório e o import exige uma sessão de operador autorizada; conceder `Application.ReadWrite.All` ao workflow ampliaria desnecessariamente o impacto de um comprometimento. Antes do primeiro `plan`, o operador deve confirmar no Entra o nome e os IDs imutáveis da credencial, copiá-los para um `terraform.tfvars` ignorado e executar somente o import declarativo. Interrompa se o plano indicar criação, substituição ou alteração da credencial existente. Esta etapa não autoriza `apply`.

O state de identidade usa uma key separada (`portfolio-push-identity-dev.tfstate`) para não misturar privilégios de diretório com o state do workload. A criação dessa key pelo primeiro `init`/import e a concessão de acesso ao operador continuam ações manuais. Não publique IDs de objeto, credential IDs, conteúdo de State ou tokens em issues, logs ou commits.

### Variáveis GitHub Actions confirmadas

Em 24/11/2026, a API do GitHub confirmou os nomes das variáveis de repositório `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` e `AZURE_SUBSCRIPTION_ID`; seus valores não foram lidos nem registrados. Workflows devem continuar mapeando essas variáveis para `azure/login` e `ARM_*`, sem client secret.

O repositório ainda não possuía proteção da branch `main` nem um GitHub Environment dedicado ao Terraform na mesma verificação. Antes de habilitar um fluxo autenticado, exigir Pull Request na `main`, impedir force-push/exclusão e criar um Environment protegido com aprovação humana. Um job que declara `environment: terraform-dev` muda o subject OIDC para:

```text
repo:rodri-oliveira-dev/rodri-oliveira-dev.github.io:environment:terraform-dev
```

Esse subject não é coberto pela credencial da branch. A credencial de ambiente deve existir previamente no Entra, com issuer/audience idênticos e IDs imutáveis confirmados, antes de o job tentar autenticar. Não substitua nem edite a credencial funcional da `main` para obter essa correspondência.

### Validação OIDC do Environment `terraform-dev`

Após integrar o PR #184 e cadastrar a credencial federada do Environment no Entra, acesse Actions > Terraform validation > Run workflow, selecione `main` e a operação `validate-oidc`. O job autenticado aguarda a aprovação do Environment `terraform-dev`, usa `azure/login` com OIDC e consulta somente o Resource Group existente `rg-portfolio-push-dev`, sem publicar seus dados.

Esta operação não inicializa o backend remoto, não lê nem altera o State e não executa `plan`, `import` ou `apply`. O sucesso comprova a autenticação do subject de ambiente e a leitura do Resource Group, não o RBAC mínimo, o acesso ao State ou a autorização para provisionamento. Registre o link da execução bem-sucedida na issue #142; o gate continua pendente até a revisão dos demais controles.

### Plano de menor privilégio

1. **State:** manter `Storage Blob Data Contributor` somente no contêiner `tfstate`; não conceder chave da conta, SAS ou papel de gerenciamento do Storage ao workflow.
2. **Terraform:** substituir `Contributor` no Resource Group por papéis/custom role restritos aos tipos efetivamente modelados, sem `Microsoft.Authorization/roleAssignments/*`, antes do primeiro `apply`. A lista final depende dos recursos aprovados nas issues posteriores e não deve ser antecipada.
3. **Deploy:** usar credencial federada de Environment e papel limitado ao artefato/slot que o workflow realmente implantar; não reutilizar automaticamente o acesso amplo de Terraform para deploy da aplicação.
4. **Separação:** manter sujeitos de branch e Environment em credenciais distintas e workflows distintos. Qualquer separação futura em outra app registration exige decisão e escopo próprios; #140 preserva a aplicação existente.

Até que o RBAC mínimo, a proteção da `main`, o Environment e sua credencial federada estejam comprovados, `Contributor` é uma exceção temporária e nenhum gate autoriza `apply`.
