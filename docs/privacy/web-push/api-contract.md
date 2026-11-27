# Contrato interno da API de inscrições Web Push

Status: implementado e testável localmente nas issues #152–#154; endpoints desabilitados por configuração até os gates humanos posteriores.

Base URL prevista: `https://<function-host>/api`. O host real, endpoints Web Push, chaves e capacidades nunca devem ser copiados para documentação, issues ou logs.

## Registrar — `POST /subscriptions`

Requer `Content-Type: application/json`. Corpo máximo: 8 KiB. Campos desconhecidos, casing alternativo, valores nulos e contratos fora da versão aprovada são rejeitados.

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/example-only",
  "keys": { "p256Dh": "<base64url-p256-public-key>", "auth": "<base64url-16-bytes>" },
  "locale": "pt-BR",
  "purposeId": "new-articles-pt-br",
  "consentVersion": "1.0.0",
  "privacyNoticeVersion": "draft-1",
  "consentGranted": true,
  "consentMethod": "explicit-button"
}
```

`201 Created` devolve `subscriptionId`, `cancellationCapability`, `recoveryCapability` e `expiresAtUtc`. As duas capacidades independentes de 256 bits são devolvidas em claro uma única vez; o servidor conserva somente hashes separados por domínio.

Repetir o mesmo endpoint não substitui chaves, consentimento, validade nem capacidades. A resposta é `202 Accepted`, sem identificador ou segredo. Essa semântica torna o efeito idempotente sem armazenar capacidades reversíveis ou permitir replay da resposta secreta. Uma resposta `201` perdida não autoriza reinscrição não autenticada; o tratamento posterior usa capacidade existente, atendimento manual proporcional ou expiração.

## Revogar ou recuperar — `DELETE /subscriptions`

Corpo máximo: 512 bytes. O identificador fica no corpo para não entrar na URL de telemetria.

```json
{
  "subscriptionId": "sub_<opaque-value>",
  "capability": "<cancellation-or-recovery-capability>"
}
```

Sucesso, registro ausente, capacidade incorreta, registro já removido e identificador sintaticamente inválido retornam `202 Accepted`. A operação não confirma a existência do registro. Corpo malformado retorna `400`; abuso retorna `429` com `Retry-After`; dependência indisponível ou timeout retorna `503` sem detalhes internos.

## CORS, segurança e erros

- CORS aceita exatamente `https://rodri-oliveira-dev.github.io`; não aceita credenciais e não substitui a capacidade de revogação.
- A allowlist de destino aceita somente FCM, Mozilla, Apple e WNS conhecidos, em HTTPS/443, DNS, sem userinfo, fragmento ou redirect.
- Respostas incluem `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` e `Referrer-Policy: no-referrer`.
- Nenhuma resposta reflete endpoint, chave, capacidade, IP, exceção, ETag ou metadado Cosmos.
- O Diagnostic Setting exclui `AppServiceHTTPLogs`/`allLogs` e mantém somente `FunctionAppLogs` e `AppServicePlatformLogs`; a retenção efetiva das tabelas gerenciadas ainda precisa ser comprovada no ambiente.
- Os kill switches `AzureWebJobs.register-subscription.Disabled`, `AzureWebJobs.revoke-subscription.Disabled` e `AzureWebJobs.ProcessWebPushCampaign.Disabled` permanecem `true`.

## Rate limiting e FinOps

Cada requisição já validada tenta criar o contador da janela ou, quando ele já existe, faz um patch atômico no container Cosmos antes da operação principal. Dezesseis shards determinísticos evitam um documento global quente; cada shard aceita quatro registros ou oito revogações por minuto. O limite é global aproximado, não uma promessa exata por pessoa ou IP. Falha do contador bloqueia a operação.

O controle não persiste IP e não cria serviço Azure. Ataques distribuídos ainda podem consumir RU em tentativas negadas e distribuir chaves entre shards. Escala máxima de duas instâncias, concorrência local, limites de corpo, timeout, validação anterior à persistência, point reads e kill switches formam as demais camadas. Custo real, quotas e retenção de 30 dias precisam ser comprovados novamente no ambiente antes do piloto.

## Consistência e corridas

Cosmos usa consistência de sessão. Criação condicional e replace/delete com ETag protegem o registro individual; não há transação distribuída com provedores Web Push. O sender filtra por estado/expiração e relê ID + geração imediatamente antes do transporte. Revogação que vencer antes da releitura impede o envio; depois do POST, a mensagem pode estar aceita ou em trânsito e não pode ser recolhida. `404`/`410` excluem somente a geração e ETag observadas. Deduplicação persistente de campanha continua pertencendo à #163 e não foi antecipada.
