# ADR 0016: Gerenciar Function App Flex via AzAPI sem credenciais de publicação

## Status

Accepted

## Context

Na revisão 6.8.3 da issue #149, o código do AzureRM v5.14.0 confirmou que o refresh do recurso Flex exige ListApplicationSettings, ListConnectionStrings, ListSlotConfigurationNames e ListPublishingCredentials e possui site_credential no schema. A criação exige ainda CheckNameAvailability no escopo de assinatura. A concessão dessas permissões contraria a separação de provisionamento, runtime e publicação aprovada na ADR 0014. A Function ainda não existe, portanto não há migração de State a realizar.

## Decision

Estender o uso pontual do AzAPI 2.14.0 à Function App, preservando as ADRs aceitas 0012 e 0014 e a fronteira de RG da ADR 0015. Usar Microsoft.Web/sites@2024-11-01, com configuração Flex, plano FC1, .NET isolated 10, identidade UserAssigned, Storage de deployment via identidade, 2048 MB e máximo de duas instâncias por grupo de escala, sem Always Ready. Manter HTTPS, TLS 1.2, HTTP/2, endpoints, tags, filas, nomes de secrets e bootstrap em duas fases. Não armazenar valores de secrets nas configurações. Desabilitar saída padrão e exportar somente properties.defaultHostName. Preservar prevent_destroy e o contrato dos outputs usado pela release.

Modelar SCM e FTP com azapi_update_resource porque o RP pode materializar esses filhos ao criar o site e azapi_resource rejeita recurso existente. Ambas as políticas devem negar autenticação básica. O suporte efetivo dos endpoints no Flex e o intervalo entre criação do site e atualização das políticas são gates: caso o RP não ofereça um endpoint, comprovar a inexistência da superfície de publicação por evidência independente e revisar a modelagem; não ignorar falhas nem reabilitar credenciais. Não publicar pacote até concluir as políticas. Não conceder config/list, listKeys ou acesso a credenciais.

O Health Check nativo não é suportado no Flex segundo a documentação Microsoft. Não replicar configuração de eviction do App Service como garantia operacional. Manter /api/health no backend e o gate externo na release. Não ampliar o limite de instâncias nem alterar orçamento/cotas.

## Consequences

O AzAPI evita as operações auxiliares de leitura de credenciais específicas do AzureRM Flex. GET do recurso ainda pode devolver propriedades sensíveis; a saída mínima não é garantia de ausência de dados sensíveis no body reconstruído pelo provider. Não adicionar segredos aos app settings, inspecionar apenas evidências sanitizadas de plano/State, verificar drift sem conceder list de configurações e manter os logs de debug desabilitados. A ausência de app settings no GET pode limitar a detecção de drift; revisar controles compensatórios antes de produção.

Preflight usa validateResources no endpoint de provedor; RBAC efetivo, polling, políticas de publicação, compatibilidade regional de FC1, suporte ao limite de escala e operações restantes do AzureRM precisam ser comprovados. Preservar a matriz candidata sem autorizá-la. Não conceder privilégios sensíveis para contornar falhas. Decisão aprovada pelo responsável pelo projeto em 25/11/2026, no contexto da issue #149. A aprovação arquitetural não autoriza apply, alterações de IAM ou deploy; os gates operacionais permanecem obrigatórios.

Referências: [AzureRM Flex v5.14.0](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.14.0/internal/services/appservice/function_app_flex_consumption_resource.go#L598-L617), [AzAPI v2.14.0](https://github.com/Azure/terraform-provider-azapi/blob/v2.14.0/internal/services/azapi_resource.go), [ARM sites](https://learn.microsoft.com/azure/templates/microsoft.web/2024-11-01/sites), [políticas de publicação](https://learn.microsoft.com/azure/templates/microsoft.web/2024-11-01/sites/basicpublishingcredentialspolicies), [Health Check](https://learn.microsoft.com/azure/azure-functions/configure-monitoring).
