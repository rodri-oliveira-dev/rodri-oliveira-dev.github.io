# RBAC de provisionamento (#149)

A lista [provisioner-candidate.json](provisioner-candidate.json) contém ações ARM candidatas, derivadas dos tipos declarados e do gate de leitura de IAM. Não é um arquivo de role definition aplicável. Não criar/atribuir uma função a partir dessa lista sem revisão do catálogo real e das chamadas dos providers fixados.

| Recurso/controle | Operações candidatas |
| --- | --- |
| User Assigned Identity | read, write, assign/action para associação à Function |
| Cosmos ARM | read/write de conta, banco e container; leitura das atribuições SQL para o gate |
| Vault e workspace | read/write dos recursos, sem acesso aos valores de segredos |
| Diagnostic settings | read/write e leitura das categorias |
| Storage do workload | read/write de conta, serviço de blobs, container e filas por ARM; leituras de fileServices e accountMigrations candidatas |
| Flex | read/write de plano, site e políticas de publicação; app settings no corpo do site |
| Gate de IAM | leitura de role assignments e definitions, sem criação ou alteração |

A lista inicial não inclui delete; o primeiro provisionamento não autoriza exclusões. Alterações/destruições futuras exigem revisão específica de ações. Não há DataActions, curingas, listKeys, SAS, publicação de código, leitura de segredos, alteração de role assignments/definitions ou registro de providers.

**Pontos pendentes antes da concessão:** comparar cada ação com `az provider operation show` e a documentação oficial; inspecionar o código/API das versões fixadas de AzureRM/AzAPI, incluindo LROs, validação de nomes e preflight em escopos de assinatura, AzureRM Storage/Queue e leituras de configuração/publishing credentials do Flex. O provider pode requerer operações adicionais ou incompatíveis com esta política. Não ampliar para listKeys, config/list, conteúdo de filas/blobs, permissões de publicação ou administração IAM para contornar falhas; revisar o recurso/provider e a decisão arquitetural. Se uma operação auxiliar no nível da assinatura for necessária, avaliar separadamente o escopo estrito e o risco; não usar Contributor/Reader genérico na assinatura.

O controle RBAC de gerenciamento não impede toda escalada indireta: write sobre Storage, Key Vault, Function e assign/action podem alterar configuração de segurança ou associar identidades; preservar autenticação local desabilitada e validar plano. Avaliar Azure Policy e escopos de identidade separados antes de habilitar dados reais. A separação de RG protege o plano de gerenciamento do State, não o conteúdo dos blobs acessíveis pelo provisionador nem o isolamento entre keys do backend.

A função final deverá ter assignable scope e atribuição limitados ao RG `rg-portfolio-push-workload-dev`, após confirmação de compatibilidade Azure e revisão. Registrar UUID da definição aprovada em tfvars local do root de reconciliação, comparar também ações/NotActions/DataActions/AssignableScopes, e verificar atribuições diretas e herdadas. O UUID isolado não garante a definição. Nenhuma função ou atribuição é criada por este PR.

Referências: [catálogo de operações](https://learn.microsoft.com/azure/role-based-access-control/resource-provider-operations), [definições RBAC](https://learn.microsoft.com/azure/role-based-access-control/role-definitions), [permissões Web](https://learn.microsoft.com/azure/role-based-access-control/permissions/web-and-mobile).

## Revisão 6.8.3 (candidata, não autorizada)

- AzureRM v5.14.0: Flex exige quatro operações list durante Read, incluindo publishing credentials, e CheckNameAvailability na assinatura durante Create. Substituição proposta na ADR 0016. Não adicionar essas ações. As ações sites/config/read e write foram retiradas da matriz candidata porque o recurso proposto envia siteConfig no PUT do site; validar se alguma outra chamada efetiva as exige.
- Storage Account Read: ListKeys tolera 401/403 e conflito; manter negado. GetServiceProperties de blob e file (condicionais ao suporte do tipo de conta) e GetCustomerInitiatedMigration retornam erro se falharem. Adicionadas apenas as candidatas accountMigrations/read e fileServices/read, a confirmar no catálogo autenticado. Revisar também CheckNameAvailability, LRO, operações de criação e eventuais propriedades dos serviços antes de autorizar.
- AzAPI 2.14.0: GET de existência, PUT de recurso, GET de resposta e GET de refresh. azapi_update_resource lê o filho existente, mescla o corpo gravável, faz PUT e relê; a existência e suporte dos endpoints SCM/FTP no Flex ainda não foram comprovados. Não tratar erro como sucesso. Não ler publishing credentials.
- Preflight do AzAPI chama POST /providers/Microsoft.Resources/validateResources?api-version=2020-10-01 (performPreflightWithoutRbacWriteCheck=true), fora do RG; não inserir ações na assinatura/tenant sem evidência de necessidade e aprovação. Preservar preflight habilitado e registrar eventual falha sanitizada.
- A saída padrão está desabilitada, mas o Read usa UpdateObject para reconstruir body a partir do retorno ARM. App settings inline não devem receber valores secretos; verificar retorno, drift, planos/State sanitizados e ausência de chaves inclusive do Storage. Não conceder config/list para melhorar drift. Revisão de Key Vault, Log Analytics, diagnóstico, LRO e chamadas auxiliares restantes ainda pendente; nenhum papel pode ser criado com base neste PR.

Fontes: [AzAPI resource v2.14.0](https://github.com/Azure/terraform-provider-azapi/blob/v2.14.0/internal/services/azapi_resource.go), [AzAPI update](https://github.com/Azure/terraform-provider-azapi/blob/v2.14.0/internal/services/azapi_update_resource.go), [preflight](https://github.com/Azure/terraform-provider-azapi/blob/v2.14.0/internal/services/preflight/preflight.go), [Storage v5.14.0](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.14.0/internal/services/storage/storage_account_resource.go#L2154-L2214), [catálogo Storage](https://learn.microsoft.com/azure/role-based-access-control/permissions/storage).
