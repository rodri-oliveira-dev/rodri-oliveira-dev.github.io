# Decisões arquiteturais do portfólio

Este diretório registra escolhas que alteram responsabilidades, infraestrutura ou operação do portfólio. As ADRs descrevem o problema, a decisão e os custos aceitos. Detalhes de implementação permanecem na documentação técnica e no código.

| ADR | Decisão | Status |
| --- | --- | --- |
| [0001](0001-manter-portfolio-estatico-no-github-pages.md) | Manter o portfólio público no GitHub Pages | Accepted |
| [0002](0002-oferecer-pwa-progressiva-com-suporte-offline.md) | Instalação e navegação offline como recursos progressivos | Accepted |
| [0003](0003-versionar-decisoes-e-validar-com-adr-guard.md) | Versionar decisões e validá-las no CI | Accepted |
| [0004](0004-planejar-backend-separado-para-web-push.md) | Serviço Web Push serverless na GCP | Superseded |
| [0005](0005-notificar-artigos-apos-publicacao-confirmada.md) | Notificar apenas artigos PT-BR após publicação confirmada | Proposed |
| [0006](0006-proteger-dados-de-inscricoes-web-push.md) | Minimizar e proteger dados das inscrições | Proposed |
| [0007](0007-oferecer-web-push-em-navegadores-compativeis.md) | Inscrição em navegadores compatíveis, inclusive desktop | Proposed |
| [0008](0008-gerenciar-infraestrutura-gcp-com-terraform-no-monorepo.md) | Terraform e governança da GCP no monorepo | Superseded |
| [0009](0009-adotar-azure-para-web-push-por-custo.md) | Adotar Azure para Web Push por controle de custos | Accepted |
| [0010](0010-tratar-acessibilidade-como-requisito-transversal.md) | Tratar acessibilidade como requisito transversal | Proposed |
| [0011](0011-preferencias-de-contraste-locais.md) | Preferências locais de contraste | Proposed |
| [0012](0012-controlar-publicacao-por-release-manual.md) | Coordenar releases manuais do monorepo | Accepted |
| [0013](0013-sonarqube-cloud-no-ci.md) | Executar análise SonarQube Cloud no CI | Proposed |
| [0014](0014-gerenciar-cosmos-sem-chaves-e-separar-iam.md) | Gerenciar Cosmos sem chaves e separar o IAM de runtime | Accepted |

## Como manter

- Cada decisão ocupa um arquivo `NNNN-descricao.md`, com as seções canônicas `Status`, `Context`, `Decision` e `Consequences`.
- `Accepted` identifica uma decisão adotada. `Proposed` significa que ela ainda depende de avaliação e aprovação, mesmo quando o texto descreve uma solução preferida.
- Atualizações devem preservar a história e explicitar mudança de contexto, substituição ou impacto. Não tratar o resultado da CI como aprovação da decisão.
- Incluir novas ADRs e alterações de status neste índice no mesmo PR. A validação automática está em [ADR Guard](../../.github/workflows/adr-guard.yml) e utiliza `command: check`.
- ADRs são documentação interna e não alteram, por si só, o conteúdo indexável do site ou o `sitemap.xml`.

O [ADR Guard](https://github.com/rodri-oliveira-dev/adr-guard) valida estrutura e relacionamentos. A revisão do mérito técnico permanece responsabilidade humana.
