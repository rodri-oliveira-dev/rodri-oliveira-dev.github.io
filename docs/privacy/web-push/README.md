# Governança de privacidade do Web Push

## Sequenciamento aprovado em 27/11/2026

A [ADR 0022](../../adr/0022-consolidar-privacidade-web-push-antes-do-piloto.md) reorganiza exclusivamente a ordem de execução: #157–#165 precedem #155 e #156, que continuam obrigatórias antes de #166 (piloto real) e #167 (produção). A minuta e o consentimento versionado podem ser usados em testes isolados com mocks, sem permissões, inscrição, enqueue ou entrega reais. Não há dispensa de requisitos legais, mudança de política de retenção, aprovação jurídica ou autorização de lançamento. As evidências históricas de #151–#154 permanecem válidas no escopo em que foram produzidas.

Este diretório registra o gate documental da issue [#151](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/issues/151). Ele complementa a [ADR 0006](../../adr/0006-proteger-dados-de-inscricoes-web-push.md), sem alterar seu status `Proposed`. A [ADR 0009](../../adr/0009-adotar-azure-para-web-push-por-custo.md) permanece a referência da plataforma Azure e a [ADR 0012](../../adr/0012-controlar-publicacao-por-release-manual.md), da publicação coordenada.

## Alcance do aceite humano

O responsável pelo projeto aprovou expressamente em 26/11/2026:

- finalidade exclusiva de avisar sobre novos artigos em português;
- consentimento explícito, livre, informado e versionado, inicialmente em `1.0.0`;
- validade de 365 dias desde o consentimento e renovação somente por nova manifestação explícita;
- retenção de logs operacionais por 30 dias;
- cancelamento por capacidade criptográfica e credencial de recuperação;
- ausência de cadastro, publicidade, segmentação e perfil comportamental;
- minimização dos dados e uso do canal de contato já publicado no portfólio;
- mapeamento e validação das transferências internacionais;
- revisão jurídica obrigatória do aviso antes da produção.

O aceite permite implementar e testar os controles nas issues seguintes. Ele não autoriza inscrições reais, remoção do kill switch, enqueue, envio, deploy, mudança de IAM/RBAC, novo custo, aceitação da ADR ou produção.

## Documentos canônicos

| Documento | Responsabilidade |
| --- | --- |
| [`privacy-notice-draft.md`](privacy-notice-draft.md) | Fonte da versão candidata `1.0.0`, integrada à homepage PT-BR e ainda condicionada à revisão jurídica e à release manual. |
| [`consent/1.0.0.md`](consent/1.0.0.md) | Texto aprovado, finalidade e contrato de evidência do consentimento. |
| [`processing-inventory.md`](processing-inventory.md) | Inventário de operações, fornecedores, localização e transferências. |
| [`retention-rights-incidents.md`](retention-rights-incidents.md) | Retenção, exclusão, capacidades, concorrência, direitos e incidentes. |
| [`roadmap-traceability.md`](roadmap-traceability.md) | Divergências atuais e requisitos para #152–#167. |
| [`api-contract.md`](api-contract.md) | Contratos, idempotência, concorrência, antiabuso e riscos residuais implementados em #152–#154. |
| [`backup-recovery-runbook.md`](backup-recovery-runbook.md) | Recuperação fail-closed, invalidação de inscrições restauradas e novo opt-in. |
| [`operational-retention-validation.md`](operational-retention-validation.md) | Comandos somente leitura e critérios para comprovar retenção por workspace, tabela e categoria. |
| [`closure-evidence.md`](closure-evidence.md) | Matriz para encerramento humano de #151–#154 e comentários individuais preparados. |
| [`pilot-readiness-review.md`](pilot-readiness-review.md) | Parecer consolidado das issues #155/#156, separando controles testados, validações operacionais, jurídico, bloqueios e melhorias opcionais. |

## Classificação usada

- **Dados pessoais:** endpoint Web Push, IP eventualmente observado por infraestrutura ou fornecedor, dados enviados em pedido de direito e qualquer elemento associável a pessoa, navegador ou instalação.
- **Identificadores pseudonimizados:** hash do endpoint, ID/partition key derivados, ID de consentimento, ID de instalação ou canal. Não são classificados como anônimos.
- **Credenciais:** capacidades de cancelamento e recuperação. O servidor conserva apenas hashes; o valor em claro pertence ao titular.
- **Segredos:** chave privada VAPID e credenciais operacionais. Não são dados do assinante, mas exigem controles reforçados.
- **Metadados operacionais:** IDs de campanha, contagens, códigos de resposta, timestamps, ETags e telemetria sanitizada. Podem se tornar dados pessoais se associados a uma inscrição ou requisição.

## Bloqueios de produção

1. Revisão jurídica da minuta, da base legal proposta, dos papéis dos agentes e dos mecanismos de transferência.
2. Validação contratual da Microsoft, GitHub e provedores Web Push; nenhuma cláusula ou mecanismo está declarado válido por estes documentos.
3. Implementação e teste de consentimento, expiração absoluta, capacidades, revogação, antiabuso, sanitização e deduplicação.
4. Adequação verificável da retenção de logs a 30 dias, incluindo exceções de tabela e logs gerenciados.
5. Definição humana/jurídica da retenção de provas de consentimento, pedidos de titulares e registros de incidentes, quando ultrapassar a necessidade operacional aprovada.
6. Budget e alertas no escopo apropriado, identidade mínima de enqueue e deduplicação persistente antes do piloto.

## Referências oficiais consultadas

Consulta realizada em 26/11/2026. A legislação e os termos dos fornecedores devem ser revalidados na revisão jurídica e antes do go-live.

- [LGPD, Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- [Resolução CD/ANPD nº 19/2024, com retificação indicada pela ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024)
- [Comunicação de incidente e Resolução CD/ANPD nº 15/2024](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
- [Direitos dos titulares, ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares)

Estes documentos são artefatos de arquitetura e governança, não parecer jurídico nem declaração de conformidade.
