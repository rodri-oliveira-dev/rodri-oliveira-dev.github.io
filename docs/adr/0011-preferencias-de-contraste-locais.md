# ADR 0011: Preferências de contraste locais

## Status

Proposed

## Context

O portfólio estático e multilíngue deve permitir uma apresentação de contraste ampliado sem depender de serviços externos. A preferência do sistema pode não estar disponível em todos os navegadores.

## Decision

Oferecer as opções Sistema (padrão), Normal e Alto contraste, com precedência da escolha explícita sobre prefers-contrast. Usar CSS compartilhado e persistência local opcional, sem transmissão de dados. Manter o contraste padrão adequado independentemente da escolha. Incluir recursos no app shell e preservar a impressão do currículo.

## Consequences

A preferência é limitada ao contexto de armazenamento do navegador ou PWA. Sem JavaScript, a preferência do sistema continua aplicável; sem armazenamento, a seleção funciona na página atual. Ambas as apresentações precisam de testes de regressão e avaliação manual de contraste. Não há garantia de conformidade integral pela existência do seletor.
