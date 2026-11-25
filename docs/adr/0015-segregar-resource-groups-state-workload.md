# ADR 0015: Segregar Resource Groups de State e workload

## Status

Accepted

## Context

A issue #149 confirmou que o RG `rg-portfolio-push-dev` contém somente a Storage Account `strotfstatepushdev`, protegida por lock CanNotDelete. Esse lock não impede alterações de configuração nem protege diretamente o plano de dados. Uma Custom Role com ações Storage de gerenciamento no mesmo RG alcançaria a conta de State. NotActions não restringe uma ação a um nome de recurso.

## Decision

Preservar o RG e a conta existentes para State e criar manualmente o RG `rg-portfolio-push-workload-dev` em brazilsouth para o workload, antes do primeiro apply. Não mover o Storage, migrar State, alterar as três backend keys nem modificar OIDC. Restringir a Custom Role de provisionamento ao RG de workload após derivação e revisão de ações; preservar Reader no RG de State e Storage Blob Data Contributor somente no contêiner tfstate. Manter IAM de runtime e deploy separados conforme ADR 0014. O root de reconciliação verifica os escopos de ambos os RGs sem criar atribuições.

## Consequences

A fronteira ARM reduz o blast radius de mudanças do provisionador sobre o State sem custo direto adicional pelo RG. A separação não protege os blobs aos quais o provisionador já tem acesso nem elimina riscos de configuração do workload. As keys do State continuam no mesmo contêiner; isolamento de autorização entre elas permanece uma decisão pendente. O orçamento da assinatura continua abrangendo os recursos.

A alternativa de mover o Storage foi descartada por alterar seu resource ID e exigir revisão de locks e atribuições. A adoção operacional exige revisão do PR, criação manual do RG, validação da Custom Role e aprovação de IAM. Decisão aprovada pelo responsável pelo projeto em 25/11/2026, no contexto da issue #149. A aprovação arquitetural não autoriza apply, concessão de RBAC, publicação ou inscrições.
