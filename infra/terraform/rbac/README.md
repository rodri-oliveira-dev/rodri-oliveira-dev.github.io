# RBAC de provisionamento (#149)

A lista [provisioner-candidate.json](provisioner-candidate.json) contém ações ARM candidatas, derivadas dos tipos declarados e do gate de leitura de IAM. Não é um arquivo de role definition aplicável. Não criar/atribuir uma função a partir dessa lista sem revisão do catálogo real e das chamadas dos providers fixados.

| Recurso/controle | Operações candidatas |
| --- | --- |
| User Assigned Identity | read, write, assign/action para associação à Function |
| Cosmos ARM | read/write de conta, banco e container; leitura das atribuições SQL para o gate |
| Vault e workspace | read/write dos recursos, sem acesso aos valores de segredos |
| Diagnostic settings | read/write e leitura das categorias |
| Storage do workload | read/write de conta, serviço de blobs, container e filas por ARM |
| Flex | read/write de plano, site, configuração e políticas de publicação |
| Gate de IAM | leitura de role assignments e definitions, sem criação ou alteração |

A lista inicial não inclui delete; o primeiro provisionamento não autoriza exclusões. Alterações/destruições futuras exigem revisão específica de ações. Não há DataActions, curingas, listKeys, SAS, publicação de código, leitura de segredos, alteração de role assignments/definitions ou registro de providers.

**Pontos pendentes antes da concessão:** comparar cada ação com `az provider operation show` e a documentação oficial; inspecionar o código/API das versões fixadas de AzureRM/AzAPI, incluindo LROs, validação de nomes e preflight em escopos de assinatura, AzureRM Storage/Queue e leituras de configuração/publishing credentials do Flex. O provider pode requerer operações adicionais ou incompatíveis com esta política. Não ampliar para listKeys, config/list, conteúdo de filas/blobs, permissões de publicação ou administração IAM para contornar falhas; revisar o recurso/provider e a decisão arquitetural. Se uma operação auxiliar no nível da assinatura for necessária, avaliar separadamente o escopo estrito e o risco; não usar Contributor/Reader genérico na assinatura.

O controle RBAC de gerenciamento não impede toda escalada indireta: write sobre Storage, Key Vault, Function e assign/action podem alterar configuração de segurança ou associar identidades; preservar autenticação local desabilitada e validar plano. Avaliar Azure Policy e escopos de identidade separados antes de habilitar dados reais. A separação de RG protege o plano de gerenciamento do State, não o conteúdo dos blobs acessíveis pelo provisionador nem o isolamento entre keys do backend.

A função final deverá ter assignable scope e atribuição limitados ao RG `rg-portfolio-push-workload-dev`, após confirmação de compatibilidade Azure e revisão. Registrar UUID da definição aprovada em tfvars local do root de reconciliação, comparar também ações/NotActions/DataActions/AssignableScopes, e verificar atribuições diretas e herdadas. O UUID isolado não garante a definição. Nenhuma função ou atribuição é criada por este PR.

Referências: [catálogo de operações](https://learn.microsoft.com/azure/role-based-access-control/resource-provider-operations), [definições RBAC](https://learn.microsoft.com/azure/role-based-access-control/role-definitions), [permissões Web](https://learn.microsoft.com/azure/role-based-access-control/permissions/web-and-mobile).
