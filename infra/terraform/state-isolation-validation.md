# Validação operacional do isolamento dos States

Issue #149, atividade 7.3.7.22.10. Preserva ADRs 0017/0018. Este teste não altera Azure, RBAC, Terraform ou blobs.

## Execução (somente após autorização específica)

1. Merge revisado do PR; confirmar SHA atual da main e sucesso do workflow Terraform validation (push desse SHA). Confirmar separadamente que terraform-dev e diagnostics-dev possuem restrição de deployment à main e gates de aprovação exigidos; este workflow não configura Environments. Confirmar que as duas variáveis de cliente correspondem às identidades já inventariadas e que não houve alteração de RBAC.
2. Acionar manualmente Validate Terraform State isolation na main, informando revision (SHA completo) e confirmation = VALIDATE-STATE-ISOLATION. Não iniciar outros workflows de infraestrutura/release enquanto pendente; o grupo production-release é compartilhado e o GitHub pode substituir execuções pendentes.
3. Aprovar os dois jobs protegidos somente após conferir revisão e escopo. Cada job revalida main e checkout antes de Azure Login; a identidade do contexto CLI é conferida sem divulgação dos identificadores.
4. Consultar o resumo dos dois jobs e o gate final. Aceitar somente foundation→foundation ALLOWED, foundation→diagnostics DENIED, diagnostics→diagnostics ALLOWED, diagnostics→foundation DENIED e conclusão global success na mesma execução. Qualquer erro, skip, cancelamento, acesso cruzado permitido ou resultado inconclusivo bloqueia aceite. Não repetir automaticamente; reconciliar primeiro.
5. Registrar URL/SHA/resultados sanitizados na issue #149. Reconciliar main e Plans antes de eventual Apply, que exige autorização distinta.

## Contrato

CLI: a documentação atual suporta az storage blob list com --auth-mode login e --num-results 1; a versão do runner pode variar. Para evitar heurísticas sobre stderr e paginação implícita, utilizamos az account get-access-token --resource https://storage.azure.com/ e HTTPS GET List Blobs com restype=container&comp=list&maxresults=1. Versão REST 2023-11-03; nenhum include, prefix, marker, SAS, chave, connection string, lease ou acesso ao conteúdo. Token em memória; sem redirecionamento, proxy, retry ou paginação. O HTTP 200 exige XML de enumeração do container correto, limite 1 e no máximo um Blob (zero é válido). HTTP 403 exige x-ms-error-code e XML Code iguais a AuthorizationPermissionMismatch e x-ms-request-id presente. Erros de rede, 401/404/429/5xx, 403 genérico, AuthenticationFailed, AuthorizationFailure, XML ausente/inválido ou contraditório são inconclusivos. Nenhum corpo, nome de blob, request ID, token ou identificador Azure é reportado. Apenas aliases, resultados fixos e SHA GitHub. A operação não lê conteúdo do State.

Limitações: comprova somente List Blobs no momento da execução, não prova ausência de toda permissão de escrita/leitura direta, permanência de RBAC, ausência de acesso por outras identidades, ou autorização de Diagnostic Settings. Não é transação atômica entre jobs; alterações externas de IAM ou de main após o último check não são impedidas pelo grupo de concorrência. Não executar com mudanças externas em andamento. O controle de concorrência é do GitHub, não um lock Azure. Environments e regras de proteção são configuração externa ao código. O teste não valida a disponibilidade de compartilhamento de chaves nem chama sharedKeys/action.

Testes sem credenciais: python3 .github/scripts/test_verify_state_isolation.py; executados também no CI existente de Terraform validation. Não disparar o workflow autenticado para testar o PR.

## Referências oficiais

- https://learn.microsoft.com/en-us/rest/api/storageservices/list-blobs
- https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-azure-active-directory
- https://learn.microsoft.com/en-us/rest/api/storageservices/status-and-error-codes2
- https://learn.microsoft.com/en-us/troubleshoot/azure/azure-storage/blobs/authentication/storage-troubleshoot-403-errors
- https://learn.microsoft.com/en-us/cli/azure/storage/blob#az-storage-blob-list
- https://learn.microsoft.com/en-us/cli/azure/account#az-account-get-access-token
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- https://docs.github.com/en/actions/reference/security/secure-use
