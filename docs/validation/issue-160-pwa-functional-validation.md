# Evidências da issue #160 — validação funcional PWA e Web Push

Data da execução: 2026-11-27 (America/Sao_Paulo)

Baseline: `f18e317af7ddd33187ae7584443fcb3f9eada1f3` (`main`)

Escopo: implementações das issues #157, #158 e #159, sob as ADRs 0007 e 0022.

## Legenda

- **Executado localmente**: comando executado nesta validação, com mocks ou fixture local quando indicado.
- **Executado na CI**: resultado verificável dos PRs #222 ou #223; não foi reinterpretado como teste físico.
- **Simulado**: comportamento exercitado com APIs, dados e credenciais sintéticos.
- **Pendente físico**: depende do responsável e de dispositivo/tecnologia assistiva real.
- **Não aplicável**: proibido nesta etapa pela ADR 0022 ou pelo escopo da issue.

## Verificações automatizadas

| Verificação | Ambiente | Resultado |
| --- | --- | --- |
| `node --test .github/scripts/test-pwa.cjs .github/scripts/test-pwa-web-push.mjs` | Local, mocks sintéticos | **Aprovado: 48/48**, incluindo a matriz explícita iOS/Android/desktop. |
| `dotnet test backend/notifications-functions/Notifications.Functions.slnx --no-restore --nologo` | Local, fakes e dados sintéticos | **Aprovado: 72/72**. |
| `python .github/scripts/sync-seo.py` | Local | **Aprovado e idempotente**; não houve mudança textual de HTML ou sitemap. |
| `python -m unittest discover -s .github/scripts -p 'test_sync_seo.py'` | Local | **Aprovado: 25/25**. |
| `node .github/scripts/test-site-i18n.cjs` | Local | **Aprovado** para homes, currículos, serviços, estudos de caso e sitemap PT/EN/ES. |
| `node .github/scripts/test-services.cjs` | Local | **Aprovado: 6/6**. |
| `node --test .github/scripts/test-webmcp.mjs` | Local | **Aprovado: 13/13**. |
| `node .github/scripts/check-contrast.mjs` | Local | **Aprovado** para tokens, controles e estados verificados. |
| Pa11y CI, axe e HTML_CodeSniffer em 27 URLs | Local, Chrome headless e servidor `127.0.0.1` | **Aprovado: 27/27**, zero violações automatizadas. |
| Responsividade e teclado em 320, 360, 390, 768, 1024 e 1440 px | Local, Chrome headless | A primeira execução teve **216 aprovados e 1 timeout** no guia Android de `/es/`. A causa foi uma corrida entre o evento sintético e um `beforeinstallprompt` real do Chromium; após tornar o teste determinístico, a repetição passou **217/217**. |
| Adaptações de texto e árvore de acessibilidade | Local, Chrome headless | **Aprovado: 437/437** na repetição integral. Uma execução anterior teve 436/437 por recorte transitório em `/es/servicios/`; três repetições isoladas da rota passaram 18/18 e a repetição integral passou limpa. |
| Preferências de contraste | Local, Chrome headless | **Aprovado: 30/30**. |
| Fixture, gate público, offline e reconexão | Local, Playwright Chromium; CI do PR #224 nos três engines | **Aprovado** em Chromium, Firefox e WebKit. |
| Offline em Chromium, Firefox e WebKit | CI dos PRs #223 e #224 | **Aprovado nos três engines**. É automação de navegador, não teste em dispositivo nem Safari real. |
| WCAG, Lighthouse, Site validation, SEO, ADR Guard, Sonar e zizmor | CI do PR #224 | **Aprovado**. Jobs de deploy, release e infraestrutura ficaram ignorados. |

A primeira tentativa local de `test-accessibility-adaptations.cjs` foi invocada sem o servidor requerido e falhou somente com `ERR_CONNECTION_REFUSED`. Essa tentativa não é contabilizada como teste do produto; a execução válida com servidor local está registrada acima.

Evidências remotas: [PR #222](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/pull/222) e [PR #223](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/pull/223).

## Matriz funcional

| Área | Cenários validados | Tipo | Classificação |
| --- | --- | --- | --- |
| Ativação | Gate público desligado; consentimento afirmativo; gesto explícito; permissão concedida, negada e com exceção; conflito ou falha incerta de registro; nenhuma reinscrição automática | Simulado | **Aprovado** |
| Cancelamento | `202` remoto antes de `unsubscribe`; resposta perdida, `429`/`503`, backoff limitado; preservação da capacidade antes do aceite; limpeza local bem-sucedida e falha parcial | Simulado | **Aprovado** |
| Recuperação | Capacidade independente no corpo; ausência de registro local; nova digitação após falha; exportação local explícita sem log ou URL | Simulado | **Aprovado** |
| Expiração | Registro expirado; inscrição local ausente; ausência de renovação ou resubscribe automático | Simulado | **Aprovado** |
| Indisponibilidade | Recurso público fail-closed; contexto inseguro; APIs ausentes; iOS fora de standalone; permissão bloqueada; storage/API indisponíveis | Simulado | **Aprovado** |
| Concorrência | Colapso de ações simultâneas na mesma página; revogação idempotente e concorrente no repositório do backend | Simulado | **Aprovado no escopo coberto** |
| Concorrência entre abas | Duas instâncias reais compartilhando IndexedDB e PushSubscription | Não executado | **Pendente**; o contrato remoto é idempotente, mas falta um teste integrado multiaba. |
| Estados de erro | Falha de permissão, registro, storage, cancelamento remoto, limpeza local, bfcache e perda de capacidade | Simulado | **Aprovado** |
| Push e clique | Payload válido/inválido/expirado, limite de 4 KiB, destino same-origin permitido, foco/abertura e falhas assíncronas | Simulado | **Aprovado** |
| Entrega real e apresentação nativa | Provedor push, política do SO, prompt nativo, entrega e clique em dispositivo | Não aplicável nesta etapa | **Adiado para #166** |

## Matriz de compatibilidade

| Plataforma | Cobertura automatizada/simulada | Evidência física | Situação |
| --- | --- | --- | --- |
| Safari iOS/iPadOS, app na Tela de Início | Detecção por capacidades e standalone; estados e layout de 390 px | Não executada | **Pendente físico** |
| Safari iOS/iPadOS, navegação comum | Estado `install-required`, sem solicitar permissão | Não executada | **Pendente físico** |
| Chrome Android | Capacidades simuladas sem exigir instalação; guia `beforeinstallprompt`; offline Chromium | Não executada | **Pendente físico** |
| Chrome/Edge desktop | Capacidades desktop simuladas; Chromium offline e teclado | Não executada | **Pendente físico** |
| Firefox desktop | Contratos de ciclo simulados; offline Firefox | Não executada | **Pendente físico** |
| Safari macOS | Contexto desktop simulado; offline WebKit do Playwright | Não executada; WebKit não equivale a Safari/macOS | **Pendente físico** |
| EN/ES em todos os ambientes | Ausência de UI Web Push, navegação, SEO e offline automatizados | Amostragem física não executada | **Automação aprovada; físico pendente** |

## Fixture manual isolado

O fixture `.github/scripts/fixtures/web-push-manual.html` usa somente implementações falsas em memória. Ele não acessa `Notification`, `PushManager`, Service Worker, `fetch`, endpoint real ou credencial real. O preparador copia apenas os sete arquivos necessários para um diretório temporário; `.github` não faz parte da allowlist do Pages.

Preparação:

```powershell
python .github/scripts/prepare-web-push-manual-fixture.py
Set-Location <diretorio-impresso>
python serve.py --port 8080 --bind 127.0.0.1 --directory .
```

Para inspeção em um dispositivo físico na mesma rede privada, o responsável pode reiniciar **o diretório isolado**, nunca a raiz do repositório, trocando o bind por `--bind 0.0.0.0` e acessar `http://<IP-LAN>:8080/`. Encerrar o servidor ao terminar. O fixture serve apenas para layout, teclado, leitor de tela e transições simuladas; não comprova APIs Web Push nativas.

## Roteiro físico para o responsável

1. Registrar modelo, versão do sistema, navegador/versão, modo comum ou instalado, largura/orientação e tecnologia assistiva. Não capturar tokens, endpoints ou credenciais.
2. Abrir o fixture isolado e percorrer todos os estados do seletor. Em cada um, verificar título/descrição anunciados, foco visível, ordem de tabulação, zoom de 200%, texto ampliado, rotação e ausência de rolagem horizontal.
3. Em iPhone/iPad, confirmar visualmente a orientação de Tela de Início em navegação comum e o layout em modo standalone. Não aceitar prompt nativo de notificação nesta etapa.
4. Em Android, validar o guia manual e a ação de instalação apenas quando oferecida pelo navegador. No fixture, validar ativação, cancelamento e falhas exclusivamente simulados.
5. Em desktop, repetir com Chrome ou Edge, Firefox e Safari macOS quando disponível; incluir teclado e leitor de tela disponível no sistema.
6. Confirmar que EN e ES não apresentam controles Web Push e que menus, troca de idioma e conteúdo continuam utilizáveis.
7. Quando houver ambiente HTTPS autorizado para a revisão física, validar instalação, atualização, fechamento/reabertura, bfcache e navegação offline PT/EN/ES. Não solicitar permissão real, criar inscrição ou executar envio durante #160.
8. Anexar à issue somente a tabela de resultados e observações sem dados identificáveis. Marcar cada combinação como aprovada, reprovada, pendente ou indisponível; não extrapolar para combinações não testadas.

## Conclusão da #160

Os contratos automatizados e simulados cobrem os fluxos funcionais exigidos sem efeito operacional. A issue permanece **pendente**, pois testes físicos, leitor de tela real e concorrência integrada entre abas não devem ser inventados nem substituídos por emulação.
