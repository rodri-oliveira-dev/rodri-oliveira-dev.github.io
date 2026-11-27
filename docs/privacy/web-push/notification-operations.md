# Operação de campanhas Web Push

## Fluxos permitidos

`Release and Deploy` chama o pós-release somente após Pages smoke, tag e GitHub Release. O modo padrão `dry-run` consulta apenas APIs GitHub e o checkout do SHA publicado. `Reconcile Web Push notifications` é a recuperação manual: resolve a última publicação efetiva e não chama Terraform, deploy do backend ou Pages.

O caminho real permanece bloqueado enquanto #155 ou #156 estiver aberta, a confirmação não for `ENQUEUE`, ou os switches `WEB_PUSH_REAL_PROCESSING_ENABLED` e `WEB_PUSH_SENDER_ENABLED` não forem ambos `true`. Não alterar Environment, credenciais, RBAC ou kill switches como parte de uma reexecução de recuperação.

## Contratos e garantias

| Fronteira | Contrato |
| --- | --- |
| GitHub → coordenador | SHA completo, deployment Pages mais recente com status `success`, tag/release do mesmo commit, sequência pelo deployment ID e catálogos daquele checkout. |
| Coordenador → Cosmos | campanha determinística; create condicional; baseline avança por ETag depois das campanhas; claim de enqueue com lease e tentativa. |
| Coordenador → sender | artifact efêmero com ID de campanha, claim opaco, tentativa e lease; nenhum dado de assinante. |
| Sender → fila | corpo contém exclusivamente o ID validado; Entra ID; role `Storage Queue Data Message Sender` na fila individual. |
| Fila → Function | Queue Trigger privado; campanha e destinatários são resolvidos no Cosmos; deduplicação por campanha/inscrição/geração. |

O sistema tolera replays, concorrência e reinício por estado durável e ETags. Timeout após envio à fila pode resultar em uma segunda mensagem; timeout após iniciar Web Push vira `OutcomeUnknown` e não é reenviado automaticamente. Portanto, a garantia é processamento idempotente sob controle local com entrega *at least once* da fila, nunca exactly-once ponta a ponta.

## Limites e recuperação

- no máximo 25 campanhas por rodada e três tentativas de enqueue;
- lease de 10 minutos; backoff exponencial inicial de 30 segundos, limitado a 15 minutos;
- falhas classificadas como autorização, throttling, transitória, timeout/incerta ou permanente;
- campanha que não existe mais no catálogo PT-BR efetivamente publicado não é enfileirada;
- nova rodada retoma claims expirados e campanhas pendentes; sucesso persistido não é reivindicado novamente;
- falha do pós-release não desfaz Pages, tag ou GitHub Release já concluídos.

## Observabilidade e FinOps

O Job Summary registra artigos por idioma, campanhas elegíveis/criadas/deduplicadas/pendentes, claims, mensagens enfileiradas, falhas, esgotamento, limite e duração. `FunctionAppLogs`, `AppServicePlatformLogs`, diagnósticos `StorageRead/Write/Delete`, métrica `Transaction`, audit do Cosmos e métricas nativas já previstas alimentam Azure Monitor/Log Analytics. Não usar ID de campanha, inscrição, endpoint, capacidade, URL ou claim como dimensão de métrica.

Indicadores de consumo disponíveis para revisão operacional:

- `TotalRequestUnits` do Cosmos e request charge agregado;
- transações, ingress/egress e latência do Storage Queue;
- execuções, duração, falhas e memória da Function;
- volume ingerido/cobrado do Log Analytics, quota diária declarada de 0,1 GB e retenção declarada de 30 dias.

Esses nomes/categorias devem ser confirmados no ambiente antes de escrever consultas ou alertas definitivos. A configuração Terraform de 30 dias não comprova retenção por tabela nem ingestão. Não registrar como evidência valores simulados ou ausência de dados em mocks. #156 deve verificar permissões, categorias, tabelas, retenção, restauração, fila/poison, RU e custo; #167 mantém a decisão final.

## Desativação

1. manter `WEB_PUSH_REAL_PROCESSING_ENABLED=false` e `WEB_PUSH_SENDER_ENABLED=false`;
2. manter `AzureWebJobs.ProcessWebPushCampaign.Disabled=true`;
3. executar somente dry-run para diagnóstico;
4. preservar mensagens/campanhas para investigação sem copiar payloads ou dados pessoais para issues;
5. revogar a credencial federada ou role específica somente por operação IAM autorizada, sem reutilizar identidades de Terraform/backend.
