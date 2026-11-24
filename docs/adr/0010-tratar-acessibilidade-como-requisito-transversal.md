# Tratar acessibilidade como requisito transversal do portfólio

## Status

Proposed

## Context

O portfólio possui três versões linguísticas, experiência PWA progressiva e controles automatizados de acessibilidade. O pipeline já utiliza Pa11y CI com axe e HTML_CodeSniffer, validação de contraste e testes de navegação por teclado. A existência desses controles não comprova conformidade integral com WCAG 2.2 AA.

Manter apenas um indicador Lighthouse ou uma declaração pública sem evidência seria insuficiente. Adicionar outra ferramenta de análise automatizada neste momento duplicaria parte dos controles existentes sem resolver as lacunas de avaliação manual.

## Decision

Adotar WCAG 2.2 AA como objetivo transversal das interfaces sob controle do portfólio, sem declarar conformidade antes de avaliação apropriada. Manter uma declaração trilíngue em `ACCESSIBILITY.md` e revisar seu conteúdo quando houver alterações relevantes de escopo ou evidências.

Preservar os gates existentes e avaliar a cobertura dos critérios da versão 2.2 antes de alterar a configuração. Para mudanças de interface, considerar semântica, foco, teclado, contraste, redução de movimento, responsividade, alternativas textuais e estados dinâmicos nas três versões. Incluir fluxos de instalação, offline e notificações quando aplicáveis. Complementar automação com avaliação manual de teclado e leitores de tela; registrar navegador, tecnologia assistiva, escopo, resultados e limitações. Avaliar PDFs separadamente.

Registrar barreiras identificadas como trabalho rastreável, priorizando impacto sobre o usuário. Não desabilitar gates para acomodar regressões.

## Consequences

A declaração torna o objetivo e as limitações transparentes, sem confundir aprovação de testes com certificação. O custo de manutenção inclui revisão editorial trilíngue e avaliações manuais proporcionais ao risco. Não há necessidade imediata de nova dependência, serviço externo ou alteração da arquitetura de hospedagem.

A implementação incremental depende de avaliação e aprovação humana desta decisão.
