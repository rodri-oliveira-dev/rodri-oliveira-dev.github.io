# ADR 0020: Gerenciar TLS da Function no recurso config/web

## Status

Proposed

## Context

A ADR 0016 modelou a Function Flex por `Microsoft.Web/sites@2024-11-01` e incluiu `siteConfig.minTlsVersion=1.2` no PUT inicial. O primeiro deployment da issue #149 preservou TLS 1.2 nos endpoints principal e SCM, mas o GET do recurso `sites` não devolve `minTlsVersion`. Como consequência, o Plan pós-release tenta atualizar perpetuamente a Function, embora `sites/config/web` confirme `minTlsVersion=1.2` e `scmMinTlsVersion=1.2`.

Ignorar todo o `siteConfig` ocultaria drift de configurações operacionais. Manter o campo no pai conserva a postura efetiva, mas impede idempotência. O filho `Microsoft.Web/sites/config` é a [superfície documentada pela Azure](https://learn.microsoft.com/azure/app-service/tls-minimum-version) para ler e atualizar os dois limites de TLS.

## Decision

Remover somente `minTlsVersion` do corpo do recurso `sites` e gerenciar `minTlsVersion=1.2` e `scmMinTlsVersion=1.2` em `Microsoft.Web/sites/config@2024-11-01`, recurso `web`, por `azapi_update_resource`. Preservar `httpsOnly=true`, HTTP/2, OIDC, as políticas SCM/FTP desabilitadas e todas as demais propriedades da ADR 0016.

A mudança exige adicionar exclusivamente `Microsoft.Web/sites/config/read` e `Microsoft.Web/sites/config/write` à Custom Role do provisionador no mesmo Resource Group. O delta não inclui DataActions, curingas, IAM write, credenciais de publicação, Contributor ou Owner. A matriz proposta fica separada do baseline efetivo até aprovação humana específica.

Aplicar somente após Plan protegido cujo manifesto contenha a criação lógica de `function_tls_config` e a reconciliação do site sem delete ou replacement. Verificar ambos os valores por `config/web`, executar novo Plan e exigir idempotência. O rollback restaura o baseline de 40 Actions e a modelagem anterior no mesmo PR de reversão; não remover TLS efetivo durante a reversão.

## Consequences

Terraform passa a usar a superfície ARM que persiste e devolve os limites de TLS do Flex, eliminando o update perpétuo sem ignorar o controle. O endpoint SCM também fica explicitamente limitado a TLS 1.2, independentemente de credenciais básicas continuarem desabilitadas.

O provisionador recebe duas Actions adicionais no escopo já existente. Embora restritas ao tipo `sites/config`, elas permitem alterar outras configurações desse filho em qualquer Function dentro do Resource Group; esse risco residual é menor que papéis genéricos, mas exige aprovação e auditoria do delta efetivo. A decisão não cria capacidade, altera SKU, ativa campanhas, envia Web Push ou adiciona custo direto.
