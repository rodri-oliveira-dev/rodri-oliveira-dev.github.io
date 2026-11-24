# ADR 0011: Preferências de contraste locais

## Status

Proposed

## Context

O portfólio estático e multilíngue deve permitir uma apresentação de contraste ampliado sem depender de serviços externos. A preferência do sistema pode não estar disponível em todos os navegadores.

## Decision

Substituir a interface anterior de três opções por uma chave binária de alto contraste junto ao seletor de idiomas. Desligada representa Normal; ligada representa Alto contraste. Na ausência de escolha explícita (inclusive o valor legado Sistema), o estado inicial e as mudanças seguem prefers-contrast; a primeira interação registra Normal ou Alto contraste e prevalece sobre a preferência do dispositivo. O fallback offline mantém o controle dentro do conteúdo. Usar CSS compartilhado e persistência local opcional, sem transmissão de dados. Manter o contraste padrão adequado independentemente da escolha. Incluir recursos no app shell e preservar a impressão do currículo.

## Consequences

A preferência é limitada ao contexto de armazenamento do navegador ou PWA. Sem JavaScript, a preferência do sistema continua aplicável; sem armazenamento, a seleção funciona na página atual. A opção Sistema deixa de ser oferecida na interface; limpar a preferência local restaura o comportamento do dispositivo. Ambas as apresentações precisam de testes de regressão e avaliação manual de contraste. Não há garantia de conformidade integral pela existência do seletor.
