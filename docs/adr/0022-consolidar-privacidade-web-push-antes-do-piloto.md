# Consolidar a privacidade Web Push antes do piloto, após o desenvolvimento funcional

## Status

Accepted

## Context

Em 27/11/2026, após o merge do PR #219, o responsável pelo portfólio decidiu priorizar a conclusão funcional do MVP Web Push e concentrar as pendências de privacidade ao final do desenvolvimento. A expectativa é de até 100 usuários inscritos, não uma quota técnica nem critério de dispensa legal. A finalidade continua exclusivamente notificar novos artigos PT-BR, sem cadastro, publicidade ou perfil comportamental.

As issues #151 a #154 foram encerradas no escopo de decisões para implementação, código, IaC e documentação. Os PRs #217, #218 e #219 registram as evidências e os controles existentes; não demonstram conformidade jurídica, retenção operacional no ambiente ou recuperação real.

## Decision

Adotar a seguinte ordem de entrega no roadmap #136, efetiva após o merge desta ADR:

| Ordem | Issues | Escopo |
| --- | --- | --- |
| 1 | #151–#154 | Preservar o encerramento e os controles implementados. |
| 2 | #157–#161 | Service Worker, opt-in/opt-out e UX; somente testes isolados, mocks e dados sintéticos. |
| 3 | #162–#165 | Campanhas, deduplicação, enqueue privado, reconciliação e observabilidade; testes sem envio real. |
| 4 | #155–#156 | Retomar aviso PT-BR, avaliação proporcional para piloto, validações operacionais e gate explícito de segurança/privacidade. |
| 5 | #166 | Piloto real controlado, somente após #156 e autorização humana. |
| 6 | #167 | Revisão jurídica integral das pendências relevantes e decisão humana de produção, após evidências do piloto. |

As issues #155 e #156 são retomadas após #165 e permanecem abertas até evidência e decisão humana, com os critérios de aprovação delimitados abaixo. #157 depende de #154; #155 depende de #154 e #165; #156 depende de #155; #166 depende de #165 e #156. O gate de UX #161 permite apenas prosseguir no desenvolvimento. A issue #165 conserva os requisitos de observabilidade; a prova operacional de retenção e restauração permanece obrigatória na #156 antes do piloto, com evidência rastreada em #165 e #167.

A implementação do frontend utiliza a minuta e o contrato de consentimento `1.0.0` já versionados, apenas em ambientes isolados. Antes do gate, nenhuma versão pública deve exibir controles acionáveis de inscrição, solicitar permissão real, chamar PushManager.subscribe, obter ou transmitir endpoints/chaves reais, criar inscrições, executar enqueue real ou entregar notificações. Testes de dispositivos usam mocks e dados sintéticos; limitações são registradas e a integração real é verificada em #166. Manter os kill switches existentes em estado de desativação de inscrições e envio, e a exposição pública bloqueada. Não presumir que mock ou kill switch substitui consentimento ou autorização.

Preservar a [ADR 0006](0006-proteger-dados-de-inscricoes-web-push.md), incluindo consentimento explícito versionado, expiração absoluta de 365 dias, retenção de logs de 30 dias, capacidades criptográficas, minimização, revogação, proteção antiabuso e recuperação fail-closed. A revisão jurídica formal integral do aviso e dos fluxos/fornecedores/transferências precede a abertura pública. O piloto individual exige avaliação prévia das obrigações aplicáveis aos fluxos efetivamente utilizados, sem presumir dispensa legal. O gate #156 exige evidências de retenção efetiva, restauração/reconciliação, direitos, incidentes e demais critérios previamente aprovados. As ADRs 0005, 0006 e 0007 mantêm seus próprios status; esta decisão não as substitui.

Não há autorização implícita para deploy, release, Terraform apply, alteração de State, IAM/RBAC, novo serviço ou gasto. Qualquer necessidade de execução operacional segue os gates e autorizações existentes da ADR 0009 e da ADR 0012.

### Atualização de 27/11/2026 — três níveis de autorização

O responsável aprovou a adoção de governança proporcional ao portfólio pessoal, com expectativa inicial de até 100 inscritos e piloto exclusivamente em dispositivos próprios. Esta revisão ajusta a exigência interna de revisão jurídica formal integral antes do piloto, sem dispensar a LGPD, os requisitos contratuais ou os mecanismos de transferência internacional aplicáveis. A finalidade profissional impede presumir a exceção do art. 4º, I, da LGPD; eventual enquadramento como agente de pequeno porte precisa ser verificado (Resolução CD/ANPD nº 2/2022). Referências: [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm), [Resolução nº 2/2022](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022) e [Resolução nº 19/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024).

| Nível | Condições | Limite da autorização |
| --- | --- | --- |
| Teste isolado / release desativada | Mocks e dados sintéticos; minuta identificada como candidata; frontend, API de inscrição e sender desativados; sem coleta de inscrições. Release manual somente mediante autorização operacional própria. | Pode publicar a seção informativa de funcionalidade indisponível, explicitamente candidata e sem opt-in; não é aviso definitivo nem autoriza tratamento real. |
| Piloto individual (#155, #156, #166) | Avaliação documentada e proporcional do responsável antes de qualquer tratamento real: controlador, finalidade, consentimento informado, versão do aviso, retenção/exclusão, direitos, incidentes, fornecedores e mecanismo legal das transferências efetivamente utilizadas; resolver dúvidas jurídicas materiais ou obter orientação qualificada. Evidências operacionais de #156 (incluindo retenção e recuperação) e autorização humana separada. | Somente o responsável, em dispositivos próprios, com controle verificável de acesso no servidor/fluxo de inscrição e de audiência; esconder a UI ou usar CORS não basta. Se a restrição não for demonstrável, permanecer em mocks. Não habilitar cadastro público; não admitir terceiros. |
| Abertura pública (#167) | Aviso definitivo, revisão jurídica das pendências relevantes e dos fluxos/fornecedores/transferências para todos os usuários, evidências do piloto, riscos corrigidos e go/no-go humano explícito. | Somente então avaliar habilitação pública e alteração de status das ADRs em PR separado. |

Para #155, a preparação técnica e a aprovação do aviso aplicável ao piloto são distintas da publicação do aviso definitivo público. Antes de fechar #155, registrar texto/versão efetivamente aplicável ao piloto, identificar o controlador, explicitar a ação afirmativa, esclarecer expiração versus exclusão e retenções de fornecedores; atualizar o conteúdo e o contrato versionado quando necessário, sem alterar silenciosamente significado já utilizado. #156 permanece bloqueante para qualquer inscrição real. A revisão do responsável não é parecer jurídico nem substitui um mecanismo legal de transferência. Se uma obrigação aplicável ao piloto não estiver atendida, o piloto continua bloqueado. Pendências exclusivamente da abertura pública ficam rastreadas na #167; não postergar requisito legal aplicável à operação piloto.

A revisão de governança não autoriza release, IAM, Apply, restore, mudança de switches, inscrições, enqueue ou envio. A publicação de um aviso candidato claramente marcado e com Web Push desativado não equivale à aprovação de uma inscrição. Os controles de #156 e a prova de recuperação real permanecem; eventual substituição do ensaio de restore exigirá decisão separada, com evidências e risco residual explícitos.

### Alternativas consideradas

Manter a sequência anterior concentraria revisão jurídica e validações operacionais antes do desenvolvimento de navegador e campanhas, aumentando interrupções e retrabalho. Remover definitivamente os gates ou ativar o serviço antes da validação foi rejeitado: o volume esperado não elimina obrigações nem riscos. A consolidação pré-piloto preserva os controles técnicos enquanto permite progresso isolado.

## Consequences

O desenvolvimento funcional pode avançar pela #157 após aprovação deste PR, sem reabrir #151–#154. O adiamento reduz a fragmentação do trabalho, mas acumula pendências obrigatórias na fase final e pode revelar ajustes de texto, UX ou configuração antes do piloto. A versão do consentimento e os testes devem ser reconciliados com o aviso efetivamente aprovado para cada nível; uma minuta informativa não pode ser apresentada como texto definitivo.

O MVP tecnicamente completo não equivale a produto liberado. A revisão final pode resultar em no-go; não ativar inscrições reais ou envio antes dos gates. Reavaliar a proporcionalidade se houver mudança de finalidade, volume, perfil de titulares, fornecedores ou risco. A decisão de sequenciamento não constitui parecer jurídico ou declaração de conformidade.

O custo incremental previsto desta alteração documental é nulo; nenhum recurso Azure é criado. Evidências históricas são preservadas, e #155/#156 permanecem abertas até conclusão efetiva.
