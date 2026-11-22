# Decisões arquiteturais do portfólio

Este diretório registra o contexto, a decisão e as consequências de escolhas importantes no portfólio. O histórico usa o [formato canônico do ADR Guard](https://github.com/rodri-oliveira-dev/adr-guard/blob/v1.12.0/docs/github-action.pt-BR.md).

| ADR | Decisão | Status |
| --- | --- | --- |
| [0001](0001-manter-portfolio-estatico-no-github-pages.md) | Manter o portfólio estático no GitHub Pages | Accepted |
| [0002](0002-oferecer-pwa-progressiva-com-suporte-offline.md) | Oferecer PWA progressiva com suporte offline | Accepted |
| [0003](0003-versionar-decisoes-e-validar-com-adr-guard.md) | Versionar decisões e validar com ADR Guard | Accepted |
| [0004](0004-planejar-backend-separado-para-web-push.md) | Planejar backend separado para Web Push | Proposed |
| [0005](0005-notificar-artigos-apos-publicacao-confirmada.md) | Notificar artigos após publicação confirmada | Proposed |

## Convenções

- Criar um arquivo por decisão em `docs/adr/NNNN-titulo-em-kebab-case.md`, com seções `Status`, `Context`, `Decision` e `Consequences`.
- Usar `Proposed` para alternativas ainda não aprovadas. Somente uma decisão humana registrada em PR altera o status para `Accepted`; o sucesso do CI não significa aprovação técnica.
- Não reescrever silenciosamente decisões anteriores. Registrar revisão ou substituição de forma rastreável quando necessário.
- Atualizar este índice no mesmo PR da criação ou da alteração de status de uma ADR.
- O workflow [ADR Guard](../../.github/workflows/adr-guard.yml) usa `check` nos PRs e na `main`; ele **valida** documentos versionados, mas não os redige, aprova nem modifica.
- Como são documentos internos de governança, alterações apenas neste diretório não atualizam datas do `sitemap.xml`.

Para uma validação local, instale uma versão compatível da [CLI ADR Guard](https://github.com/rodri-oliveira-dev/adr-guard) e execute `adr-guard check docs/adr`.
