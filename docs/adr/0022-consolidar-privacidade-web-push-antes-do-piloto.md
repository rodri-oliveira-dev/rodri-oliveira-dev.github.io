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
| 4 | #155–#156 | Retomar aviso PT-BR, revisão jurídica, validações operacionais e gate explícito de segurança/privacidade. |
| 5 | #166 | Piloto real controlado, somente após #156 e autorização humana. |
| 6 | #167 | Decisão humana de produção, após evidências do piloto. |

As issues #155 e #156 ficam abertas, identificadas como postergadas, sem alterar seus critérios de aceite. #157 depende de #154; #155 depende de #154 e #165; #156 depende de #155; #166 depende de #165 e #156. O gate de UX #161 permite apenas prosseguir no desenvolvimento. A issue #165 conserva os requisitos de observabilidade; a prova operacional de retenção e restauração permanece obrigatória na #156 antes do piloto, com evidência rastreada em #165 e #167.

A implementação do frontend utiliza a minuta e o contrato de consentimento `1.0.0` já versionados, apenas em ambientes isolados. Antes do gate, nenhuma versão pública deve exibir controles acionáveis de inscrição, solicitar permissão real, chamar PushManager.subscribe, obter ou transmitir endpoints/chaves reais, criar inscrições, executar enqueue real ou entregar notificações. Testes de dispositivos usam mocks e dados sintéticos; limitações são registradas e a integração real é verificada em #166. Manter os kill switches existentes em estado de desativação de inscrições e envio, e a exposição pública bloqueada. Não presumir que mock ou kill switch substitui consentimento ou autorização.

Preservar a [ADR 0006](0006-proteger-dados-de-inscricoes-web-push.md), incluindo consentimento explícito versionado, expiração absoluta de 365 dias, retenção de logs de 30 dias, capacidades criptográficas, minimização, revogação, proteção antiabuso e recuperação fail-closed. A revisão jurídica do aviso e dos fluxos/fornecedores/transferências precede sua publicação e qualquer tratamento real de inscrições. O gate #156 exige evidências de retenção efetiva, restauração/reconciliação, direitos, incidentes e demais critérios previamente aprovados. As ADRs 0005, 0006 e 0007 mantêm seus próprios status; esta decisão não as substitui.

Não há autorização implícita para deploy, release, Terraform apply, alteração de State, IAM/RBAC, novo serviço ou gasto. Qualquer necessidade de execução operacional segue os gates e autorizações existentes da ADR 0009 e da ADR 0012.

### Alternativas consideradas

Manter a sequência anterior concentraria revisão jurídica e validações operacionais antes do desenvolvimento de navegador e campanhas, aumentando interrupções e retrabalho. Remover definitivamente os gates ou ativar o serviço antes da validação foi rejeitado: o volume esperado não elimina obrigações nem riscos. A consolidação pré-piloto preserva os controles técnicos enquanto permite progresso isolado.

## Consequences

O desenvolvimento funcional pode avançar pela #157 após aprovação deste PR, sem reabrir #151–#154. O adiamento reduz a fragmentação do trabalho, mas acumula pendências obrigatórias na fase final e pode revelar ajustes de texto, UX ou configuração antes do piloto. A versão do consentimento e os testes devem ser reconciliados com o aviso efetivamente aprovado; não publicar minuta como texto definitivo.

O MVP tecnicamente completo não equivale a produto liberado. A revisão final pode resultar em no-go; não ativar inscrições reais ou envio antes dos gates. Reavaliar a proporcionalidade se houver mudança de finalidade, volume, perfil de titulares, fornecedores ou risco. A decisão de sequenciamento não constitui parecer jurídico ou declaração de conformidade.

O custo incremental previsto desta alteração documental é nulo; nenhum recurso Azure é criado. Evidências históricas são preservadas, e #155/#156 permanecem abertas até conclusão efetiva.
