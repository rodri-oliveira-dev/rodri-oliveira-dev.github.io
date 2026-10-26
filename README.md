# Rodrigo de Oliveira — Portfólio de Arquitetura de Software

Site profissional pessoal de **Rodrigo de Oliveira, Arquiteto de Software**.

**Site:** https://rodri-oliveira-dev.github.io/

O portfólio apresenta minha trajetória profissional, projetos open source, contribuições e publicações técnicas.

> **Este repositório não é um projeto open source e não está aberto para contribuições externas.**

## Conteúdo

A página inicial está organizada em:

- apresentação profissional;
- trajetória profissional em uma timeline;
- projetos e contribuições open source;
- artigos e publicações;
- informações pessoais e canais de contato.

## Idiomas e SEO

O site utiliza URLs dedicadas e indexáveis para cada idioma:

- Português (Brasil), idioma padrão: `/`
- Inglês: `/en/`
- Espanhol latino-americano: `/es/`
- URL legada em português: `/pt-br/`, redirecionada para `/`

As três homepages possuem URLs canônicas, alternates com `hreflang`, metadados Open Graph e dados estruturados Schema.org. O sitemap contém as variantes disponíveis de cada página e usa `lastmod` para sinalizar alterações relevantes.

## RSS da newsletter

Os artigos catalogados da newsletter **Café com código** também são publicados em RSS 2.0:

- Feed público: `https://rodri-oliveira-dev.github.io/newsletter/feed.xml`
- Fonte dos dados: `assets/data/newsletter-articles.json`
- Gerador: `.github/scripts/generate-newsletter-feed.py`

O feed é determinístico e contém todo o histórico válido presente no catálogo, ordenado do artigo mais recente para o mais antigo.

A atualização normal da newsletter é feita pelo workflow `.github/workflows/import-newsletter-article.yml`. Ele importa o artigo e, no mesmo ciclo, atualiza catálogo, homepage, RSS, JSON-LD e sitemap. Por isso, a execução diária de `.github/workflows/sync-newsletter-articles.yml` foi desativada. Esse workflow permanece disponível apenas por `workflow_dispatch` como mecanismo manual de reconciliação/fallback.

## Abordagem técnica

O site é intencionalmente livre de dependências de runtime:

- HTML semântico;
- CSS responsivo;
- JavaScript mínimo;
- nenhum framework ou dependência de package manager;
- publicação estática pelo GitHub Pages.

## Automação e qualidade

O repositório possui workflows para validação estrutural, acessibilidade, segurança do GitHub Actions, Lighthouse CI, saúde de links externos, atualização de dependências e automação de conteúdo.

A documentação completa dos workflows, gatilhos, quality gates, relatórios em Pull Requests e arquivos de suporte está em [`.github/README.md`](.github/README.md).

## Estrutura

- `index.html` — portfólio em português e idioma padrão
- `en/index.html` — portfólio em inglês
- `es/index.html` — portfólio em espanhol latino-americano
- `pt-br/index.html` — redirecionamento legado para a raiz em português
- `case-studies/` e `en/case-studies/` — estudos de caso arquiteturais bilíngues do portfólio
- `newsletter/feed.xml` — feed RSS 2.0 da newsletter Café com código
- `assets/data/newsletter-articles.json` — catálogo usado pela homepage e pelo RSS
- `assets/css/site.css` — sistema visual responsivo
- `assets/js/site.js` — comportamento mínimo de interface
- `assets/brand/` — identidade visual pessoal
- `favicon.svg` — ícone do site
- `robots.txt` — política para crawlers
- `sitemap.xml` — descoberta das URLs bilíngues
- `.nojekyll` — publicação direta pelo GitHub Pages

Os estudos de caso são descobertos automaticamente por `.github/scripts/sync-seo.py` quando existe um par `case-studies/<slug>/index.html` e `en/case-studies/<slug>/index.html`. O mesmo padrão alimenta sitemap, validações e notificações, evitando listas de URLs duplicadas ao adicionar novos estudos.

## Contato

- **E-mail:** [rodrigodotnet@outlook.com](mailto:rodrigodotnet@outlook.com)
- **WhatsApp:** [Entrar em contato](https://wa.me/5519998861786)
- **LinkedIn:** [linkedin.com/in/rodri-oliveira-dev](https://www.linkedin.com/in/rodri-oliveira-dev)

## Contribuições

Este repositório existe para hospedar e manter meu site profissional pessoal.

Contribuições externas, pull requests, propostas de funcionalidades e desenvolvimento orientado pela comunidade não são solicitados nem aceitos. A visibilidade pública do código-fonte não deve ser interpretada como convite para reutilização ou contribuição no projeto.

## Licença

Este repositório é **proprietário** e **não é open source**.

O código-fonte, textos, design, identidade visual, branding, logotipos, imagens e demais materiais são Copyright © 2026 Rodrigo de Oliveira. Todos os direitos reservados.

Consulte [LICENSE](LICENSE) para os termos completos.

## Presença profissional

- [Portfólio](https://rodri-oliveira-dev.github.io/)
- [LinkedIn](https://www.linkedin.com/in/rodri-oliveira-dev)
- [GitHub](https://github.com/rodri-oliveira-dev)
- [Medium](https://medium.com/@rodrigodotnet)
- [NuGet](https://www.nuget.org/profiles/rodri-oliveira-dev)
