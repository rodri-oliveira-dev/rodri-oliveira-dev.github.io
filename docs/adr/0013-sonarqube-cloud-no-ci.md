# ADR 0013: Executar análise SonarQube Cloud no CI

## Status

Proposed

## Context

O portfólio iniciou a integração por Automatic Analysis, quando a aplicação era estritamente estática. O levantamento de novembro de 2026 não comprovou decoração de PR nem um Quality Gate calculado. O repositório agora reúne JavaScript, Python, GitHub Actions, PWA e Terraform, com evolução prevista para um backend de Web Push. A análise precisa ser reexecutável, rastreável por revisão e capaz de importar cobertura real sem acoplar a publicação ao scanner.

## Decision

Adotar exclusivamente CI-based analysis pelo GitHub Actions, preservando a identidade do projeto SonarQube Cloud e substituindo a configuração automática por sonar-project.properties. Executar análise em PRs internos para main, pushes em main e despacho manual na main pelo workflow Site validation, que chama o workflow Sonar reutilizável. O job de testes de produto gera LCOV com Node.js 24; o mesmo relatório é compartilhado com o scanner por artefato da própria execução. Não repetir os testes de produto para o Sonar. O scanner aguarda o Quality Gate; falhas de configuração, análise, timeout ou reprovação permanecem visíveis. A ativação é explícita por variable e secret de menor privilégio, depois de desabilitar Automatic Analysis. PRs de forks e Dependabot não recebem o token.

Delimitar o escopo do Sonar ao código de produto e à infraestrutura elegível, excluindo integralmente `.github/**` (workflows, scripts, testes e metadados de automação). A automação continua sujeita aos checks próprios de testes, actionlint e zizmor. Publicar o resultado do Quality Gate no resumo da execução e em um comentário atualizado por PR interno, distinguindo aprovação, falha e ausência de análise. O job de publicação de comentário tem permissão de escrita restrita e não executa código do checkout.

Manter testes, acessibilidade, SEO, Lighthouse, validação Terraform e segurança de workflows independentes. Não tornar o check obrigatório nem alterar os gates de release até comprovar análise e decoração end-to-end, definir a política de contribuição externa e estabelecer cobertura instrumentada. A sincronização de findings de alto impacto é separada, inicialmente manual e opt-in, sem acesso a deploy ou Azure.

A alternativa de manter Automatic Analysis reduz credenciais e custo de execução, mas impede importação de cobertura e controle explícito do scanner. Executar apenas em release atrasaria feedback e poderia misturar falhas de qualidade com publicação.

## Consequences

A análise passa a consumir runner e depender da disponibilidade do SonarQube Cloud; a falha não impede a execução dos demais checks. A configuração externa do projeto e do token exige intervenção administrativa. Nenhuma cobertura será declarada sem relatório real; ausência de relatório pode reprovar o Quality Gate. A instrumentação JavaScript usa a cobertura nativa V8/Node.js e caminhos de origem reais, inclusive nos testes com VM. A cobertura do futuro backend será integrada quando houver código executável correspondente. O Quality Gate permanece inalterado; diagnósticos por arquivo orientam a triagem de duplicações sem excluir páginas localizadas. O legado deve ser triado por risco, sem excluir traduções ou relaxar regras para obter aprovação. A sincronização não equivale à resolução comprovada de um defeito; exige análise recente e completa e opera somente sobre issues identificadas como gerenciadas pelo bot.
