# ADR 0018: Segregar o provisionamento de Diagnostic Settings

## Status

Accepted

## Context

A issue #149 registrou três falhas LinkedAuthorizationFailed ao vincular Diagnostic Settings ao mesmo workspace. O provisionador possui diagnosticSettings/write e workspaces/read, mas não sharedKeys/action. A [documentação Microsoft](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access) exige a última operação para configurar o workspace como destino. Ela também permite recuperar chaves; a ação vinculada exata do erro original não foi capturada. A ADR 0017 impede ampliar a identidade de release para acessar chaves.

## Decision

Manter o workspace AzAPI, autenticação local desabilitada e workload no State existente. Separar os quatro Diagnostic Settings em root `infra/terraform/diagnostics`, AzureRM 5.14.0 fixado, IDs ARM determinísticos dev e container de State dedicado `tfstate-diagnostics` na conta existente, key `portfolio-push-diagnostics-dev.tfstate`. Não ler o State do workload, chaves ou dados para resolver IDs. A identidade distinta do operador recebe somente as permissões revisadas: diagnosticSettings/read e write nos recursos de origem, workspaces/read e sharedKeys/action no workspace específico, acesso Entra ao container dedicado e permissões auxiliares estritamente comprovadas. Não conceder Contributor, Owner ou IAM write. Não conceder sharedKeys/action ao provisionador. A criação do container e as atribuições dependem de autorização específica, não desta ADR.

Complementar as ADRs [0012](0012-controlar-publicacao-por-release-manual.md), [0014](0014-gerenciar-cosmos-sem-chaves-e-separar-iam.md), [0015](0015-segregar-resource-groups-state-workload.md) e [0017](0017-gerenciar-log-analytics-via-azapi-sem-chaves.md). O bootstrap da fundação não cria os diagnósticos; o operador configura os três antes da release completa. A release verifica os três antes de planejar/aplicar a Function e os quatro após criar a Function, em gate protegido antes do deploy do backend. O operador configura o quarto durante essa pausa, com `include_function=true`; manter true nas execuções posteriores. O gate usa somente ARM GET, verifica destino e categorias habilitadas e bloqueia falha. Não verifica ingestão real, que permanece para smoke operacional. Sem Apply independente automatizado, sem alteração do fluxo de publicação ou fingerprint.

Aprovação arquitetural registrada pelo responsável em 26/11/2026 na issue #149. Nenhum recurso, acesso, segredo, State ou release é autorizado por esta decisão.

## Consequences

O operador de diagnóstico tem acesso potencial às chaves do workspace específico; autenticação local desabilitada reduz o risco, mas não elimina a capacidade de recuperar chaves. A segregação de container reduz o acesso ao State; administradores da conta e atribuições herdadas podem atravessar essa fronteira. Operações devem ser serializadas. Não há migração prevista pois os três settings não existem segundo inventário anterior; revalidar ARM e State antes de qualquer apply. Se houver setting no root antigo, interromper e reconciliar explicitamente; não destruir nem importar automaticamente. A remoção de diagnosticSettings/write da role do provisionador será avaliada e autorizada separadamente. O requisito exato de permissões e a ingestão devem ser comprovados antes da ativação.
