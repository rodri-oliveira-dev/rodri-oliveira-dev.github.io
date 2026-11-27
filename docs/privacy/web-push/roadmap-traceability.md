# Rastreabilidade do gate LGPD

## Divergências da arquitetura atual

| Evidência na `main` em 26/11/2026 | Divergência | Destino |
| --- | --- | --- |
| `ConsentVersionPattern` aceita qualquer identificador válido; não há finalidade. | Exigir `1.0.0` exato, `purposeId`, aviso exibido e evidência associada à geração. | #152 |
| Documento possui consentimento e `ttl`, mas não `expiresAtUtc`, status, geração nem capacidades. | Implementar validade absoluta, estados e hashes de duas capacidades. | #152–#153 |
| `TimeToLiveSeconds = null`; `defaultTtl = -1`. | TTL está preparado, mas não remove nada. Deve ser limpeza derivada de `expiresAtUtc`, nunca renovação por `_ts`. | #153 |
| `ListByLocalePageAsync` filtra somente `locale`. | Revogada/expirada pode ser selecionada; filtrar e revalidar atomicamente antes do envio. | #153 e #163 |
| Upsert atual pode substituir consentimento/chaves com ETag e atualiza `UpdatedAtUtc`. | Operação não pode renovar validade nem permitir takeover; renovação deve ser comando explícito. | #152–#153 |
| Sender remove `404`/`410` por endpoint + ETag. | Preservar, acrescentando geração e conflito seguro com renovação. | #153/#163 |
| Deduplicação atual é `HashSet` apenas por página/execução. | Não impede retry/replay; persistir claim por artigo + geração antes de enviar. | #163 |
| Logs do sender usam campanha e contadores, sem endpoint/chaves. | Base boa; revisar exceções, HTTP pipeline, tracing, headers, IP e logs de plataforma. | #154/#165 |
| Log Analytics usa `retentionInDays=30`. | Azure pode manter 31 dias e tabelas específicas por 90; requisito estrito ainda não está comprovado. | #154/#165 e eventual issue de IaC autorizada |
| Cosmos em Brazil South, backup LRS 4 h/8 h; demais recursos Azure regionais. | Não elimina plano de controle, suporte, subprocessadores ou provedores push internacionais. | #156/#167 e revisão jurídica |
| Apenas `GET /api/health`; kill switch `true`; fila sem produtor externo. | Mantém o gate seguro. Não remover até gates posteriores e autorização explícita. | #152–#167 |
| Não há budget no Resource Group, identidade de enqueue nem produtor. | Definir budget/alertas e OIDC/RBAC mínimo antes do piloto; nenhum endpoint público de enqueue. | #164–#166 |

## Ajustes de aceite por issue

### #152 — registro e consentimento

- aceitar exclusivamente versão `1.0.0` e finalidade `new-articles-pt-br`;
- atribuir UTC no servidor, `expiresAtUtc` absoluto, `consentId` e geração;
- preservar evidência imutável e histórico de texto sem IP/fingerprint;
- gerar capacidade de dispositivo e recuperação independentes, armazenando somente hashes;
- impedir overwrite/takeover de inscrição ativa e não revelar existência;
- não ativar endpoint em produção nem remover kill switch.

### #153 — cancelamento e expiração

- aceitar uma das duas capacidades por canal que não seja URL e comparar em tempo constante;
- revogar atomicamente e tornar inelegível antes da exclusão física;
- implementar `expiresAtUtc` como fonte de verdade e TTL restante recalculado sem prorrogação;
- cobrir corrida envio/revogação/renovação/`404`/`410`, restauração de backup e reinscrição;
- não prometer cancelamento de mensagem entregue ou em trânsito.

### #154–#156 — antiabuso, aviso e gate

- sanitizar logs de aplicação e plataforma, capacidades, headers, exceções, IP e URLs;
- demonstrar retenção de 30 dias por tabela ou registrar exceção jurídica antes da produção;
- publicar a minuta somente após revisão jurídica e com `sitemap.xml` conforme `AGENTS.md`;
- #156 deve validar contratos/transferências, canal, atendimento manual, incidentes e expiração, sem tratar aprovação da #151 como go-live.

### #157–#161 — navegador e UX

- #158 exibe texto `1.0.0` e aviso antes da permissão nativa; sem consentimento ou resubscribe automático;
- #159 guarda capacidade com menor exposição, oferece exportação segura da recuperação e trata perda/rota manual;
- testes cobrem revogação parcial, armazenamento limpo, dispositivo perdido e renovação após 365 dias;
- #160/#161 não registram screenshots, endpoints ou credenciais.

### #162–#167 — campanha, enqueue, observabilidade e produção

- #163 persiste deduplicação por artigo + geração e faz claim atômico somente para inscrição ativa/não expirada;
- #164 usa identidade OIDC segregada com permissão mínima para uma fila e mantém dry-run; nenhuma identidade humana ampla ou endpoint HTTP de enqueue;
- #165 limita retries/fan-out, sanitiza métricas, valida retenção e alerta custo/ingestão sem PII;
- #166 confirma budget e alertas, revisão jurídica, transferências, kill switch e piloto apenas com dispositivos autorizados;
- #167 exige evidência de todos os bloqueios, go/no-go humano e PR separado para eventual status de ADR.

## Rastreabilidade de requisitos

| Requisito aprovado | ADR/doc | Implementação | Gate |
| --- | --- | --- | --- |
| Finalidade PT-BR, sem perfil/cadastro | ADR 0006; consent `1.0.0` | #152, #158, #162 | #156/#167 |
| Consentimento demonstrável e versionado | consent `1.0.0` | #152/#158 | #156 |
| 365 dias e renovação explícita | retenção | #152/#153/#159 | #156 |
| Cancelamento + recuperação | retenção | #152/#153/#159 | #156/#161 |
| Logs 30 dias e sanitização | inventário | #154/#165 | #156/#167 |
| Transferências internacionais | inventário/matriz | revisão jurídica e #155 | #156/#167 |
| Direitos e incidentes | retenção/direitos | #153–#155 | #156/#167 |
| Deduplicação e enqueue mínimo | ADR 0005/0012 | #163/#164 | #167 |
| Budget/alertas | ADR 0009 e risco #150 | #165/#166 | #167 |

## Riscos da #150 que permanecem

Deduplicação at-least-once, autorização mínima de enqueue, budget/alertas, transferências internacionais, segredo VAPID temporariamente em memória e endpoints Azure com rede pública não foram resolvidos pelo aceite da #150. A decisão de rede privada tem impacto de custo/complexidade e exige avaliação arquitetural e FinOps separada; este gate não a adota implicitamente.

## Evidência de implementação das issues #152–#154

| Critério | Implementação/teste | Estado e limite |
| --- | --- | --- |
| Consentimento `1.0.0`, finalidade PT-BR e evidência | `WebPushSubscriptionValidator`, `SubscriptionDocument` e testes de validação/repositório | Implementado; aviso ainda é minuta e não autoriza produção. |
| 365 dias, TTL derivado e inelegibilidade | `CosmosSubscriptionRepository`, query ativa e releitura antes do transporte | Implementado sem usar TTL como autorização. |
| Idempotência e takeover | create condicional, resposta duplicada sem segredos e testes de alteração concorrente | Implementado; renovação autenticada ficará para fluxo futuro e exige novo consentimento. |
| Capacidades e recuperação | duas capacidades CSPRNG de 256 bits, hashes por domínio e comparação constante | Implementado; frontend e atendimento manual permanecem nas issues posteriores. |
| Revogação, falha parcial e `404`/`410` | replace com ETag antes do delete e exclusão condicionada a geração | Implementado; mensagem já em trânsito não é recuperável. |
| SSRF e validação estrita | allowlist compartilhada pelo registro e sender; JSON/corpo limitados | Implementado para provedores documentados. Mudança de provedor exige revisão da allowlist. |
| Rate limiting distribuído | contadores Cosmos shardados, atômicos, temporários e fail-closed; teste do adapter | Implementado sem serviço novo; limite é aproximado e tentativa negada ainda consome RU. |
| CORS, timeout e erros | origem exata, preflight, deadline, headers seguros e respostas genéricas | Implementado; CORS não é autenticação. |
| Sanitização e retenção | logs fixos sem exception/request; ID fora da URL; diagnóstico sem `allLogs`/HTTP; teste sem dados sensíveis | Aplicação/IaC implementadas. Retenção/tabelas gerenciadas de 30 dias exigem prova Azure antes da produção. |
| Kill switch | três app settings `Disabled=true` e asserção Terraform | Preservado; nenhuma inscrição pública, deploy ou envio foi habilitado. |
