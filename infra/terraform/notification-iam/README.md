# IAM declarativo do pós-release Web Push

Este root isolado propõe duas identidades OIDC sem segredo para o Environment protegido `web-push-notifications-dev`:

- `campaign_coordinator`: função Cosmos customizada somente no container `notifications/subscriptions`, com metadata, query/change feed e create/read/replace de itens, sem delete, necessária para baseline, campanhas, claims e reconciliação;
- `queue_sender`: `Storage Queue Data Message Sender` somente em `web-push-campaigns`, cujo único `DataAction` é adicionar mensagem.

Ambas usam o subject imutável do repositório e do Environment. A release normal não referencia este State nem aplica este root. Nenhum workflow deste repositório executa `plan` autenticado, `apply` ou `import` para ele. Criação das aplicações, credenciais federadas, atribuições e variáveis do Environment exige revisão e autorização humana posteriores; as issues #155 e #156 abertas e os switches `WEB_PUSH_REAL_PROCESSING_ENABLED` e `WEB_PUSH_SENDER_ENABLED` mantêm o fluxo real bloqueado.

O root reutiliza o Entra ID, Cosmos DB, Storage Account, fila e container já previstos. Aplicar as quatro entidades de identidade/RBAC não adiciona serviço de runtime nem custo direto conhecido, mas propagação de RBAC, consumo de RU, transações de fila, execução de Functions e ingestão de logs continuam mensuráveis. Validar o plano efetivo e os custos na fase operacional; configuração declarativa não comprova permissões, retenção nem custo reais.
