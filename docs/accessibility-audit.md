# Auditoria inicial de acessibilidade — issue #174

Revisão estática de código e configuração, 2026-11-24. Não é avaliação de conformidade. Nenhum resultado de execução do navegador ou leitor de tela foi obtido nesta revisão.

## Escopo e evidências

| Critério / superfície | Evidência existente | Lacuna / próxima verificação |
| --- | --- | --- |
| 1.1.1, 1.3.1, 2.4.2, 2.4.6, 3.1.1, 4.1.2 | Pa11y (axe e HTML_CodeSniffer); páginas PT/EN/ES | Suíte adicional inspeciona árvore AX via CDP: landmark main, heading nível 1, nomes de controles e estado expandido do menu móvel; execução pendente. Validar ordem de leitura, qualidade dos nomes e tecnologias assistivas manualmente |
| 1.4.3, 1.4.11 | check-contrast.mjs verifica tokens e combinações selecionadas | Exceção global de color-contrast removida: axe volta a avaliar contraste textual nas páginas renderizadas, com threshold zero. Execução pendente na CI; revisar casos inconclusivos, gradientes, imagens, estados dinâmicos e contraste não textual manualmente |
| 1.4.4, 1.4.10, 1.4.12 | test-responsive.cjs verifica larguras de 320 a 1440 px | Suíte adicional verifica tamanho computado de texto a 200%, viewport equivalente de 320px e espaçamento WCAG 1.4.12; execução pendente. Validar zoom nativo, perda visual de conteúdo e exceções manualmente |
| 2.1.1, 2.1.2, 2.4.1, 2.4.3, 2.4.7 | Teste do menu móvel, Escape e retorno de foco; skip link e estilo focus-visible | Percorrer todos os controles com Tab e Shift+Tab; verificar skip link, foco visível e ausência de armadilhas nas páginas internas |
| 2.4.11 (AA) | scroll-padding e teste de âncoras | Teste de regressão acrescentado para Tab e Shift+Tab: cabeçalho sticky, todas as rotas em 390/1440 px e homepages em 320/768 px. Execução pendente na CI. Ainda avaliar aviso expandido, viewport baixo, zoom e leitores de tela |
| 2.5.8 (AA) | CSS móvel prevê altura de 44px no menu e seletor de idioma; teste acrescentado | Verificar demais alvos e exceções do critério, desktop e mobile; 24×24 CSS px é o mínimo sem exceções, não 44px |
| 2.5.7 (AA) | Não foi identificado gesto de arrastar no código de navegação inspecionado | Inventariar demais componentes antes de declarar não aplicável |
| 3.2.6 (A) | Navegação compartilhada | Verificar consistência da posição relativa dos mecanismos de ajuda, quando repetidos |
| 3.3.7 (A), 3.3.8 (AA) | Nenhum fluxo de autenticação ou formulário identificado na homepage inspecionada | Confirmar escopo total e reavaliar quando novas interações forem introduzidas |
| 4.1.3 (AA) | Aviso PWA possui controles com aria-expanded e aria-controls | Validar anúncios de status sem mudança de foco quando aplicável; testar leitores de tela |
| PWA offline | Fallback HTML nos três idiomas com main, h1 e link | Incluir no Pa11y CI; testar offline real, navegação de retorno e tecnologia assistiva |
| PWA instalação | Botão de fechar e expandir com nomes acessíveis; alvos de 44px | Correção proposta: transferir foco ao rodapé seguinte antes de ocultar um descendente focado, com teste de regressão nos três idiomas. Validar em Safari/iOS e testar sobreposição e scroll |
| PDF | Currículos HTML no Pa11y | Avaliar PDFs gerados separadamente: tags, idioma, título, ordem de leitura, links e texto selecionável |

A matriz acima cobre áreas prioritárias, não todos os critérios A/AA. Completar inventário a partir da norma antes de concluir #174. Não marcar critérios como conformes ou não aplicáveis apenas por inspeção estática.

## Validação manual pendente

Para cada combinação de página, idioma, estado e ambiente, registrar commit, URL, navegador/versão, tecnologia assistiva/versão, passos, resultado observado, critério e issue de correção. Usar pelo menos VoiceOver com Safari e NVDA com um navegador compatível; incluir dispositivo iOS real para o aviso de instalação. Não substituir testes de leitor de tela por emulação de viewport.

## Estratégia de automação

Preservar Pa11y CI, threshold zero e os checks existentes. WCAG2AA é um parâmetro suportado pelo Pa11y; não renomeá-lo para WCAG22AA sem suporte comprovado. Mapear regras executadas e versão efetiva do axe antes de complementar cobertura. Testes de tamanho de controles isolados não substituem a avaliação de todas as exceções do critério 2.5.8. Testar páginas offline diretamente não comprova o funcionamento offline do service worker.

Referências: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [novos critérios](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/), [Pa11y](https://github.com/pa11y/pa11y).

## Preferências de contraste

Sistema, Normal e Alto contraste disponíveis nas rotas HTML e fallbacks; persistência local opcional e recursos no app shell. Testes de seleção, recarga e precedência da preferência do sistema adicionados. A avaliação visual e o contraste de todos os estados e modos permanecem pendentes de execução e revisão manual. O PDF impresso mantém seu estilo original.

### Correções após primeira execução

A CI reportou violações de contraste em áreas com fundos decorativos e translúcidos, além de incompatibilidade do mock de foco. A correção usa superfícies opacas da paleta, mantém a regra axe ativa e atualiza o mock para verificar transferência de foco. A nova execução deve confirmar o resultado; a inspeção dos logs não fornece todos os pares de cores calculados.

Na execução 45385105636, restaram 66 ocorrências de contraste: 21 em cada homepage e uma em cada estudo Dapper FluentMap. As demais 21 rotas não reportaram erros. Ajustados os fundos da seção de carreira, indicador de posição atual e células de tabela; confirmação depende da próxima CI. Site validation aprovado na execução 45385105606.

A execução 45386646721 repetiu as 66 ocorrências. O runner axe do Pa11y 9.1.1 converte tanto `violations` quanto `incomplete` em ocorrências e o reporter CLI não diferencia os casos. O código do axe 4.11.0 marca como inconclusivos elementos com pseudoelemento absoluto de fundo em ancestral quando sua área excede o limiar em relação ao texto. A linha decorativa da trajetória foi transferida para um elemento irmão da lista, oculto da árvore acessível. A direção isolada na tabela Dapper FluentMap foi substituída por palavra localizada, com cores explícitas. Essas são hipóteses fundamentadas no código do axe, não um diagnóstico confirmado pelos logs anteriores. A CI passa a registrar os resultados brutos de contraste em caso de falha e executar as outras suítes independentemente, sem relaxar o threshold. A confirmação permanece pendente.

Execução 45388037555: Pa11y/axe aprovado em 27/27 rotas (zero erros), tokens e preferências de contraste aprovados. A suíte de teclado falhou por uso de `$eval` em vez de `$$eval` (a função recebe um elemento, não uma lista). A suíte de adaptações detectou seis links do cabeçalho fora da viewport com fontes duplicadas. Corrigidos o seletor do teste e o layout flexível do cabeçalho; o deslocamento de rolagem acompanha a altura efetiva do cabeçalho via ResizeObserver. A aprovação das alterações depende de nova CI.

Execução 45389811113: Pa11y 27/27, responsividade, navegação por teclado e preferências de contraste aprovados. A suíte de adaptações passou nas nove primeiras rotas e interrompeu na ampliação de fonte do ADR Guard (grade de restrições). Ajustados os tamanhos mínimos dos tracks e a quebra de texto dos cards. Suítes de navegador agora acumulam falhas de cenários independentes e escrevem detalhes no resumo do Actions, mantendo exit code não zero; cenários dependentes podem ser interrompidos. Nova execução pendente.

Execução [45391452394](https://github.com/rodri-oliveira-dev/rodri-oliveira-dev.github.io/actions/runs/45391452394): Pa11y 27/27, responsividade/teclado 214/214, adaptações/AX 431/432 e preferências 28/28. A única falha acumulada foi espaçamento de texto (WCAG 1.4.12) na homepage ES a 320px, com 12 elementos potencialmente cortados na seção de publicações. Corrigidos os mínimos intrínsecos dos tracks e a quebra de texto dos componentes compartilhados da seção, preservando conteúdo, links e assertions. Sitemap conferido: as três homepages já possuem lastmod 2026-11-24. Confirmação da correção depende da nova CI.

Execução 45392478707: workflow Accessibility aprovado; demais workflows do commit e9d48cb também concluíram com sucesso. Review 6039253317: inspeção passa a detectar clipping em ancestrais, reflow compara texto e controles de main com referência desktop (alternativas explícitas de contato verificadas separadamente), altura do menu desconta a altura efetiva do cabeçalho e safe areas, evento de storage relê a preferência atual. Regressões adicionadas para clipping e eventos atrasados; nova CI necessária. Os testes manuais permanecem pendentes.
