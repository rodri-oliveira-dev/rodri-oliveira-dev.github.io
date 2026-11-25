# ADR 0012: Coordenar releases manuais do monorepo

## Status

Accepted

## Context

O portfólio era publicado a cada push na main, em paralelo com as validações, enquanto a tag era criada após os gates de um único PR. O deploy nativo por branch também pode competir com o artefato que inclui os currículos em PDF. A frequência de integração não representa necessariamente a frequência de entrega desejada.

Com o backend Web Push em Azure Functions e a infraestrutura Terraform (ADR 0009), a release envolve componentes com dependências e permissões diferentes. Publicar o frontend antes dos recursos ou contratos de backend pode expor funcionalidades indisponíveis. Mudanças editoriais, por sua vez, não justificam provisionamentos ou releases independentes a cada merge.

## Decision

Adotar Continuous Delivery. PRs e pushes na main mantêm CI e quality gates automáticos, sem efeitos de implantação. Um único workflow orquestrador, Release and Deploy, iniciado por workflow_dispatch na main, define o incremento SemVer e fixa o SHA da revisão. O acionamento manual não substitui aprovação de Environments nem autorização de custos. Excepcionalmente, no primeiro provisionamento, o mesmo workflow oferece um modo de fundação sem criação da Function, publicação ou tag, para permitir a atribuição separada de IAM e configuração de VAPID antes da release completa. O modo normal preserva a ordem de jobs; a segunda execução usa a revisão então aprovada e revalida o plano.

A ordem de dependência dos jobs será:

1. Preflight: verificar origem GitHub Actions do Pages, revisão confiável, gates obrigatórios (inclusive os condicionais exigidos pelo impacto), versão e registro da última implantação.
2. Terraform: planejar e aplicar somente o root do workload, após aprovação protegida do plano, com locking. O bootstrap do backend remoto de State, identity-reconciliation e runtime-iam ficam fora do apply de release; o modo de fundação inicial aplica somente os recursos previstos no root do workload. Bloquear destruições e substituições críticas sem autorização específica.
3. Backend: implantar pacote compilado e testado para o mesmo SHA, usando outputs não sensíveis da infraestrutura; verificar health e compatibilidade.
4. Frontend build: gerar e validar PDFs PT/EN/ES e montar artefato por allowlist de conteúdo público; excluir infraestrutura, backend, State, planos, configurações e arquivos internos.
5. Frontend deploy: publicar exclusivamente por GitHub Actions no Pages e verificar a revisão efetiva, rotas e PDFs.
6. Create tag: criar tag SemVer anotada para o SHA efetivamente implantado, sem mover ou sobrescrever tags.
7. Create release: criar GitHub Release e changelog desde a última release publicada, reutilizando a tag validada.
8. Post-deployment: IndexNow e, futuramente, Web Push conforme ADR 0005; falha de distribuição não desfaz a publicação.

Jobs de implantação devem declarar dependências explícitas por needs; falha ou ausência de pré-requisito obrigatório impede as etapas seguintes. Terraform e backend podem registrar no-op comprovado para mudanças sem impacto, nunca considerar componente obrigatório ausente, falha ou skip inesperado como sucesso. A integração do workload foi concluída na issue #148. O modo de fundação inicial não publica frontend, backend ou metadados de release; a execução completa depende do gate #142 e das autorizações e verificações da issue #149. A ativação de inscrições e envio permanece sujeita aos gates posteriores, incluindo #150.

A concorrência de releases manuais deve ser exclusiva entre operações que alteram o mesmo ambiente, sem cancelar deploy em andamento. A concorrência de CI usa grupos próprios por Pull Request ou referência e pode cancelar somente a execução anterior do mesmo contexto; CI nunca compartilha nem substitui a fila de release. Revalidar a ordem de publicação e o SHA registrado antes de operações mutáveis e reexecuções; não implantar revisão antiga sobre uma mais recente. Um merge posterior não altera a revisão em implantação nem impede finalizar metadados da revisão já publicada, desde que as evidências confirmem que não foi superada.

Usar OIDC com identidades distintas para infraestrutura, backend e enqueue, Environments protegidos e RBAC mínimo; permissões GitHub por job, Actions pinadas e checkout sem credenciais persistidas. Planos, State e segredos não devem aparecer em logs ou artefatos públicos. O frontend e as prévias de PR não recebem credenciais Azure.

Alternativas consideradas:

- Deploy a cada merge com aprovação por Environment: preserva aprovação, mas cria execuções mesmo sem intenção de release e não coordena componentes.
- Workflows independentes: permitem cadências distintas, mas exigem coordenação manual ou mecanismo adicional de consistência. Workflows reutilizáveis continuam adequados como implementação de jobs, sem gatilhos independentes de implantação.
- Pipeline única manual: oferece sequência auditável, SHA e versão comuns, aprovações por responsabilidade e agrupamento de vários PRs. O custo de coordenação é aceitável para a escala do portfólio.

## Consequences

A main pode ficar à frente da produção por decisão operacional. A publicação requer ação humana e validações bem-sucedidas. Pages deve usar GitHub Actions, não publicação por branch.

A pipeline não é uma transação distribuída. Um apply bem-sucedido não é revertido automaticamente por falha de backend; backend e frontend devem preservar compatibilidade durante a janela de implantação. Recuperação usa registro do SHA, versão, pacote e resultados por componente. Reexecutar somente estágios necessários quando seguro, sem repetir alterações destrutivas, recriar tags ou reimplantar revisões superadas. Rollback de infraestrutura exige revisão de plano e State, nunca destroy automático.

O PR #185 iniciou a transição para publicação manual; o [PR #188](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/pull/188) integrou a implementação das issues #143 a #148, com CI aprovada. A execução autenticada, o primeiro provisionamento, a configuração de IAM/VAPID e os smoke tests reais permanecem na issue #149. A aceitação formal desta ADR segue a revisão e o merge deste PR de documentação. A aprovação desta decisão não autoriza provisionamento, ativação de inscrições ou envio real. A hospedagem permanece conforme ADR 0001; privacidade e publicação confirmada permanecem válidas.
