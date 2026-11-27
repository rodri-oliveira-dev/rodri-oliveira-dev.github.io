# Backend de notificações

Backend serverless do Web Push em Azure Functions 4.x com worker isolado e .NET 10 LTS. Além de `GET /api/health`, o pacote contém `POST /api/subscriptions` e `DELETE /api/subscriptions`. Os dois endpoints de ciclo de vida permanecem desabilitados por app settings; não há endpoint HTTP de publicação ou envio.

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

## Registro, consentimento e persistência (#152)

O contrato aceita exclusivamente provedores Web Push na allowlist, HTTPS/443/DNS, chave P-256 válida, `auth` de 16 bytes, idioma `pt-BR`, finalidade `new-articles-pt-br`, consentimento afirmativo `1.0.0`, aviso `draft-1` e método `explicit-button`. O servidor fixa o instante UTC e a expiração absoluta em 365 dias; dados operacionais nunca prorrogam esse prazo.

O identificador público opaco é `sub_` mais SHA-256 Base64URL do endpoint normalizado e também funciona como partition key, permitindo point reads de revogação. Ele é pseudonimizado, não anônimo. A criação condicional é a barreira de unicidade: um conflito nunca troca chaves, capacidades, evidência ou validade, mesmo sob concorrência.

Cada criação gera capacidades independentes de cancelamento e recuperação com 256 bits. O valor em claro é devolvido somente na resposta `201`; o documento guarda apenas hashes SHA-256 com separação de domínio. Uma tentativa duplicada recebe `202` sem ID ou capacidades e não recupera o segredo anterior. Essa é a estratégia de idempotência: repetir o comando tem efeito nulo e não exige persistir ou reexpor capacidades em claro. Se a resposta inicial for perdida, o cliente não deve tentar takeover; usa uma capacidade já conservada, o fluxo manual ou aguarda a expiração.

O container usa `defaultTtl = -1`, e cada inscrição recebe o TTL restante derivado de `expiresAtUtc`. A autorização nunca depende do TTL ou de `_ts`: listagem e revalidação imediatamente anterior ao transporte exigem estado ativo, ausência de revogação e validade futura.

## Cancelamento, recuperação e concorrência (#153)

`DELETE /api/subscriptions` recebe identificador e capacidade apenas no corpo JSON, evitando que identificadores apareçam na URL e na telemetria HTTP de plataforma. Os hashes de cancelamento e recuperação são sempre calculados e comparados em tempo constante. ID ausente, capacidade incorreta, segunda exclusão e sucesso retornam o mesmo `202`, sem enumerar registros.

A revogação substitui atomicamente o estado com ETag antes da tentativa de delete físico. Se o delete falhar, o documento revogado permanece inelegível e expira por TTL curto; retry continua idempotente. `404`/`410` do provedor apagam somente a geração e ETag observadas, preservando uma eventual geração concorrente. O sender relê o registro antes do POST; revogação/expiração que vencer antes da releitura impede envio. Não existe transação com o provedor externo: uma mensagem já aceita ou em trânsito não pode ser recolhida.

## API pública e antiabuso (#154)

- JSON estrito, sem campos desconhecidos, corpo máximo de 8 KiB (512 bytes na revogação), profundidade limitada e respostas genéricas;
- CORS apenas para `https://rodri-oliveira-dev.github.io`, sem credenciais; requisições sem `Origin` continuam possíveis porque CORS não é autenticação;
- deadline de 10 segundos, concorrência local máxima de oito e escala Flex já limitada a duas instâncias;
- rate limiting global aproximado no Cosmos, em janelas de 60 segundos e 16 shards determinísticos, com create/patch atômico, TTL e falha fechada. O limite por shard é quatro registros e oito revogações; não se afirma limite global exato;
- logs da API usam apenas eventos fixos e nunca anexam exceções, request, endpoint, chaves, capacidades, IDs, headers ou IP. Azure Monitor permanece configurado em 30 dias, mas exceções de tabelas gerenciadas ainda exigem comprovação antes de produção.

O contador Cosmos evita depender exclusivamente da memória distribuída e reutiliza o serviço existente. Ataques ainda consomem uma operação de patch por tentativa e podem distribuir chaves entre shards; limites de escala, corpo, timeout e o kill switch reduzem esse risco. APIM, WAF ou outro serviço não foram adicionados por custo e escopo.

O SDK Cosmos usa `DefaultAzureCredential` e a identidade gerenciada indicada por `AZURE_CLIENT_ID`; não existem chaves ou connection strings. Os testes usam store em memória, endpoints reservados `.test` e chaves geradas durante a execução, sem credenciais, rede ou dados reais.

## Sender Web Push e Queue Trigger (#147)

`ProcessWebPushCampaign` é exclusivamente um Queue Trigger da fila privada `web-push-campaigns`. A mensagem aceita apenas um ID em minúsculas; título, corpo e URL são resolvidos no catálogo confiável de configuração `NotificationCampaigns:<id>`. Não há trigger HTTP de envio, URL de destino ou segredo na fila. O primeiro deploy define `AzureWebJobs.ProcessWebPushCampaign.Disabled=true`, portanto nenhuma mensagem é processada mesmo se a fila receber dados inesperados. Registro e revogação também possuem kill switches independentes. Qualquer ativação pertence aos gates posteriores de privacidade, piloto e produção; a #150 não remove esses controles.

O transporte usa `Lib.Net.Http.WebPush` 3.3.1 com VAPID e `aes128gcm`. As chaves pública e privada são lidas dos secrets `vapid-public-key` e `vapid-private-key` do Key Vault por Managed Identity e ficam somente em cache de memória por 15 minutos. Antes de disponibilizar o par ao transporte, o runtime valida Base64URL canônico, tamanhos P-256 e correspondência criptográfica em tempo constante; falhas geram somente erro genérico, sem material de chave. Terraform guarda apenas URI e nomes dos secrets. Um operador autorizado deverá criar os valores diretamente no vault; nunca inserir a chave privada em app settings, GitHub, Terraform, State ou logs.

Controles operacionais e de segurança:

- payload JSON enxuto em `pt-BR`, TTL de 24 horas, tópico determinístico por campanha e timeout HTTP de 15 segundos;
- allowlist de push services conhecidos (FCM, Mozilla, Apple e Windows), somente HTTPS/443/DNS, sem userinfo, fragmentos ou redirects, bloqueando destinos arbitrários e SSRF;
- um item por lote, até duas instâncias, três dequeues e cinco minutos por execução conforme `host.json`/Terraform; retries internos da biblioteca ficam desabilitados;
- `404`/`410` removem a inscrição com ETag; demais `4xx` são permanentes; `408`, `429`, `5xx`, timeout e falha de rede são transitórios e fazem a Queue repetir até o limite, depois encaminhar à poison queue;
- logs contêm apenas ID validado da campanha e contagens agregadas, nunca endpoint, chaves, payload criptográfico ou resposta do push service.

Azure Queue oferece entrega *at least once*. O processor elimina IDs de inscrição repetidos dentro da execução e usa o mesmo tópico Web Push nas repetições, mas não promete exactly-once após timeout ou interrupção externa. Revisar a poison queue manualmente sem copiar seu conteúdo para issues ou logs.
