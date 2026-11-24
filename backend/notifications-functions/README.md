# Backend de notificações

Backend serverless do Web Push em Azure Functions 4.x com worker isolado e .NET 10 LTS. Nesta etapa, ele expõe somente `GET /api/health`; persistência, inscrição, filas e envio não fazem parte da implementação inicial.

## Decisões da base

- .NET 10 LTS foi escolhido por ter suporte GA no modelo isolado até novembro de 2028. No Linux, ele exige Flex Consumption; a infraestrutura e os limites de consumo são definidos separadamente nas issues de Terraform.
- `Azure.Functions.Sdk` 1.1.0, worker 2.52.0 e extensão HTTP ASP.NET Core 2.1.1 foram fixados após consulta à documentação Microsoft e ao feed oficial NuGet em 24/11/2026.
- As opções tipadas contêm apenas nome do serviço e ambiente. Segredos, inscrições e configuração VAPID não pertencem ao repositório nem ao `local.settings.json`.
- O health check retorna apenas estado e nome estável do serviço; não expõe versão de pacote, configuração, identidade, host, dependências ou credenciais.

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
