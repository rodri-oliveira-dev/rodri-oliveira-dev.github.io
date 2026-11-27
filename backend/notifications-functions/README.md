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

Cada geração também guarda `recoveryEpoch`, configurada fora do container. Após restauração, a epoch deve ser rotacionada antes de qualquer troca do endpoint Cosmos; dados recuperados com epoch anterior ficam inelegíveis e devem ser descartados. Como o backup não prova revogações posteriores ao snapshot, a recuperação exige novo opt-in em vez de reativar inscrições.

## Cancelamento, recuperação e concorrência (#153)

`DELETE /api/subscriptions` recebe identificador e capacidade apenas no corpo JSON, evitando que identificadores apareçam na URL e na telemetria HTTP de plataforma. Os hashes de cancelamento e recuperação são sempre calculados e comparados em tempo constante. ID ausente, capacidade incorreta, segunda exclusão e sucesso retornam o mesmo `202`, sem enumerar registros.

A revogação substitui atomicamente o estado com ETag antes da tentativa de delete físico. Se o delete falhar, o documento revogado permanece inelegível e expira por TTL curto; retry continua idempotente. `404`/`410` do provedor seguem a mesma ordem fail-closed: invalidam condicionalmente a geração e ETag observadas antes do delete, preservando uma eventual geração concorrente. O sender relê o registro antes do POST; revogação/expiração que vencer antes da releitura impede envio. Não existe transação com o provedor externo: uma mensagem já aceita ou em trânsito não pode ser recolhida.

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

- payload JSON versionado (`version: 1`) em `pt-BR`, com `title`, `body`, URL absoluta da origem publicada e `expiresAtUtc` calculado pelo mesmo TTL de 24 horas aplicado ao transporte; tópico determinístico por campanha e timeout HTTP de 15 segundos;
- allowlist de push services conhecidos (FCM, Mozilla, Apple e Windows), somente HTTPS/443/DNS, sem userinfo, fragmentos ou redirects, bloqueando destinos arbitrários e SSRF;
- um item por lote, até duas instâncias, três dequeues e cinco minutos por execução conforme `host.json`/Terraform; retries internos da biblioteca ficam desabilitados;
- `404`/`410` removem a inscrição com ETag; demais `4xx` são permanentes; `408`, `429`, `5xx`, timeout e falha de rede são transitórios e fazem a Queue repetir até o limite, depois encaminhar à poison queue;
- logs contêm apenas ID validado da campanha e contagens agregadas, nunca endpoint, chaves, payload criptográfico ou resposta do push service.

Azure Queue oferece entrega *at least once*. O processor elimina IDs de inscrição repetidos dentro da execução e usa o mesmo tópico Web Push nas repetições, mas não promete exactly-once após timeout ou interrupção externa. Revisar a poison queue manualmente sem copiar seu conteúdo para issues ou logs.

## Publicações, campanhas e deduplicação (#162–#163)

`PublicationCampaignCoordinator` recebe um contrato já verificado de publicação do Pages: SHA completo, sequência monotônica, instante UTC, `refs/heads/main`, conclusão bem-sucedida e confirmação de que ainda é o deployment mais recente. Ele não consulta `HEAD`, APIs editoriais, RSS ou workflows de importação. A integração que produzirá essa evidência pertence à #164 e deve revalidá-la imediatamente antes da chamada.

`JsonArticleCatalogReader` lê exclusivamente os snapshots versionados dos catálogos LinkedIn/PT-BR, DEV/en e Hashnode/es-419 associados ao SHA publicado. A identidade `article_…` é SHA-256 Base64URL de versão do contrato, origem, idioma e URL canônica normalizada. Título, descrição, ordem, SEO, RSS e sitemap não fazem parte da identidade. A baseline preserva a união histórica das identidades, portanto exclusão e reaparecimento não recriam campanha. Na primeira execução, todos os artigos são registrados em modo seed e nenhum backlog é criado. A política de elegibilidade é um componente separado e aceita somente LinkedIn `pt-BR`; EN/ES nunca criam campanha ou estado de destinatário.

A campanha usa `campaign_…` determinístico por artigo. O SHA da publicação efetiva, origem, idioma, URL canônica, cutoff de audiência, estado e timestamps ficam no documento. O destino do payload continua sendo a raiz segura do portfólio; a URL externa identifica o conteúdo, mas não amplia a allowlist do Service Worker.

### Modelo Cosmos DB

O container Serverless existente e a partition key `/partitionKey` são reutilizados, sem novo recurso ou throughput reservado:

| Documento | Partition key | Padrão de acesso e cardinalidade |
| --- | --- | --- |
| `publication-baseline` | `publication-baseline` | point read e create/replace com ETag uma vez por reconciliação; um documento com a união de IDs editoriais |
| `campaign` | `campaign:<campaignId>` | point read/create condicional; um por artigo PT-BR elegível |
| `campaign-delivery` | mesma partição da campanha | point read/create/replace por campanha + inscrição + geração; até aproximadamente o número de inscritos existentes no cutoff, inicialmente até 100 |

Campanha e entregas ficam colocalizadas para permitir evolução com transactional batch dentro da campanha. A baseline fica isolada porque tem padrão global e baixa cardinalidade; Cosmos DB não oferece atomicidade cross-partition. Por isso as campanhas são criadas primeiro e a baseline avança somente por ETag após todas as criações. Falha antes desse avanço repete creates condicionais e não perde campanha. A evidência `IsLatestSuccessfulDeployment`, a sequência e a exclusão operacional de releases impedem promover uma revisão superada; uma integração que não consiga comprovar isso deve falhar fechada.

O fluxo normal usa point reads — cerca de 1 RU para itens de 1 KiB — e writes pequenos, cujo custo varia com tamanho e indexação. Não foram adicionados índices, containers, serviços ou throughput. A baseline cresce linearmente com o total histórico de artigos e permanece muito abaixo do limite de item no volume esperado; antes de escala material, #165 deve medir `RequestCharge`, tamanho e hot partition. O fan-out cresce com campanhas × inscrições, mas cada campanha distribui suas próprias chaves e o MVP limita escala/concorrência. Manter o índice atual evita mudança declarativa e risco operacional desproporcional; otimização futura exige métricas reais.

### Máquina de estados de entrega

O ID de entrega deriva de inscrição pseudonimizada + geração. O documento não contém endpoint, chaves, capacidades ou payload. O claim condicional impede dois workers de vencerem; ETags protegem todas as transições:

`Claimed → Sending → Succeeded | TransientFailure | PermanentFailure | SubscriptionExpired | OutcomeUnknown`

`Claimed → Cancelled` quando revogação, expiração, geração ou recovery epoch falha na releitura final. Claims expirados antes de `Sending` podem ser retomados. `TransientFailure` com resposta conhecida pode ser reprocessada. `Sending` expirado nunca é retomado automaticamente: vira `OutcomeUnknown`, porque o provedor pode ter aceitado a mensagem antes de timeout, reinício ou falha de persistência. Isso oferece deduplicação persistente e concorrente no backend, com possível perda deliberada sob incerteza; não oferece exactly-once no Web Push.

`AudienceCutoffUtc` impede geração criada depois da campanha de receber conteúdo antigo. A releitura existente ainda exige status ativo, expiração futura, geração e `recoveryEpoch` atuais imediatamente antes de `Sending`. Revogação posterior ao início do transporte não recolhe mensagem em trânsito.

Os testes usam stores concorrentes controlados e exercitam o algoritmo real de create/replace/ETag, sem Azure, em vez de mocks que apenas retornam sucesso. Nenhum enqueue ou envio real fez parte de #162–#163.

## Pós-release, enqueue e reconciliação (#164–#165)

O workflow reutilizável `web-push-post-release.yml` valida o último deployment bem-sucedido do Environment `github-pages`, a GitHub Release não draft/não prerelease e a resolução da tag para o mesmo SHA. Os catálogos são lidos do checkout desse SHA, nunca do `HEAD` atual. Push, merge e importação editorial não invocam esse workflow; a integração normal ocorre depois dos jobs `pages_smoke`, `tag` e `release`. O workflow manual `reconcile-web-push.yml` resolve o mesmo registro durável e não executa Terraform, deploy de backend ou Pages.

O modo padrão é `dry-run`: valida evidência e conta os três catálogos, sem OIDC ou acesso de escrita à Azure. O modo `enqueue` exige confirmação `ENQUEUE`, fechamento de #155 e #156 e os dois switches de Environment `WEB_PUSH_REAL_PROCESSING_ENABLED=true` e `WEB_PUSH_SENDER_ENABLED=true`. Enquanto qualquer controle faltar, o gate falha antes da autenticação Azure. O Queue Trigger continua desabilitado declarativamente; alterar esse kill switch pertence aos gates posteriores.

No modo real, responsabilidades e credenciais não se misturam:

1. a identidade coordenadora acessa somente o container Cosmos existente, executa o detector/baseline, cria campanhas idempotentes e reivindica no máximo 25 campanhas por rodada;
2. um artifact efêmero de um dia contém somente IDs determinísticos de campanha, claim opaco, tentativa e lease;
3. a identidade de enqueue possui somente `Storage Queue Data Message Sender` na fila `web-push-campaigns` e escreve apenas o ID validado;
4. a identidade coordenadora persiste sucesso ou classe fixa de falha, sem mensagem de exceção, endpoint, inscrição, chave ou capacidade.

O claim usa ETag e lease de 10 minutos. Há até três tentativas, backoff exponencial de 30 segundos limitado a 15 minutos e limite global de 25 por rodada. Autorização, throttling, falha transitória, timeout/resultado incerto e falha permanente são classes fechadas. Interrupção antes do enqueue libera o claim por expiração; falha após o enqueue e antes da confirmação pode repetir a mensagem. A fila é *at least once* e o sender preserva a deduplicação por campanha/inscrição; não há promessa de exactly-once. Campanhas ausentes do catálogo PT-BR publicado ou vinculadas a sequência futura são esgotadas sem enqueue. Reinício do processo não perde o estado Cosmos.

Os resumos do GitHub Actions registram artigos por idioma, elegíveis, criados, deduplicados, pendentes, claims, mensagens, falhas, reconciliação, limite e duração. Os logs estruturados do backend usam somente contagens e classes estáveis; IDs de inscrição, endpoints e capacidades não são dimensões. Consultas e validações operacionais estão em [`docs/privacy/web-push/notification-operations.md`](../../docs/privacy/web-push/notification-operations.md). Testes locais não comprovam propagação RBAC, ingestão, retenção efetiva, RU, profundidade de fila ou custo; essas evidências permanecem em #156 e #167.
