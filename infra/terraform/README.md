# Terraform do backend Web Push na Azure

Esta pasta contém a infraestrutura definida pela [ADR 0009](../../docs/adr/0009-adotar-azure-para-web-push-por-custo.md). Ela referencia o Resource Group existente `rg-portfolio-push-dev`, valida a região `brazilsouth`, usa o state remoto no Azure Blob Storage e modela o workload sem provisioná-lo.

## Versões e autenticação

- Terraform CLI `>= 1.15.0, < 1.18.0`; o CI usa exatamente `1.17.2`.
- Providers `hashicorp/azurerm ~> 5.14.0` e `Azure/azapi ~> 2.14.0`; o `.terraform.lock.hcl` versionado fixa as seleções e seus checksums. Conforme a [ADR 0014](../../docs/adr/0014-gerenciar-cosmos-sem-chaves-e-separar-iam.md), somente os recursos Cosmos usam AzAPI para que o refresh ARM não execute `listKeys` nem grave chaves de conta no State.
- Provider e backend usam Microsoft Entra. No GitHub Actions, a autenticação prevista é OIDC, sem client secret nem chave compartilhada do Storage Account.

Os identificadores da assinatura e do tenant não são segredos, mas variam por ambiente. Forneça-os por um `terraform.tfvars` local ignorado pelo Git ou pelas variáveis de ambiente `TF_VAR_subscription_id` e `TF_VAR_tenant_id`. Credenciais devem permanecer fora de arquivos Terraform, planos, logs e commits.

## Persistência, segredos e observabilidade (#144)

A primeira fatia do workload modela:

- Cosmos DB for NoSQL Serverless (capability `EnableServerless`, sem throughput provisionado), consistência de sessão, backup periódico LRS e uma única localização em `brazilsouth`;
- container `subscriptions` particionado por `/partitionKey`, com endpoint e chaves excluídos do índice para evitar RU de escrita sem benefício de consulta e TTL por item habilitado sem prazo padrão;
- identidade gerenciada atribuída pelo usuário, dedicada ao runtime futuro;
- Key Vault Standard com RBAC, soft delete de 90 dias e purge protection;
- Log Analytics `PerGB2018` em `brazilsouth`, retenção de 30 dias e cap preventivo de 0,1 GB/dia;
- logs de auditoria e métricas de Cosmos DB e Key Vault encaminhados ao workspace.

Não existe `azurerm_key_vault_secret`: a chave privada VAPID deve ser inserida diretamente por operador autorizado em etapa posterior. Assim, seu valor nunca entra em configuração, plano ou State. O Cosmos DB desabilita autenticação local para que o provisionamento e o runtime usem Entra ID, sem chaves de conta. A conta, o banco e o container são gerenciados como recursos ARM pelo AzAPI, com saída padrão desabilitada; o endpoint é derivado do nome público da conta. O acesso público aos endpoints permanece habilitado nesta baseline porque não há VNet modelada; RBAC, TLS 1.2 e autenticação local desabilitada reduzem a exposição, mas não equivalem a Private Link. Revisar rede privada e seus custos antes da ativação pública.

O repositório da #146 deriva ID e partition key do hash SHA-256 do endpoint, realiza somente point reads e distribui gravações por um prefixo de 8 bits (`v1-xx`). O consumo de RU é cobrado por uso e o índice exclui os campos volumosos `endpoint` e `keys`. `default_ttl = -1` apenas habilita TTL por documento; nenhum prazo é gravado enquanto a política de retenção exigida pela ADR-0006 não for aprovada.

A capacidade é Serverless: o Azure cobra RUs consumidas e armazenamento, sem reserva de 400 RU/s. O Free Tier vitalício não é compatível com Serverless. Não há georreplicação automática nem multi-write; não existe teto mensal rígido de cobrança. Confirmar o preço regional efetivo e eventuais créditos da assinatura antes do apply.

As atribuições de `Key Vault Secrets User` no vault e `Cosmos DB Built-in Data Contributor` restrita ao container ficam no root/state exclusivo [`runtime-iam/`](runtime-iam/). A execução normal de provisionamento não contém atribuições nem recebe `Microsoft.Authorization/roleAssignments/write`. Uma etapa IAM separada e aprovada deve aplicar esse root depois de revisar o principal e os escopos; ele não participa do workflow de release.

### Estimativa inicial de custo

Consulta à API oficial Azure Retail Prices em 24/11/2026, moeda USD e região Brazil South:

| Serviço | Premissa | Estimativa mensal antes de impostos |
| --- | --- | --- |
| Cosmos DB Serverless | RUs consumidas + armazenamento | Consultar preço por milhão de RU e GB-mês em Brazil South na assinatura; sem cobrança por RU/s provisionada |
| Backup Cosmos LRS | Volume faturável fora da franquia aplicável | USD 0,192/GB-mês |
| Key Vault Standard | Até 10 mil operações | cerca de USD 0,03; não há segredo criado por Terraform |
| Log Analytics | Ingestão efetiva | USD 4,60/GB; o cap de 0,1 GB/dia representa teto teórico de cerca de USD 13,80 em 30 dias, podendo haver pequena ultrapassagem faturável |
| Log Analytics | Retenção | 30 dias; retenção cobrada além do período incluído custa USD 0,20/GB-mês na tabela consultada |

Esses valores são uma estimativa pública, não uma cotação nem garantia de fatura zero. A cobrança real depende de elegibilidade, câmbio, tributos, volume de logs, operações, backup, armazenamento e preços da assinatura. O cap diário pode interromper observabilidade e não corta ingestão no byte exato; configurar alertas de custo continua obrigatório antes do provisionamento. Revalidar preços, cotas e disponibilidade no plano aprovado.

Fontes: [Free Tier do Cosmos DB](https://learn.microsoft.com/azure/cosmos-db/free-tier), [retenção do Log Analytics](https://learn.microsoft.com/azure/azure-monitor/logs/data-retention-configure), [cap diário](https://learn.microsoft.com/azure/azure-monitor/logs/daily-cap) e [Azure Retail Prices API](https://prices.azure.com/api/retail/prices).

### Permissões futuras derivadas

O código agora modela operações nos providers `Microsoft.ManagedIdentity`, `Microsoft.DocumentDB`, `Microsoft.KeyVault`, `Microsoft.OperationalInsights` e `Microsoft.Insights`. Antes do primeiro apply, derivar uma função customizada no escopo do Resource Group contendo somente leitura e create/update/delete dos tipos declarados: identidade atribuída pelo usuário, conta/banco/container Cosmos, vault, workspace e diagnostic settings. Não incluir criação de Resource Group, acesso ao State, leitura de segredos, chaves Cosmos, deploy de código ou administração genérica de IAM.

As atribuições de runtime são responsabilidade de operador ou fluxo IAM separado: `Microsoft.Authorization/roleAssignments/*` para Key Vault e `Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments/*` para Cosmos. Revisar também registros dos resource providers, ações auxiliares exigidas pelo plano e separação da identidade de deploy da aplicação. Esta documentação deriva permissões; não concede nenhuma delas.

## Function App, filas e limites de consumo (#145)

A segunda fatia modela uma Function App Linux em Flex Consumption (`FC1`) na região `brazilsouth`, com runtime .NET isolated 10, 2.048 MB por instância e limite máximo de duas instâncias. Não há instância always-ready, portanto não existe baseline fixa de execução. A única rota HTTP continua sendo `/api/health`; operações administrativas e publicação de campanhas não são expostas por HTTP.

A conta StorageV2 Standard LRS é exclusiva do workload. Shared Key, usuários locais, acesso anônimo a blobs e replicação cross-tenant ficam desabilitados; host, deploy e Queue Trigger usam a identidade gerenciada atribuída pelo usuário. O endpoint de rede permanece público para compatibilidade com runner hospedado e Flex sem VNet, mas containers e filas são privados e exigem Entra/RBAC. O container `function-releases` tem versionamento e soft delete por sete dias. As filas `web-push-campaigns` e `web-push-campaigns-poison` separam processamento e mensagens esgotadas.

O host processa uma mensagem por lote, sem prefetch adicional, tenta no máximo três dequeues, aplica visibility timeout de um minuto e timeout de função de cinco minutos. Com no máximo duas instâncias, o fan-out previsto é de até dois processamentos simultâneos por grupo de escala. O provider AzureRM 5.14.0 ainda não expõe o ajuste específico de concorrência HTTP do Flex; isso não amplia o processamento da fila e deve ser reavaliado quando o provider suportar a propriedade. Os limites de memória e instâncias são validados por testes Terraform.

As funções `Storage Blob Data Owner` e `Storage Queue Data Contributor` também ficam no root/state `runtime-iam`, fora do plano padrão. A Function só ficará operacional após uma execução IAM separada, revisada e aprovada. Não há connection string, access key ou segredo em HCL, plano ou State. Application Insights não foi criado: logs e métricas de plataforma são enviados diretamente ao Log Analytics, evitando introduzir uma connection string sensível no State nesta fase.

O sender da #147 recebe pela fila o identificador da campanha e, nas unidades seguintes, um token opaco de continuação do Cosmos DB. Cada invocação processa no máximo dez inscrições e só enfileira a próxima página depois de concluir a atual, preservando progresso dentro do timeout de cinco minutos. A Function recebe por app settings apenas a URI do Key Vault, o subject VAPID, os nomes estáveis `vapid-public-key`/`vapid-private-key`, TTL e timeout. Os valores dos secrets não são recursos Terraform: devem ser criados diretamente por operador autorizado depois de provisionar o vault e antes de qualquer ativação. A identidade de runtime precisa das atribuições do root `runtime-iam`; o publicador futuro não deve receber leitura do vault, Cosmos ou acesso de deploy.

### Root separado de IAM do runtime

[`runtime-iam/`](runtime-iam/) usa a backend key `portfolio-push-runtime-iam-dev.tfstate` e não é referenciado pelos workflows de plan/apply do workload. O CI apenas executa `fmt`, `init -backend=false` e `validate`. Um operador autorizado deve revisar os nomes, o Object ID da identidade resolvida, as quatro atribuições, seus escopos e um plano sanitizado antes de qualquer aplicação separada. Não importar recursos, migrar State, conceder `listKeys` ou executar esse root com a identidade normal de release. A ADR 0014 permanece `Proposed`; esta configuração não autoriza alteração real de IAM.

### Custo incremental estimado

Consulta à Azure Retail Prices API em 24/11/2026 para Brazil South e USD:

| Serviço | Premissa | Estimativa pública |
| --- | --- | --- |
| Functions Flex On Demand | Sem always-ready | franquia publicada de 100 mil GB-s e 250 mil execuções/mês por assinatura elegível; excedente a USD 0,000037/GB-s e cerca de USD 0,40/milhão de execuções |
| Blob Storage Standard LRS Hot | Capacidade | USD 0,03032/GB-mês, além de operações e versões retidas |
| Queue Storage LRS | Operações classe 1 | USD 0,004 por 10 mil operações |
| Log Analytics | Logs adicionais do runtime/Storage | permanece sujeito a USD 4,60/GB e ao cap preventivo descrito acima |

Franquias são compartilhadas no escopo da assinatura e não garantem custo zero. Antes do provisionamento, confirmar disponibilidade e cota Flex em `brazilsouth`, elegibilidade da franquia, preço contratual, orçamento e impacto do limite de duas instâncias. Fontes: [Flex Consumption](https://learn.microsoft.com/azure/azure-functions/flex-consumption-plan), [escala e concorrência](https://learn.microsoft.com/azure/azure-functions/functions-concurrency), [identidade para conexões do host](https://learn.microsoft.com/azure/azure-functions/functions-reference#connecting-to-host-storage-with-an-identity) e [Azure Retail Prices API](https://prices.azure.com/api/retail/prices).

### Permissões futuras derivadas para a #145

O provisionador passa a precisar de ações create/read/update/delete estritamente necessárias em `Microsoft.Web/serverfarms`, `Microsoft.Web/sites`, `Microsoft.Storage/storageAccounts`, blob containers, queues e diagnostic settings, além das operações já derivadas na #144. Ele não precisa de acesso ao conteúdo das filas, artefatos, segredos ou deploy de código. O operador IAM separado precisa atribuir somente os dois papéis de dados modelados à identidade de runtime. A identidade de deploy da #148 deve receber escopo próprio na Function App e não reutilizar automaticamente Terraform, State ou runtime.

## Release coordenada e separação de identidades (#148)

`Release and Deploy` é o único workflow que pode aplicar o root de workload. O `terraform-validation.yml` mantém apenas validação, teste de OIDC e plano diagnóstico; não existe apply independente e o root `identity-reconciliation` permanece somente leitura. Plano, JSON, logs e State nunca são publicados como artifact. O resumo aprovado contém somente endereços, ações e fingerprint; um novo plano idêntico é produzido imediatamente antes do apply.

O Environment `terraform-dev` usa `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` e `AZURE_SUBSCRIPTION_ID`. O Environment separado `functions-dev` usa `AZURE_FUNCTIONS_CLIENT_ID` com tenant e subscription compartilhados apenas como identificadores não secretos. Criar para ele uma credencial federada cujo subject seja `repo:rodri-oliveira-dev@3470248/rodri-oliveira-dev.github.io@1350159615:environment:functions-dev`. A identidade correspondente deve ter somente as ações de deploy de pacote necessárias no escopo da Function App; não deve acessar State, conteúdo de fila, Cosmos, Key Vault, IAM ou provisionar recursos. Derivar e revisar a função efetiva antes do primeiro uso; esta documentação não concede RBAC.

### Primeiro provisionamento em duas fases (#149)

1. Confirmar custos/cotas, aprovação das ADRs e permissões mínimas do provisionador. Executar **Release and Deploy** na main com `bootstrap_foundation_only=true`, confirmação `APPLY`, sem autorizar destruição e sem selecionar first deploy ou rollback. O plano/apply protegido cria Storage, filas, identidade, plano FC1, Cosmos, vault e observabilidade, mas não cria a Function App, não publica site, tag ou release. O SHA e fingerprint permanecem protegidos. Não repetir este modo após criar a Function: prevent_destroy impede sua remoção.
2. Um operador autorizado revisa e aplica separadamente o root `runtime-iam/` com os quatro papéis de dados exatos, aguarda propagação e configura os dois secrets VAPID diretamente no Key Vault. Não usar a identidade de provisionamento nem conceder administração de IAM a ela. Não há necessidade de criar campanha ou inscrição.
3. Criar identidade de deploy distinta e credencial federada com o subject imutável acima. Configurar `AZURE_FUNCTIONS_CLIENT_ID` e os Environments. Executar o mesmo workflow com `bootstrap_foundation_only=false`, `APPLY` e `allow_first_backend_deploy=true`. Antes do plano e novamente antes do apply, a automação consulta somente as quatro atribuições de runtime; ausência de qualquer uma bloqueia a criação da Function. A verificação comprova atribuições diretas, não propagação de dados nem leitura do VAPID; o operador deve confirmá-las no gate.
4. Após criação da Function, antes de aprovar o job `functions-dev`, atribuir as permissões mínimas de publicação à identidade de deploy no escopo exato da Function App e aguardar propagação. Validar health e somente então permitir as etapas restantes da release. O input de primeira publicação apenas reconhece a ausência de pacote anterior; não contorna aprovação, IAM ou health check.

Para releases posteriores, manter bootstrap desativado e seguir a política de rollback. Nenhum passo autoriza inscrições ou envio real.

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

Registro baseado na configuração informada pelo operador e nas validações autenticadas abaixo. O lock protege a conta no plano de gerenciamento, não impede a exclusão de blobs pelo plano de dados. A atribuição de dados específica está limitada ao contêiner; a revisão de RBAC direto e seus limites estão descritos abaixo.

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
terraform test -test-directory=tests -no-color
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
- as atribuições RBAC diretas da identidade de deploy nos escopos conhecidos do bootstrap, consultadas em vez de criadas;
- a credencial federada já funcional da branch `main`, declarada com `prevent_destroy` e um bloco `import` obrigatório.

A credencial `github-main-deploy-dev` da `main`, confirmada pelo operador no Entra em 24/11/2026, aceita somente o issuer `https://token.actions.githubusercontent.com`, a audience `api://AzureADTokenExchange` e o subject exato:

```text
repo:rodri-oliveira-dev@3470248/rodri-oliveira-dev.github.io@1350159615:ref:refs/heads/main
```

Não execute esse root module com a própria identidade de deploy. As consultas do provider `azuread` exigem leitura de diretório e o import exige uma sessão de operador autorizada; conceder `Application.ReadWrite.All` ao workflow ampliaria desnecessariamente o impacto de um comprometimento. Antes do primeiro `plan`, o operador deve confirmar o Object ID da aplicação e o ID da credencial no Entra, copiá-los para um `terraform.tfvars` ignorado e seguir o procedimento de importação abaixo. Interrompa se o plano indicar criação, substituição ou alteração da credencial existente. Esta etapa não autoriza `apply`.

O State de identidade usa a key separada `portfolio-push-identity-dev.tfstate` para separar os arquivos de State do workload e da identidade. Ambos estão no mesmo contêiner: keys distintas não constituem isolamento de autorização; a identidade com acesso de dados ao contêiner também pode acessar o State de identidade. Antes de ampliar privilégios ou armazenar informações sensíveis, avaliar contêiner separado com RBAC exclusivo do operador. Não publique IDs de objeto, credential IDs, conteúdo de State ou tokens em issues, logs ou commits.

### Procedimento de importação (operador autorizado)

Use um checkout limpo da revisão integrada, Terraform na versão fixada pelo CI e uma sessão PowerShell local autenticada como operador (não a identidade de deploy). Confirme acesso de leitura ao diretório, ao Resource Group e acesso ao plano de dados do backend. Não use um diretório com state local ou configuração de backend anterior sem investigar.

1. Execute `az login` e selecione a assinatura correta com `az account set --subscription <subscription-id>`. Confirme tenant e assinatura com `az account show`.
2. Consulte os metadados da aplicação e da credencial localmente, sem compartilhar a saída:

   ```powershell
   az ad app list --display-name app-portfolio-push-deploy-dev --query "[?displayName=='app-portfolio-push-deploy-dev'].{objectId:id,clientId:appId}" -o json
   az ad app federated-credential list --id <application-object-id> --query "[?name=='github-main-deploy-dev'].{id:id,name:name,issuer:issuer,subject:subject,audiences:audiences}" -o json
   ```

   Substitua os placeholders antes de executar. Confirme uma única aplicação e credencial, o subject imutável acima, issuer e audience. O ID de import usa o **Object ID da aplicação**, não o Client ID ou o ID do service principal: `<application-object-id>/federatedIdentityCredential/<credential-id>`.

3. Em `infra/terraform/identity-reconciliation/`, copie `terraform.tfvars.example` para `terraform.tfvars` (ignorado pelo Git), preencha assinatura, tenant, nome e ID de import. Confirme que não há variáveis de autenticação de automação interferindo na sessão CLI.

   ```powershell
   terraform init -input=false -lockfile=readonly "-backend-config=backend.hcl.example" "-backend-config=use_oidc=false" "-backend-config=use_cli=true"
   terraform plan "-input=false" "-lock-timeout=5m"
   ```

   Confirme que a key é `portfolio-push-identity-dev.tfstate`. Não use opções de migração/force-copy. O plano deve indicar somente **1 to import, 0 to add, 0 to change, 0 to destroy** (ou nenhuma alteração se já importado), sem avisos não investigados. Não salve ou publique o plano nem sua saída completa. Se divergir, interrompa.

4. Somente após autorização explícita do operador, importe para o State via CLI (sem `apply`):

   ```powershell
   terraform import "-input=false" "-lock-timeout=5m" azuread_application_federated_identity_credential.github_main "<application-object-id>/federatedIdentityCredential/<credential-id>"
   terraform plan "-input=false" "-lock-timeout=5m" "-detailed-exitcode"
   ```

   Use o mesmo ID informado no tfvars. Se a credencial já estiver no State, não repita o import; revise a associação e execute o plano. O segundo plano deve retornar código 0, sem mudanças. O import grava State e pode gerar operações de armazenamento; não cria nem modifica a credencial Entra. O bloco `import` versionado permite a prévia declarativa, mas não autoriza `apply` nesta etapa. Registre apenas a evidência sanitizada de import e ausência de mudanças na issue #142. Não execute `apply`, `destroy`, `force-unlock` ou restauração de State.

Referências: [terraform import](https://developer.hashicorp.com/terraform/cli/commands/import), [credencial federada AzureAD](https://registry.terraform.io/providers/hashicorp/azuread/latest/docs/resources/application_federated_identity_credential).

### Variáveis GitHub Actions confirmadas

Em 24/11/2026, a API do GitHub confirmou os nomes das variáveis de repositório `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` e `AZURE_SUBSCRIPTION_ID`; seus valores não foram lidos nem registrados. Workflows devem continuar mapeando essas variáveis para `azure/login` e `ARM_*`, sem client secret.

A proteção da branch `main` e o Environment `terraform-dev` foram registrados no gate #142 durante o PR #184. Manter a exigência de Pull Request, impedir force-push/exclusão e preservar a aprovação humana do Environment. Um job que declara `environment: terraform-dev` muda o subject OIDC para:

```text
repo:rodri-oliveira-dev@3470248/rodri-oliveira-dev.github.io@1350159615:environment:terraform-dev
```

Esse subject não é coberto pela credencial da branch. A credencial `github-terraform-dev` foi cadastrada pelo operador com issuer/audience idênticos. Os IDs numéricos acima identificam publicamente a conta e o repositório GitHub; os IDs de objetos Entra e de credenciais permanecem fora do repositório. Preserve ambas as credenciais.

### Validação OIDC do Environment `terraform-dev`

Após integrar o PR #184 e cadastrar a credencial federada do Environment no Entra, acesse Actions > Terraform validation > Run workflow, selecione `main` e a operação `validate-oidc`. O job autenticado aguarda a aprovação do Environment `terraform-dev`, usa `azure/login` com OIDC e consulta somente o Resource Group existente `rg-portfolio-push-dev`, sem publicar seus dados.

Esta operação não inicializa o backend remoto, não lê nem altera o State e não executa `plan`, `import` ou `apply`. O sucesso comprova a autenticação do subject de ambiente e a leitura do Resource Group, não o RBAC mínimo, o acesso ao State ou a autorização para provisionamento. Em 24/11/2026, a [execução bem-sucedida de validate-oidc](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/actions/runs/45468308172/job/138712302978) comprovou esses dois itens após a correção do subject imutável. O gate #142 continua pendente até a revisão dos demais controles.

### Baseline RBAC de bootstrap e evolução

Em 24/11/2026, o operador confirmou a substituição da atribuição temporária `Contributor` por `Reader` no Resource Group e a preservação de `Storage Blob Data Contributor` no contêiner `tfstate`. A consulta de atribuições do Service Principal com `az role assignment list --all --include-inherited` apresentou somente essas duas funções. A identidade continua sem autorização de provisionamento neste estágio.

| Escopo conhecido | Atribuições diretas esperadas da identidade de deploy |
| --- | --- |
| Assinatura | Nenhuma |
| Resource Group `rg-portfolio-push-dev` | `Reader` |
| Storage Account `strotfstatepushdev` | Nenhuma |
| Contêiner `tfstate` | `Storage Blob Data Contributor` |

O root de reconciliação verifica as atribuições diretas nesses quatro escopos por data sources, comparando os IDs públicos dos papéis integrados e o escopo exato. Uma pós-condição bloqueia o plano caso falte uma função esperada ou haja função adicional (inclusive `Contributor`). Essa baseline não altera RBAC, não é um inventário de permissões efetivas de todo o tenant e não verifica grupos transitivos, management groups, condições ABAC ou outros recursos descendentes. O operador autorizado deve revisar essas dimensões separadamente quando aplicáveis.

Evidências após a redução de RBAC:

- [Azure OIDC Validation, execução 45474645969](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/actions/runs/45474645969): OIDC da branch, leitura do RG, acesso ao plano de dados do Blob, lease, init remoto e validate aprovados.
- [Terraform validation, execução 45474875796](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/actions/runs/45474875796): validação estática e OIDC do Environment, leitura do RG aprovadas; plan/apply não executados.
- O operador informou import da credencial original e plano subsequente sem alterações (`No changes`). Após integrar a nova baseline, repetir `terraform plan "-input=false" "-lock-timeout=5m" "-detailed-exitcode"` no root de identidade, em sessão do operador; verificar código 0 e ausência de erros. Não repetir import nem executar apply.

Referências: [papéis integrados Azure](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles), [data source role assignments](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/data-sources/role_assignments).

**Evolução antes do primeiro provisionamento:**

1. State: manter acesso de dados limitado ao contêiner necessário; não conceder Shared Key ou SAS. Revisar o isolamento do State de identidade e os riscos de exclusão dos blobs.
2. Terraform: nas issues #144 e #145, derivar as ações necessárias dos recursos efetivamente modelados e revisar a baseline por PR; conceder somente papéis restritos aprovados, sem permissões de administração de IAM. Atribuições para identidades gerenciadas que exijam IAM devem ser realizadas por operador autorizado ou fluxo separado com escopo específico.
3. Deploy (#148) e publicação (#164): usar identidades/credenciais e permissões específicas de deploy e enqueue, sem reutilização automática dos privilégios do Terraform. A separação atual de subjects em uma mesma aplicação não separa o RBAC do Service Principal.
4. Gate #142: a baseline de bootstrap não autoriza `apply`, criação de recursos nem avanço automático. Custos, cotas, elegibilidade, riscos residuais e aprovação humana precisam de evidência; antes do primeiro apply, revisar permissões específicas e a aprovação do plano efetivamente aplicado.

