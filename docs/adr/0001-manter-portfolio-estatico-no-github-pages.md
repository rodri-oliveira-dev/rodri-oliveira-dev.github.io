# Manter o portfólio público no GitHub Pages

## Status

Accepted

## Context

O portfólio reúne apresentação profissional, currículo, estudos de caso e artigos em três idiomas. O conteúdo é público, versionado no Git e não depende de autenticação ou dados fornecidos pelos visitantes. A publicação já utiliza GitHub Actions para validar o site, gerar os currículos em PDF e entregar os arquivos estáticos ao GitHub Pages.

Migrar tudo para uma aplicação com servidor permitiria implementar funcionalidades dinâmicas no mesmo processo. Em contrapartida, acrescentaria operação, custo recorrente e uma superfície de segurança que o conteúdo atual não justifica. A alternativa de manter o site estático não impede serviços complementares quando houver necessidade real.

## Decision

O GitHub Pages continua responsável pela entrega do portfólio. HTML, CSS, JavaScript e arquivos gerados permanecem no repositório; o workflow `.github/workflows/deploy-pages.yml` monta e publica o artefato. A cadência de publicação é tratada na [ADR 0012](0012-controlar-publicacao-por-release-manual.md).

Funcionalidades que exigirem execução confiável no servidor, armazenamento persistente ou segredos devem ser isoladas em serviços próprios, acessados pelo site por contratos explícitos. Não migraremos a hospedagem das páginas para acomodar uma funcionalidade periférica.

## Consequences

A publicação permanece simples, rastreável e independente da disponibilidade de eventuais APIs. O site pode continuar acessível mesmo que um serviço complementar apresente falhas.

Essa escolha cria uma fronteira operacional: GitHub Pages não executa código de servidor nem protege credenciais de aplicação. Cada integração dinâmica precisará resolver autenticação, disponibilidade, observabilidade e custos sem transferir essas responsabilidades para o frontend. A proposta de Web Push é tratada separadamente na [ADR 0004](0004-planejar-backend-separado-para-web-push.md).
