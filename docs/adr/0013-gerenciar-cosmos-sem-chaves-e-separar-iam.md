# ADR 0013: Gerenciar Cosmos sem chaves e separar o IAM de runtime

## Status

Proposed

## Context

O provider AzureRM 5.14 lê `Microsoft.DocumentDB/databaseAccounts/listKeys` durante o refresh de `azurerm_cosmosdb_account`, mesmo quando a autenticação local está desabilitada, e expõe chaves da conta no State. Conceder essa ação ao provisionador violaria a separação aprovada entre provisionamento e runtime.

As quatro atribuições de dados do runtime também estavam condicionadas no mesmo root/state aplicado pela release. Uma execução posterior com a condição desativada planejaria removê-las, misturando provisionamento do workload, IAM e ciclo de vida do acesso da aplicação.

## Decision

Gerenciar a conta, o banco e o container Cosmos DB pelo provider oficial Azure AzAPI, usando recursos ARM `Microsoft.DocumentDB` e API estável `2024-11-15`. O refresh usa o `GET` do recurso ARM, que não é a operação `listKeys`; a saída padrão do provider fica desabilitada e nenhum campo de chave é solicitado ou exportado. O endpoint público é derivado do nome da conta, sem consultar credenciais.

Manter a identidade gerenciada no root do workload, mas mover as quatro atribuições do runtime para `infra/terraform/runtime-iam`, com backend key exclusiva. Esse root recebe somente a responsabilidade IAM: Key Vault Secrets User, Cosmos DB Built-in Data Contributor no container e os papéis de Blob e Queue na conta Storage dedicada. Ele não integra o workflow normal de release e depende de execução separada, protegida e explicitamente aprovada por operador autorizado. No primeiro bootstrap, o orquestrador provisiona somente a fundação e pausa antes da criação da Function; o operador aplica o root IAM e configura VAPID. A release completa verifica as quatro atribuições diretas antes de criar a Function. O escopo de deploy é concedido à identidade separada somente após existir o recurso, antes da aprovação do job functions-dev.

Não conceder `listKeys`, acesso a segredos, conteúdo de filas ou administração genérica de IAM à identidade de provisionamento. Uma eventual migração de mecanismo ou State exige plano, revisão e procedimento próprios; esta ADR não autoriza import, apply ou alteração real de RBAC.

## Consequences

O State do workload deixa de conter propriedades de chaves Cosmos produzidas pelo AzureRM, ao custo de manter o schema ARM explícito e testar mudanças de API/provider. O AzAPI complementa o AzureRM apenas nos recursos Cosmos afetados; os demais recursos permanecem no provider existente.

As releases normais não podem apagar acessos de runtime nem precisam de `roleAssignments/write`. O fluxo IAM ganha State, lockfile, inputs e aprovação próprios. O isolamento por key no mesmo container não é isolamento de autorização; antes de executar o root, revisar o acesso ao backend e os escopos efetivos.

O status permanece Proposed até aprovação humana explícita. A validação do código e do ADR Guard não equivale à aceitação nem autoriza provisionamento.
