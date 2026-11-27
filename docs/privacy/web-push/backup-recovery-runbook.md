# Runbook de recuperação de inscrições Web Push

Status: procedimento de preparação; não comprova execução operacional. Nenhum restore, deploy, `terraform apply`, acesso ao State ou comando Azure foi executado nesta entrega.

## Risco tratado

O backup periódico do Cosmos DB pode conter um documento ativo anterior à revogação, expiração ou exclusão. O restore ocorre em outra conta e recupera os dados daquele instante; ETag, `subscriptionGeneration`, `_ts`, TTL e releitura permanecem internamente coerentes com o estado antigo e, isoladamente, não detectam a revogação posterior.

O projeto não possui um ledger independente de revogações. Para evitar serviço e custo novos, a recuperação adota o trade-off fail-closed: **nenhuma inscrição restaurada volta a ser elegível; todos os titulares precisam manifestar novo consentimento**.

## Controles técnicos

- cada documento novo recebe `recoveryEpoch`, vinda da configuração da Function e não do backup do container;
- query de campanha e point read anterior ao transporte exigem igualdade com a epoch atual;
- registros sem epoch ou com epoch antiga são inelegíveis;
- `expiresAtUtc` continua sendo limite absoluto adicional;
- os três kill switches permanecem ativos durante toda recuperação;
- a conta de restore periódico tem nome/endpoint novo, portanto não é conectada automaticamente pela configuração versionada.

Este controle depende da rotação da epoch antes de qualquer troca de endpoint. O runbook não deve ser descrito como reconciliação automática.

## Procedimento obrigatório

1. Declarar incidente/recuperação e manter `register-subscription`, `revoke-subscription` e `ProcessWebPushCampaign` desabilitados. Suspender enqueue e confirmar que nenhuma release concorrente pode ativá-los.
2. Solicitar o restore periódico para uma conta nova, no instante UTC estritamente necessário. Não apontar a Function para ela e não copiar dados ao container ativo.
3. Verificar origem e instante pelos metadados/tags da conta restaurada; inventariar banco, container, contagem e maior `expiresAtUtc` sem exportar endpoint, chaves, capacidades ou hashes para logs/issues.
4. Escolher uma nova `subscription_recovery_epoch` não secreta e monotonicamente identificável, por exemplo `restore-2026-11-27-01`. Alterar a configuração versionada no mesmo PR que faria qualquer reconexão. O valor deve ser diferente do gravado nos itens restaurados.
5. Executar testes/plan protegidos. Confirmar que query e point read rejeitam epoch anterior, que a expiração absoluta permanece e que os kill switches continuam `true`.
6. Reconciliar somente dados que não sejam inscrições. Para o container atual compartilhado, excluir ou não migrar documentos `type = subscription` e `type = rate-limit` restaurados. Estado futuro de campanha deve ter runbook próprio na #163/#165 antes de ser migrado.
7. Não usar endpoint/chaves restaurados para criar nova geração. A criação condicional bloqueia takeover; remover os documentos antigos de forma controlada antes de permitir novo opt-in.
8. Depois de revisão humana, testes e evidência de container sem inscrições restauradas elegíveis, reconectar o backend ainda com kill switches ativos. Validar health e consultas sem envio.
9. Informar na UX futura que a inscrição precisa ser refeita. Novo registro exige texto vigente, gesto explícito, nova evidência, nova geração, novas capacidades e novo prazo de 365 dias.
10. Qualquer reativação segue os gates #156, #161 e #167. Restore não autoriza piloto, produção ou aceitação de ADR.

## Critérios de abortar/falhar fechado

Não conectar nem ativar se: epoch não foi rotacionada; origem/instante do restore não estão comprovados; há inscrição restaurada selecionável; kill switch está inativo; expiração absoluta mudou; logs expõem dados; retenção operacional não foi validada; ou não é possível distinguir com segurança dados válidos. Nesse caso, descartar as inscrições recuperadas e solicitar novo opt-in.

## Limites e custo

O restore pode exigir plano de suporte e cria uma conta temporária faturável; migração pode consumir RU, armazenamento e egress. A conta temporária não deve permanecer após a recuperação. Essas operações exigem autorização humana e FinOps; este documento não as executa nem autoriza.

Referências: [restore periódico](https://learn.microsoft.com/azure/cosmos-db/periodic-backup-request-data-restore) e [backup/restore online](https://learn.microsoft.com/azure/cosmos-db/online-backup-and-restore).
