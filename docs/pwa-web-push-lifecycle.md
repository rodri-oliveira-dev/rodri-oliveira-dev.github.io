# Ciclo de vida Web Push no navegador

Status: implementação funcional isolada das issues #158 e #159. A exposição pública e as integrações reais permanecem bloqueadas pela ADR 0022.

## Limite operacional

`assets/js/web-push-config.mjs` é a configuração pública fail-closed: `enabled` permanece `false`, sem host de API, chave VAPID, texto da minuta ou URL do aviso. Nesse estado, o bootstrap apresenta somente a indisponibilidade na home PT-BR e não consulta `Notification`, `PushManager`, Service Worker, IndexedDB ou API. As homes EN e ES não carregam controles nem módulos Web Push.

A minuta de consentimento `1.0.0` existe somente em `.github/scripts/fixtures/web-push-consent.json` para testes isolados. Habilitar o recurso, preencher a configuração, publicar o texto ou mudar a CSP não faz parte destas issues e continua condicionado a #155, #156 e aos gates posteriores da ADR 0022.

## Responsabilidades

- `web-push-lifecycle.mjs`: estados, transições, concorrência local e ordenação de ativação, revogação, limpeza e recuperação.
- `web-push-platform.mjs`: detecção por capacidades/contexto, integração com as APIs do navegador, transporte HTTP e persistência mínima em IndexedDB.
- `web-push-view.mjs`: apresentação acessível, mensagens e ações explícitas.
- `web-push.mjs`: composição dos módulos, gate público e reavaliação em restauração por bfcache.

O registro local contém somente `subscriptionId`, expiração, estado de revogação e, até o `202` remoto, a capacidade de cancelamento. Endpoint, chaves da `PushSubscription` e capacidade de recuperação não são persistidos. A capacidade de recuperação é disponibilizada uma vez para exportação explícita em arquivo local e depois removida da memória da página.

## Invariantes do ciclo

1. Inicialização e bfcache nunca solicitam permissão, criam inscrição ou renovam consentimento.
2. Ativação exige consentimento afirmativo e gesto no botão antes de `requestPermission()`.
3. Um `202` de registro não é repetido nem apropriado; o estado exige recuperação.
4. Cancelamento envia ID e capacidade somente no corpo de `DELETE /subscriptions`, sem credenciais, cache, redirect ou referrer.
5. `unsubscribe()` ocorre depois do `202` remoto. Até essa resposta, a capacidade é preservada e a falha usa backoff limitado.
6. Depois do `202`, a capacidade é removida; se a limpeza local falhar, permanece apenas estado mínimo para nova tentativa.
7. Expiração, perda de APIs, permissão negada ou desaparecimento da inscrição nunca causam reinscrição automática e não removem a opção de revogação remota quando há capacidade.
8. A recuperação manual permanece disponível mesmo sem registro ou inscrição local. ID e capacidade são removidos dos campos imediatamente após cada tentativa; se a revogação não for confirmada, a interface exige nova inserção em vez de reter a capacidade no DOM.

Não existe atomicidade entre navegador e backend. A interface diferencia pendência remota de limpeza local para não afirmar um cancelamento ainda não confirmado.

## Rastreabilidade

| Issue | Critério | Evidência isolada |
| --- | --- | --- |
| #158 | UI PT-BR acessível e progressiva | Seção semântica em `index.html`, estados anunciados por `output` com região viva, foco visível, contraste forçado e leiaute responsivo; EN/ES sem alterações. |
| #158 | Permissão somente após opt-in explícito | Checkbox desmarcado, botão condicionado ao aceite e teste `activation requires affirmative consent...`. |
| #158 | Capacidades, iOS e falhas recuperáveis | `detectWebPushCapabilities`, estado `install-required`, estados de indisponibilidade/recusa/erro e testes sintéticos. |
| #158 | Consentimento versionado, VAPID e API preparados | Configuração tipada pelo contrato `1.0.0`, conversão VAPID e cliente `POST`; gate público sem valores reais. |
| #159 | Opt-out seguro e idempotente | `202` remoto antes de `unsubscribe`, retries limitados e testes de resposta perdida/`503`. |
| #159 | Falhas parciais e preservação de capacidade | Estados `cancel-pending-remote` e `cancel-pending-local`; testes confirmam preservação até `202` e remoção posterior. |
| #159 | Expiração, perda de capacidade, concorrência e bfcache | Estados centralizados, mutex por página, rechecagem em `pageshow` e testes sem renovação/reinscrição. |
| #159 | Recuperação independente | Importação de ID + capacidade de recuperação no corpo, inclusive sem estado local; limpeza imediata dos campos, exportação local explícita e rota manual sem usar endpoint como autenticação. |
| #158/#159 | Sem segredos, endpoints ou telemetria | Configuração pública nula, ausência de logs, IndexedDB minimizado e testes do transporte/artefatos públicos. |

Os testes não demonstram integração real com provedores, dispositivos ou backend publicado. Essa evidência pertence à #166, depois dos gates obrigatórios.

