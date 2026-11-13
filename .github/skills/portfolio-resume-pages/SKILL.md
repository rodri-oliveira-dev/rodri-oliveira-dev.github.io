---
name: portfolio-resume-pages
description: >-
  Editar os currículos HTML localizados e seus PDFs gerados,
  validar acessibilidade e SEO, e manter a publicação estática
  no GitHub Pages sem versionar binários de build.
---

# Currículo HTML, PDF e publicação

## Arquivos e fluxo

- Fontes: `curriculo/index.html`, `en/resume/index.html`, `es/curriculo/index.html` e o CSS compartilhado `curriculo/curriculo.css`.
- Gerador: `.github/scripts/generate-resume-pdf.mjs` usando Playwright/Chromium.
- Workflow: `.github/workflows/deploy-pages.yml`; PDFs públicos nas mesmas rotas dos HTMLs, com o nome `rodrigo-de-oliveira.pdf`.
- O PDF é derivado no CI e incorporado ao único artefato publicado; não deve ser commitado como fonte.

## Regras

1. Manter as versões `pt-BR`, `en` e `es-419` factualmente equivalentes, com canonical próprio, vínculo com `#person` e `hreflang` recíproco.
2. Garantir que informações profissionais e de contato sejam públicas, exatas, coerentes com o site e não confidenciais.
3. Manter o link de download e de retorno ao portfólio, os ícones acessíveis e o layout em tela e impressão A4.
4. Em PR, a geração fornece artefato de prévia; não publicar PR diretamente no Pages. Em `main`, o workflow publica o site completo com o PDF.
5. Evitar mudanças de dependências, flags de Chromium, branch de deploy ou permissões sem avaliar segurança e estabilidade.
6. Ao modificar HTML ou CSS dos currículos, revisar os `<lastmod>` das três rotas em `sitemap.xml` e sincronizar SEO; o CSS compartilhado afeta todas as versões.

## Validação

`python3 .github/scripts/sync-seo.py`, testes de SEO, `Site validation`, `Accessibility` e `Lighthouse CI`. Para mudanças de PDF, verificar tamanho/conteúdo do artefato gerado pelo workflow e a URL de download após publicação; não afirmar geração bem-sucedida sem evidência.
