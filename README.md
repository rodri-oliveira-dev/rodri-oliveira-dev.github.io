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

As três homepages e os cinco estudos de caso por idioma possuem URLs canônicas próprias, alternates recíprocos com `hreflang`, metadados Open Graph/Twitter e dados estruturados Schema.org. O HTML usa `pt-BR`, `en` e `es-419`; para descoberta do Google, o espanhol usa `hreflang="es"` e o português permanece como `x-default`.

O seletor PT/EN/ES preserva a página equivalente: na homepage troca apenas o idioma da homepage e, em um estudo de caso, mantém o mesmo slug. O idioma ativo é identificado visualmente e por `aria-current="page"`.

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

O repositório possui workflows para validação estrutural, acessibilidade, segurança do GitHub Actions, Lighthouse CI, saúde de links externos, atualização de dependências e automação de conteúdo. Os gates cobrem HTML, links, ortografia PT/EN/ES, canonical/hreflang, sitemap/JSON-LD, navegação por teclado e layout responsivo.

A documentação completa dos workflows, gatilhos, quality gates, relatórios em Pull Requests e arquivos de suporte está em [`.github/README.md`](.github/README.md).

## Estrutura

- `index.html` — portfólio em português e idioma padrão
- `en/index.html` — portfólio em inglês
- `es/index.html` — portfólio em espanhol latino-americano
- `pt-br/index.html` — redirecionamento legado para a raiz em português
- `case-studies/`, `en/case-studies/` e `es/case-studies/` — cinco estudos de caso arquiteturais em português, inglês e espanhol
- `newsletter/feed.xml` — feed RSS 2.0 da newsletter Café com código
- `assets/data/newsletter-articles.json` — catálogo usado pela homepage e pelo RSS
- `assets/css/site.css` — sistema visual responsivo
- `assets/js/site.js` — comportamento mínimo de interface
- `assets/brand/` — identidade visual pessoal
- `favicon.svg` — ícone do site
- `robots.txt` — política para crawlers
- `sitemap.xml` — descoberta das URLs trilíngues e seus alternates recíprocos
- `.nojekyll` — publicação direta pelo GitHub Pages

Os estudos de caso são descobertos automaticamente por `.github/scripts/sync-seo.py` a partir do mesmo slug em `case-studies/<slug>/index.html`, `en/case-studies/<slug>/index.html` e `es/case-studies/<slug>/index.html`. A cobertura completa nos três idiomas é obrigatória. O sincronizador preserva o `lastmod` versionado de páginas sem alteração factual e falha quando uma tradução está ausente.

## Atualização de páginas localizadas

Toda mudança de conteúdo deve considerar as três versões do site. Para adicionar ou atualizar uma página:

1. mantenha conteúdo tecnicamente equivalente em PT-BR, EN e espanhol latino-americano, sem traduzir automaticamente artigos externos;
2. use o mesmo slug nas três árvores e faça o seletor apontar para as páginas equivalentes;
3. localize conteúdo, navegação, rótulos acessíveis, metadados e JSON-LD, preservando nomes próprios, tecnologias, URLs e o idioma original das fontes;
4. execute `python .github/scripts/sync-seo.py` para sincronizar alternates e `sitemap.xml`;
5. execute `python -m unittest discover -s .github/scripts -p 'test_*.py'`, `node .github/scripts/test-site-i18n.cjs` e os validadores descritos em [`.github/README.md`](.github/README.md).

Uma segunda execução de `sync-seo.py` deve deixar o worktree sem alterações. O sincronizador da newsletter continua alterando apenas a homepage portuguesa e seus artefatos; o sincronizador do DEV Community continua alterando apenas a homepage inglesa. A homepage espanhola referencia essas publicações como conteúdo externo no idioma original e não cria traduções ou entidades estruturadas fictícias.

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
