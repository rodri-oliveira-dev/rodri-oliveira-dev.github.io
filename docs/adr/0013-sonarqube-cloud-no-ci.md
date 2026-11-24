# ADR 0013: Executar análise SonarQube Cloud no CI

## Status

Proposed

## Context

O portfólio iniciou a integração por Automatic Analysis, quando a aplicação era estritamente estática. O levantamento de novembro de 2026 não comprovou decoração de PR nem um Quality Gate calculado. O repositório agora reúne JavaScript, Python, GitHub Actions, PWA e Terraform, com evolução prevista para um backend de Web Push. A análise precisa ser reexecutável, rastreável por revisão e capaz de importar cobertura real sem acoplar a publicação ao scanner.

## Decision

Adotar exclusivamente CI-based analysis pelo GitHub Actions, preservando a identidade do projeto SonarQube Cloud e substituindo a configuração automática por sonar-project.properties. Executar análise em PRs internos para main, pushes em main e despacho manual restrito à main. O scanner aguarda o Quality Gate; falhas de configuração, análise, timeout ou reprovação permanecem visíveis. A ativação é explícita por variable e secret de menor privilégio, depois de desabilitar Automatic Analysis. PRs de forks e Dependabot não recebem o token.

Manter testes, acessibilidade, SEO, Lighthouse, validação Terraform e segurança de workflows independentes. Não tornar o check obrigatório nem alterar os gates de release até comprovar análise e decoração end-to-end, definir a política de contribuição externa e estabelecer cobertura instrumentada. A sincronização de findings de alto impacto é separada, inicialmente manual e opt-in, sem acesso a deploy ou Azure.

A alternativa de manter Automatic Analysis reduz credenciais e custo de execução, mas impede importação de cobertura e controle explícito do scanner. Executar apenas em release atrasaria feedback e poderia misturar falhas de qualidade com publicação.

## Consequences

A análise passa a consumir runner e depender da disponibilidade do SonarQube Cloud; a falha não impede a execução dos demais checks. A configuração externa do projeto e do token exige intervenção administrativa. Nenhuma cobertura será declarada sem relatório real; ausência de relatório pode reprovar o Quality Gate. A instrumentação de JavaScript, Python e eventual backend é evolução separada. O legado deve ser triado por risco, sem excluir traduções ou relaxar regras para obter aprovação. A sincronização não equivale à resolução comprovada de um defeito; exige análise recente e completa e opera somente sobre issues identificadas como gerenciadas pelo bot.
