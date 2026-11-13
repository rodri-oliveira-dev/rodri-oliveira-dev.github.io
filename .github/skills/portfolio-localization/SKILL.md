---
name: portfolio-localization
description: >-
  Revisar, traduzir e manter conteúdo do site em português brasileiro,
  inglês e espanhol latino-americano, incluindo navegação, acessibilidade,
  metadados, links equivalentes e consistência editorial trilíngue.
---

# Localização e revisão editorial

## Escopo

- Homepages: `index.html`, `en/index.html`, `es/index.html`.
- Serviços: `servicos/index.html`, `en/services/index.html`, `es/servicios/index.html`.
- Estudos de caso: `case-studies/*/index.html` e os equivalentes em `en/` e `es/`.
- README em `README.md`, `README.en.md` e `README.es.md` quando a solicitação incluir a documentação.

## Regras de linguagem

- Usar português natural do Brasil, inglês profissional e espanhol latino-americano (não converter para espanhol europeu).
- Manter tom sóbrio, direto e humano, evitando jargões vazios, calques e superlativos infundados.
- Preservar termos técnicos, nomes oficiais de projetos, URLs, marcas e fatos comprovados; adaptar expressões sem tradução literal obrigatória.
- Distinguir experiência profissional anterior, projetos demonstrativos e trabalho freelance; nunca sugerir clientes atuais, parcerias ou endossos sem evidência.
- Para alteração em conteúdo equivalente, revisar as três versões no mesmo PR. Exceções devem ser justificadas explicitamente.

## Contratos técnicos

- `lang`: `pt-BR`, `en`, `es-419`; `hreflang`: `pt-BR`, `en`, `es`, mais `x-default` quando aplicável.
- Verificar seletor de idioma, `aria-current="page"`, labels de navegação e links para a página correspondente, não apenas para a homepage.
- Revisar `title`, `meta description`, Open Graph, Twitter, texto alternativo e JSON-LD localizado quando houver modificação textual.
- Artigos externos em DEV Community, Hashnode e newsletter mantêm o idioma/origem do catálogo; não fabricar versões traduzidas.
- Currículos: `/curriculo/` (`pt-BR`), `/en/resume/` (`en`) e `/es/curriculo/` (`es-419`); preservar equivalência factual com redação editorial natural.

## Validação

Executar `node .github/scripts/test-site-i18n.cjs`, `node .github/scripts/test-services.cjs` quando aplicável e `python3 .github/scripts/sync-seo.py`. Conferir `sitemap.xml` e testes SEO conforme `AGENTS.md`. Quando a interface mudar, testar teclado e layout responsivo.
