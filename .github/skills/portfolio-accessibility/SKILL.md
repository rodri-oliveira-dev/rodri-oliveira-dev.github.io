---
name: portfolio-accessibility
description: >-
  Avaliar e implementar alterações de interface com objetivo WCAG 2.2 AA,
  responsividade, semântica HTML, navegação por teclado,
  desempenho e regressões visuais no portfólio estático.
---

# Acessibilidade e experiência responsiva

## Antes de editar

Ler `assets/css/site.css`, `assets/css/mobile-enhancements.css` e `assets/js/site.js`; nas páginas de serviços, incluir `assets/css/servicos.css`. Preservar a experiência sem JavaScript onde possível e usar componentes/estilos já existentes.

## Requisitos

- HTML semântico, um `h1` por página, landmarks, skip link, hierarquia coerente de títulos e links descritivos.
- Navegação integral por teclado, foco visível, controles com nomes acessíveis, estado correto de menu e `aria-current`.
- Imagens relevantes com texto alternativo adequado; ornamentais sem descrições redundantes.
- Contraste adequado, preferência de movimento reduzido quando houver animação e ausência de rolagem horizontal acidental.
- Verificar 320, 360, 390, 768, 1024 e 1440 px; menu móvel, seletor de idioma, ancoragem e contato.
- Evitar CSS/JS ou dependências que agravem performance ou violem a CSP publicada.

## Testes

- Contratos de idioma, navegação e serviços: `node .github/scripts/test-site-i18n.cjs` e `node .github/scripts/test-services.cjs`.
- Automação de responsividade: `.github/scripts/test-responsive.cjs` (requer ambiente de navegador configurado no workflow).
- Acessibilidade: `.github/workflows/accessibility.yml` com Pa11y CI; configuração em `.pa11yci.cjs`, incluindo fallback offline nos três idiomas. A cobertura automatizada não demonstra conformidade WCAG 2.2 AA.
- Verificar foco não obscurecido (2.4.11), alvos interativos (2.5.8, considerando exceções), navegação em estados dinâmicos e contraste renderizado. Registrar resultados manuais e limitações conforme `docs/accessibility-audit.md`.
- Qualidade percebida: `lighthouserc.cjs` e workflow `Lighthouse CI`; validar HTML e links no `Site validation`.

Quando CSS, JS ou imagens mudarem a experiência pública, aplicar a regra de `AGENTS.md`: atualizar o `<lastmod>` no sitemap de cada página realmente impactada, mesmo sem alteração direta no HTML.
