# Parecer da issue #161 — gate arquitetural e de UX

Data do parecer: 2026-11-27 (America/Sao_Paulo)

Baseline revisada: `f18e317af7ddd33187ae7584443fcb3f9eada1f3`

Natureza: parecer técnico para decisão humana; não altera status de ADR, não aprova gate e não autoriza operação.

## Evidências consideradas

- Issue #157 e [PR #222](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/pull/222): eventos `push`/`notificationclick`, contrato de payload e regressão offline.
- Issues #158/#159 e [PR #223](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/pull/223): ativação, cancelamento, recuperação e estados PT-BR com exposição pública bloqueada.
- [Evidências da #160](issue-160-pwa-functional-validation.md): reexecução local, matriz multiplataforma, lacunas e roteiro físico.
- ADR 0007 (`Proposed`) e ADR 0022 (`Accepted`), além dos contratos de PWA, API e privacidade já versionados.

## Resultado por dimensão

| Dimensão | Resultado | Fundamentação |
| --- | --- | --- |
| Arquitetura funcional isolada | **Aprovado** | Responsabilidades separadas entre estado, plataforma, view e composição; Service Worker preserva network-first e offline trilíngue. |
| Segurança do frontend | **Aprovado** | Gate fail-closed, CSP `connect-src 'none'`, ausência de endpoint/chave real, capacidades fora de URL/log/telemetria, transporte preparado sem credenciais/cache/redirect/referrer. |
| Segurança do ciclo de cancelamento | **Aprovado** | Revogação remota idempotente precede limpeza local; capacidades são minimizadas e removidas após `202`; falhas permanecem recuperáveis. |
| Aderência à ADR 0022 | **Aprovado** | Somente mocks e dados sintéticos; nenhum prompt real, inscrição, envio, deploy, release, Azure, Terraform, State, IAM/RBAC, kill switch ou custo foi alterado. |
| Aderência funcional à ADR 0007 | **Aprovado com pendências** | PT-BR contém o ciclo planejado e EN/ES permanecem sem UI; diferenças reais de iOS, Android e desktop ainda exigem evidência física. O status `Proposed` foi preservado. |
| Acessibilidade automatizada | **Aprovado** | Pa11y/axe/HTML_CodeSniffer em 27 URLs, contraste, árvore, teclado e larguras-alvo possuem automação; a branch corrige determinismo do cenário Android. |
| Acessibilidade física | **Pendente** | VoiceOver, TalkBack e leitores de tela desktop reais, foco e anúncios em sistemas reais não foram executados. |
| Compatibilidade multiplataforma | **Pendente** | CI cobre Chromium, Firefox e WebKit; isso não comprova Safari iOS/macOS, Chrome Android, Edge ou políticas nativas do SO. |
| Regressão PT/EN/ES e offline | **Aprovado na automação** | Contratos de idioma e offline passaram; amostragem física permanece pendente. |
| Concorrência | **Aprovado com lacuna** | Mutex por página e backend idempotente/concorrente estão testados; falta cenário integrado entre duas abas. |
| Qualidade e rastreabilidade | **Aprovado** | Testes locais e CI dos PRs dependentes são verificáveis; o timeout local conhecido foi corrigido, a repetição local passou 217/217 e todos os checks do PR #224 ficaram verdes. |
| Observabilidade operacional | **Não aplicável** | É escopo posterior das issues #162–#165 e não foi antecipado. |
| Entrega real, piloto e produção | **Não aplicável / proibido** | Permanecem sob #166/#167, depois de #155/#156 e autorização humana. |
| Revisão jurídica e privacidade operacional | **Pendente fora deste gate** | ADR 0022 posterga #155/#156, mas continua bloqueando piloto e tratamento real. |

## Achados e riscos residuais

1. **Sem bloqueio arquitetural novo no estágio isolado.** O desenho conserva o site estático e mantém integrações reais desativadas.
2. **Compatibilidade física não comprovada.** WebKit do Playwright e emulação de viewport não equivalem a Safari ou dispositivo real.
3. **Concorrência multiaba não integrada.** A idempotência remota reduz o risco, porém duas páginas compartilhando IndexedDB/PushSubscription ainda não foram exercitadas juntas.
4. **Automação responsiva tinha flake conhecido.** Uma corrida com `beforeinstallprompt` nativo do Chromium produziu timeout local em `/es/`; a branch bloqueia somente o evento confiável do navegador dentro do cenário sintético, sem modificar o site.
5. **Conformidade WCAG integral não é afirmada.** Os gates automatizados não substituem inspeção com tecnologia assistiva e julgamento humano.
6. **Nenhuma evidência operacional foi produzida.** Não há prova de entrega, retenção efetiva, recuperação real, custos, disponibilidade Azure ou comportamento de fornecedores — corretamente fora do escopo atual.

## Separação das evidências

- **Efetivamente executado:** testes Node/.NET/Python locais descritos na #160; Pa11y local; checks dos PRs #222/#223 verificados no GitHub.
- **Simulado:** permissão, inscrição, VAPID, API, IndexedDB, cancelamento, recuperação, expiração, indisponibilidade, concorrência por página, payload push e clique.
- **Pendente físico:** iOS/iPadOS, Android, Safari macOS, Chrome/Edge/Firefox desktop reais, tecnologias assistivas e offline em dispositivo.
- **Não executado por restrição:** permissão real, inscrição real, endpoint/chave real, envio, enqueue, deploy, release e qualquer alteração operacional.

## Parecer consolidado

O estágio apresenta evidência técnica suficiente para revisão humana, sem achado que justifique reprovar a arquitetura isolada. O gate global da #161 permanece **PENDENTE**, não aprovado automaticamente, pelos testes físicos e pela decisão humana explícita.

Recomendação ao responsável:

- manter #160 e #161 abertas enquanto houver combinações físicas não registradas;
- executar o roteiro da #160 e anexar resultados sem dados identificáveis;
- preservar a CI verde do PR #224 até a decisão;
- se a decisão humana permitir progressão técnica, registrá-la como limitada ao desenvolvimento posterior, sem interpretar como autorização para #162 nesta entrega, piloto, deploy, inscrição ou envio;
- manter #155/#156 como bloqueios obrigatórios antes de qualquer piloto real.
