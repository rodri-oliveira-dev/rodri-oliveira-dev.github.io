# Backend de notificações

Backend serverless do Web Push em Azure Functions 4.x com worker isolado e .NET 10 LTS. A única rota HTTP é `GET /api/health`; persistência e envio são componentes internos, e não há endpoint público de inscrição ou publicação.

## Decisões da base

- .NET 10 LTS foi escolhido por ter suporte GA no modelo isolado até novembro de 2028. No Linux, ele exige Flex Consumption; a infraestrutura e os limites de consumo são definidos separadamente nas issues de Terraform.
- `Azure.Functions.Sdk` 1.1.0, worker 2.52.0 e extensão HTTP ASP.NET Core 2.1.1 foram fixados após consulta à documentação Microsoft e ao feed oficial NuGet em 24/11/2026.
- As opções tipadas contêm apenas nome do serviço e ambiente. Segredos, inscrições e configuração VAPID não pertencem ao repositório nem ao `local.settings.json`.
- O health check retorna apenas estado e nome estável do serviço; não expõe versão de pacote, configuração, identidade, host, dependências ou credenciais.
- O `host.json` limita o Queue Trigger privado a lote unitário, três tentativas e execução de cinco minutos. A fila e a identidade são modeladas no Terraform; testes não acessam serviços reais nem enviam notificações.

O desenho difere da Minimal API antes proposta para GCP: o processo agora usa o host Azure Functions, atributos de trigger e worker .NET isolado. A lógica continua registrada por DI e separada do adapter HTTP para permitir testes locais sem recursos Azure.

## Desenvolvimento local

Pré-requisitos:

- .NET SDK 10;
- Azure Functions Core Tools 4 para executar o host;
- Azurite apenas quando o host local exigir `AzureWebJobsStorage`.

Execute build e testes sem credenciais e sem conexão com a Azure:

```bash
dotnet restore backend/notifications-functions/Notifications.Functions.slnx
dotnet build backend/notifications-functions/Notifications.Functions.slnx --no-restore
dotnet test backend/notifications-functions/Notifications.Functions.slnx --no-build
```

Para iniciar o host local, copie `src/Notifications.Functions/local.settings.example.json` para `local.settings.json`, inicie o Azurite e execute `func start` no diretório do projeto. `local.settings.json` permanece local e não deve receber segredos.

## Persistência de inscrições (#146)

O contrato aceita exclusivamente endpoint HTTPS DNS na porta padrão, chave pública P-256 válida em Base64URL, segredo `auth` de 16 bytes, idioma `pt-BR`, instante UTC e versão de consentimento limitada. Endpoint e material criptográfico são tratados como dados pessoais: não aparecem em logs, IDs, mensagens de erro ou telemetria.

O ID é o SHA-256 hexadecimal do endpoint normalizado. A partition key `v1-xx` usa os dois primeiros dígitos do hash, distribuindo gravações em até 256 valores sem impedir point reads, pois ID e partição são derivados localmente. Leitura e exclusão usam ID + partition key, criação trata conflito `409`, e atualização/exclusão exigem ETag para detectar `412 Precondition Failed`. Duplicatas sem ETag não sobrescrevem consentimento existente. O sender enumera somente `pt-BR` em páginas de 25 por consulta cross-partition indexada; esse custo variável deve ser observado dentro do limite compartilhado de 400 RU/s.

O container habilita TTL por item com `default_ttl = -1`, mas novos documentos não recebem `ttl`. Isso permite aplicar expiração depois sem recriar o container, enquanto preserva a exigência da ADR-0006: nenhum prazo é inventado antes da aprovação humana da política de retenção. Endpoints rejeitados poderão ser removidos explicitamente pelo sender da #147.

O SDK Cosmos usa `DefaultAzureCredential` e a identidade gerenciada indicada por `AZURE_CLIENT_ID`; não existem chaves ou connection strings. Os testes usam store em memória, endpoints reservados `.test` e chaves geradas durante a execução, sem credenciais, rede ou dados reais.

## Sender Web Push e Queue Trigger (#147)

`ProcessWebPushCampaign` é exclusivamente um Queue Trigger da fila privada `web-push-campaigns`. A mensagem aceita apenas um ID em minúsculas; título, corpo e URL são resolvidos no catálogo confiável de configuração `NotificationCampaigns:<id>`. Não há trigger HTTP de envio, URL de destino ou segredo na fila. Enquanto nenhuma campanha for configurada, IDs desconhecidos são rejeitados sem envio; a integração do publicador pertence à #149.

O transporte usa `Lib.Net.Http.WebPush` 3.3.1 com VAPID e `aes128gcm`. As chaves pública e privada são lidas dos secrets `vapid-public-key` e `vapid-private-key` do Key Vault por Managed Identity e ficam somente em cache de memória por 15 minutos. Terraform guarda apenas URI e nomes dos secrets. Um operador autorizado deverá criar os valores diretamente no vault; nunca inserir a chave privada em app settings, GitHub, Terraform, State ou logs.

Controles operacionais e de segurança:

- payload JSON enxuto em `pt-BR`, TTL de 24 horas, tópico determinístico por campanha e timeout HTTP de 15 segundos;
- allowlist de push services conhecidos (FCM, Mozilla, Apple e Windows), somente HTTPS/443/DNS, sem userinfo, fragmentos ou redirects, bloqueando destinos arbitrários e SSRF;
- um item por lote, até duas instâncias, três dequeues e cinco minutos por execução conforme `host.json`/Terraform; retries internos da biblioteca ficam desabilitados;
- `404`/`410` removem a inscrição com ETag; demais `4xx` são permanentes; `408`, `429`, `5xx`, timeout e falha de rede são transitórios e fazem a Queue repetir até o limite, depois encaminhar à poison queue;
- logs contêm apenas ID validado da campanha e contagens agregadas, nunca endpoint, chaves, payload criptográfico ou resposta do push service.

Azure Queue oferece entrega *at least once*. O processor elimina IDs de inscrição repetidos dentro da execução e usa o mesmo tópico Web Push nas repetições, mas não promete exactly-once após timeout ou interrupção externa. Revisar a poison queue manualmente sem copiar seu conteúdo para issues ou logs.
