# Rastreabilidade do gate LGPD

**Atualização aprovada pelo responsável em 27/11/2026, efetiva após merge do PR desta revisão:** a [ADR 0022](../../adr/0022-consolidar-privacidade-web-push-antes-do-piloto.md) distingue testes isolados, piloto individual e abertura pública. A revisão jurídica formal integral fica antes da abertura pública; para o piloto, permanece obrigatória avaliação documentada das obrigações aplicáveis ao fluxo efetivamente usado, inclusive transferências, aviso, segurança e retenção. Nenhum requisito legal é dispensado e nenhuma ativação é autorizada por este documento.

## Sequenciamento aprovado em 27/11/2026

A [ADR 0022](../../adr/0022-consolidar-privacidade-web-push-antes-do-piloto.md) reorganiza a ordem de execução: #157–#165 precedem #155 e #156, que continuam obrigatórias antes de #166 (piloto real) e #167 (produção). A minuta e o consentimento versionado podem ser usados em testes isolados com mocks, sem permissões, inscrição, enqueue ou entrega reais. Não há dispensa de requisitos legais, mudança de política de retenção, aprovação jurídica ou autorização de lançamento. As evidências históricas de #151–#154 permanecem válidas no escopo em que foram produzidas.

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
| Log Analytics usa `retentionInDays=30` e `immediatePurgeDataOn30Days=true`. | O workspace controlável foi endurecido, mas tabelas específicas podem manter 90 dias; requisito estrito ainda não está comprovado operacionalmente. | Gate obrigatório em #156, requisito em #165 e condição final em #167 |
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
- invalidar logicamente `404`/`410` antes do delete físico e deixar falha de delete inelegível;
- exigir `recoveryEpoch` externa ao backup, rotacioná-la após restore e solicitar novo opt-in em vez de reativar inscrição recuperada.

### #154–#156 — antiabuso, aviso e gate

- sanitizar logs de aplicação e plataforma, capacidades, headers, exceções, IP e URLs;
- demonstrar retenção de 30 dias por tabela ou registrar exceção jurídica antes da produção;
- publicar apenas a seção candidata claramente identificada e desativada em release autorizada; aprovar aviso aplicável ao piloto antes de coleta, e aviso definitivo antes da abertura pública; manter `sitemap.xml` conforme `AGENTS.md`;
- #156 deve validar contratos/transferências, canal, atendimento manual, incidentes e expiração, sem tratar aprovação da #151 como go-live.

### #157–#161 — navegador e UX

- #158 exibe texto `1.0.0` e aviso antes da permissão nativa; sem consentimento ou resubscribe automático;
- #159 guarda capacidade com menor exposição, oferece exportação segura da recuperação e trata perda/rota manual;
- testes cobrem revogação parcial, armazenamento limpo, dispositivo perdido e renovação após 365 dias;
- #160/#161 não registram screenshots, endpoints ou credenciais.

### #162–#167 — campanha, enqueue, observabilidade e produção

- #162 detecta identidades nos três catálogos publicados, faz seed sem backlog e mantém a distribuição separada e exclusiva para PT-BR;
- #163 persiste baseline, campanha e deduplicação por artigo + inscrição + geração; o claim precede `Sending`, e resultado incerto é terminal sem retry automático;
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

### Evidência implementada em #164–#165

- pós-release usa deployment Pages + GitHub Release do mesmo SHA e nunca `HEAD` isoladamente;
- reconciliação manual reutiliza esse registro e não reexecuta Terraform, backend ou Pages;
- dry-run é o padrão sem autenticação Azure; o caminho real exige #155/#156 fechadas, confirmação e dois switches;
- identidade coordenadora e sender da fila são separadas; o sender recebe somente permissão de adicionar mensagem na fila exata;
- campanhas usam claim/ETag, lease, três tentativas, backoff limitado e no máximo 25 itens por rodada;
- mensagens duplicadas permanecem possíveis entre enqueue e confirmação; a deduplicação persistente do sender limita efeitos, sem promessa de exactly-once;
- resumos e logs usam contagens e classes estáveis, sem identificadores de assinantes, endpoints ou capacidades.

Permissões/credenciais reais, propagação RBAC, ingestão e retenção efetivas, RU, transações/fila, custo, alertas, restauração e piloto continuam sem comprovação operacional. Validar em #156 e #167; não inferir execução a partir do Terraform versionado.

## Evidência de implementação das issues #152–#154

| Critério | Implementação/teste | Estado e limite |
| --- | --- | --- |
| Consentimento `1.0.0`, finalidade PT-BR e evidência | `WebPushSubscriptionValidator`, `SubscriptionDocument` e testes de validação/repositório | Implementado; aviso ainda é minuta e não autoriza produção. |
| 365 dias, TTL derivado e inelegibilidade | `CosmosSubscriptionRepository`, query ativa e releitura antes do transporte | Implementado sem usar TTL como autorização. |
| Idempotência e takeover | create condicional, resposta duplicada sem segredos e testes de alteração concorrente | Implementado; renovação autenticada ficará para fluxo futuro e exige novo consentimento. |
| Capacidades e recuperação | duas capacidades CSPRNG de 256 bits, hashes por domínio e comparação constante | Implementado; frontend e atendimento manual permanecem nas issues posteriores. |
| Revogação, falha parcial e `404`/`410` | replace com ETag antes do delete e exclusão condicionada a geração | Implementado; mensagem já em trânsito não é recuperável. |
| SSRF e validação estrita | allowlist compartilhada pelo registro e sender; JSON/corpo limitados | Implementado para provedores documentados. Mudança de provedor exige revisão da allowlist. |
| Rate limiting distribuído | contadores Cosmos shardados, atômicos, temporários e fail-closed; testes concorrentes do algoritmo create + incremento condicional | Implementado sem serviço novo; limite é aproximado e tentativa negada ainda consome RU. |
| CORS, timeout e erros | origem exata, preflight, deadline, headers seguros e respostas genéricas | Implementado; CORS não é autenticação. |
| Sanitização e retenção | logs fixos sem exception/request; ID fora da URL; diagnóstico sem `allLogs`/HTTP; `immediatePurgeDataOn30Days=true`; comandos de leitura preparados | Aplicação/IaC implementadas. Retenção total/interativa e tabelas gerenciadas exigem prova Azure em #156/#165/#167. |
| Kill switch | três app settings `Disabled=true` e asserção Terraform | Preservado; nenhuma inscrição pública, deploy ou envio foi habilitado. |
| Detecção editorial e seed | leitor dos três catálogos, identidade origem+idioma+URL, baseline histórica e testes de reorder/edição/reaparecimento | Implementado; a evidência autenticada do deployment e o enqueue pertencem à #164. |
| Campanha e deduplicação | creates condicionais, ETags, cutoff de audiência e estado por inscrição/geração em partição de campanha | Implementado em store controlado; RU, throttling e reconciliação operacional permanecem na #165. |
| Resultado incerto | transição durável `Claimed` → `Sending`; timeout/falha pós-transporte termina em `OutcomeUnknown` sem reenvio automático | Implementado como at-most-once sob incerteza; não garante entrega nem exactly-once do provedor. |

## Separação entre decisão, evidência e bloqueio

| Categoria | Estado verificável |
| --- | --- |
| Decisões humanas aprovadas para implementação | Finalidade PT-BR; consentimento `1.0.0`; 365 dias sem renovação implícita; logs por 30 dias; capacidades; ausência de cadastro/publicidade/perfil; canal existente; mapeamento de transferências; revisão jurídica pré-produção. |
| Evidências técnicas disponíveis | Contratos e testes locais; hashes de capacidades; criação condicional; expiração absoluta; invalidação fail-closed; recovery epoch; kill switches; IaC de retenção/categorias; runbooks e comandos somente leitura. |
| Validações operacionais pendentes | Restore/reconciliação real; retenção por tabela e resposta ARM; categorias efetivas; custos/ingestão; budget/alertas; fluxo frontend; piloto controlado. |
| Bloqueios jurídicos | Aviso, base legal, papéis, contratos, subprocessadores, países/mecanismos de transferência e prazos adicionais ainda não foram validados. Nenhum piloto ou produção é autorizado por estes documentos. |
> **Sequência vigente em 28/11/2026:** #166 deixa de ser etapa obrigatória; os controles pertinentes migram para #156/#167. A abertura pública somente pode ocorrer depois do fechamento efetivo de #155, #156 e #167 e de uma release completa protegida.
