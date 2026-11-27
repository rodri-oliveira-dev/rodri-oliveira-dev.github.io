# Evidências para decisão humana sobre as issues 151 a 154

Data da consolidação: 2026-11-26.

Este registro prepara a decisão humana sobre as issues
[#151](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/issues/151),
[#152](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/issues/152),
[#153](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/issues/153) e
[#154](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/issues/154).
Ele não encerra issues, não aprova gates e não declara conformidade jurídica ou
prontidão para produção.

O conjunto de mudanças está no
[PR #219](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/pull/219),
separado nos commits de
[recuperação e revogação](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/commit/5dd47e79b8d255bff920a6377d62044c0a7fcad5),
[testes de ciclo de vida e abuso](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/commit/e8e6d583893b4ed0bd4ff04d47295c3dac773cd6) e
[documentação de recuperação e retenção](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/commit/1eeee67fd97ce2857b670f1d18ba5ba6dbdf8726).

## Separação das evidências

### Decisões humanas aprovadas para implementação

O [PR #217](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/pull/217)
formalizou finalidade exclusiva de novos artigos PT-BR, consentimento `1.0.0`,
expiração absoluta de 365 dias, renovação somente por novo consentimento,
retenção operacional de logs por 30 dias, cancelamento e recuperação por
capacidades criptográficas, ausência de cadastro, publicidade e perfil
comportamental, canal de privacidade, inventário de fornecedores e
transferências e revisão jurídica obrigatória antes da produção.

Essas decisões autorizam a implementação técnica. Elas não comprovam execução
operacional nem substituem revisão jurídica.

### Evidências técnicas disponíveis

- O backend valida versão do consentimento, finalidade e idioma, persiste a
  evidência e calcula a expiração absoluta a partir da manifestação original.
- Capacidades são geradas criptograficamente e somente seus hashes são
  persistidos. Repetições não devolvem capacidades e não transferem a inscrição.
- Registros de uma época de recuperação diferente ficam inelegíveis; respostas
  `404` e `410` causam invalidação condicional antes da exclusão física.
- Kill switches continuam preservados e a recuperação exige que permaneçam
  desativados durante reconciliação.
- A infraestrutura declara 30 dias com purge imediato, e os testes locais
  validam a declaração sem acessar Azure.

### Validações operacionais pendentes

- Ensaio autorizado de restauração, rotação da época de recuperação,
  reconciliação e comprovação de que nenhum registro restaurado foi enviado.
- Consulta do workspace, de cada tabela e das categorias diagnósticas para
  comparar retenção interativa e total, exceções e custo.
- Validação dos fluxos de navegador e cancelamento remoto/local na #159.

### Bloqueios jurídicos

A revisão humana/jurídica do aviso, base legal, fornecedores, transferências
internacionais, direitos e canal de atendimento continua obrigatória antes da
publicação da #155, de qualquer piloto ou da produção. Nenhum documento deste PR
representa parecer jurídico.

## Matriz de decisão

| Issue | Critérios atendidos e evidências verificáveis | Pendências remanescentes | Classificação para implementação | Recomendação de decisão humana |
|---|---|---|---|---|
| #151 | Decisões do PR #217 reconciliadas com a [matriz de rastreabilidade](roadmap-traceability.md), o [inventário](processing-inventory.md) e este registro; decisões, técnica, operação e jurídico estão separados | Revisão jurídica e validações operacionais não realizadas | Não bloqueia manutenção técnica; bloqueia #155, piloto e produção | Considerar o encerramento humano do gate de decisão após confirmar a transferência explícita das pendências; não interpretar como aprovação jurídica |
| #152 | Contratos de consentimento, expiração, idempotência, takeover e capacidades revisados; 65 testes aprovados; resposta inicial perdida não recupera segredos nem renova consentimento | A experiência de nova manifestação após perda de capacidade pertence à #159 | Não bloqueia a próxima evolução técnica; bloqueia qualquer fluxo que tente recuperar capacidade ou renovar implicitamente | Considerar o encerramento humano após merge do PR #219, preservando o contrato fail-closed |
| #153 | Época de recuperação, invalidação antes de delete, concorrência e restauração testadas; [runbook](backup-recovery-runbook.md) e limites de consistência documentados | Ensaio real de restauração e integração com `PushSubscription.unsubscribe()` ainda pendentes | Não bloqueia trabalho isolado; bloqueia piloto/produção e recuperação operacional até validação | Considerar o encerramento humano do escopo de código/documentação após merge; manter os gates operacionais e a #159 abertos |
| #154 | Algoritmo real do rate limiter testado sem Azure; falhas fechadas, limites e purge declarativo verificados; [roteiro somente leitura](operational-retention-validation.md) disponível | Retenção por tabela/categoria, exceções e impacto financeiro precisam de evidência do ambiente | Não bloqueia desenvolvimento; bloqueia piloto/produção e aprovação final | Considerar o encerramento humano do escopo implementável após merge, somente com a pendência operacional registrada em #156, #165 e #167 |

## Resultado das validações locais

- Build .NET Release: sucesso, sem avisos ou erros.
- Testes .NET: 65 aprovados.
- Formatação .NET e análise de dependências vulneráveis: sucesso, nenhuma
  vulnerabilidade reportada pelo comando executado.
- Terraform: `fmt`, quatro `validate`, 6 testes do root e 2 testes de
  diagnostics aprovados; validadores de plano, RBAC, diagnósticos e isolamento
  de State aprovados.
- Suítes Python e Node do portfólio, ADR Guard e product coverage: sucesso.
- SEO e sitemap: sincronizador e testes aprovados; `sitemap.xml` não mudou
  porque o conteúdo publicado não foi alterado.
- Nenhuma validação acessou Azure, Terraform State, credenciais ou provedor Web
  Push real.

## Condição da issue 155

A #155 **não está apta a publicar o aviso neste momento**. O trabalho técnico
necessário para a revisão pode prosseguir somente de forma não operacional, mas
a publicação depende de revisão jurídica humana e da confirmação dos gates
aplicáveis. Inscrições públicas, piloto, produção, deploy e envio permanecem
proibidos. A comprovação de retenção transferida para #156, #165 e #167 não foi
resolvida pela implementação declarativa.

## Texto preparado para os comentários individuais

### Issue 151

O PR #219 consolida as decisões formalizadas no PR #217 e separa decisões
aprovadas, evidências técnicas, validações operacionais e bloqueios jurídicos em
`docs/privacy/web-push/closure-evidence.md`. A recomendação é uma decisão humana
de encerramento do gate de governança após o merge, sem interpretar isso como
revisão jurídica, prontidão para piloto/produção ou autorização para a #155.

### Issue 152

O PR #219 revisa os contratos e adiciona evidências para consentimento,
expiração absoluta, idempotência, takeover, capacidades e resposta inicial
perdida. Os commits de implementação e testes são permanentes e 65 testes .NET
foram aprovados. A recomendação é decisão humana após o merge; perda da resposta
não permite recuperar capacidades nem renovar consentimento implicitamente.

### Issue 153

O PR #219 trata restauração fail-closed com época operacional, invalidação antes
da exclusão física, testes de concorrência e runbook. A recomendação é decisão
humana sobre o escopo implementável após o merge. Ensaio real de restauração e
integração do navegador na #159 permanecem gates separados para piloto e
produção.

### Issue 154

O PR #219 testa o algoritmo real do rate limiter sem Azure, reforça falha
fechada e documenta validação de retenção somente leitura. A recomendação é
decisão humana sobre o escopo de código/IaC após o merge. Retenção por tabela,
categorias, exceções e custos continuam pendentes e foram transferidos para
#156, #165 e #167; `retentionInDays = 30` não é tratado como comprovação.
