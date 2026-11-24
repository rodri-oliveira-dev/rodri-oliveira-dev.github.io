# Backend de notificações

Backend serverless do Web Push em Azure Functions 4.x com worker isolado e .NET 10 LTS. Nesta etapa, ele expõe somente `GET /api/health`; persistência, inscrição e envio ainda não fazem parte da implementação.

## Decisões da base

- .NET 10 LTS foi escolhido por ter suporte GA no modelo isolado até novembro de 2028. No Linux, ele exige Flex Consumption; a infraestrutura e os limites de consumo são definidos separadamente nas issues de Terraform.
- `Azure.Functions.Sdk` 1.1.0, worker 2.52.0 e extensão HTTP ASP.NET Core 2.1.1 foram fixados após consulta à documentação Microsoft e ao feed oficial NuGet em 24/11/2026.
- As opções tipadas contêm apenas nome do serviço e ambiente. Segredos, inscrições e configuração VAPID não pertencem ao repositório nem ao `local.settings.json`.
- O health check retorna apenas estado e nome estável do serviço; não expõe versão de pacote, configuração, identidade, host, dependências ou credenciais.
- O `host.json` limita o futuro Queue Trigger a lote unitário, três tentativas e execução de cinco minutos. A fila e a identidade são modeladas no Terraform, mas nenhum consumidor ou envio real existe até a #147.

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

O ID é o SHA-256 hexadecimal do endpoint normalizado. A partition key `v1-xx` usa os dois primeiros dígitos do hash, distribuindo gravações em até 256 valores sem impedir point reads, pois ID e partição são derivados localmente. O repositório não executa consultas cross-partition: leitura e exclusão usam ID + partition key, criação trata conflito `409`, e atualização/exclusão exigem ETag para detectar `412 Precondition Failed`. Duplicatas sem ETag não sobrescrevem consentimento existente.

O container habilita TTL por item com `default_ttl = -1`, mas novos documentos não recebem `ttl`. Isso permite aplicar expiração depois sem recriar o container, enquanto preserva a exigência da ADR-0006: nenhum prazo é inventado antes da aprovação humana da política de retenção. Endpoints rejeitados poderão ser removidos explicitamente pelo sender da #147.

O SDK Cosmos usa `DefaultAzureCredential` e a identidade gerenciada indicada por `AZURE_CLIENT_ID`; não existem chaves ou connection strings. Os testes usam store em memória, endpoints reservados `.test` e chaves geradas durante a execução, sem credenciais, rede ou dados reais.
