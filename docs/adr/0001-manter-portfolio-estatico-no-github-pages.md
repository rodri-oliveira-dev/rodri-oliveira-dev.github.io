# Manter o portfólio estático no GitHub Pages

## Status

Accepted

## Context

O portfólio publica conteúdo profissional em português, inglês e espanhol. A hospedagem atual é o GitHub Pages, com páginas HTML, CSS, JavaScript e artefatos de currículo gerados por GitHub Actions. O conteúdo público não exige sessões, contas ou persistência de servidor.

Uma aplicação hospedada em serviço dinâmico traria mais opções para processamento no servidor, mas aumentaria custo, manutenção e superfície de ataque sem necessidade para o conteúdo atualmente publicado.

## Decision

Manter o portfólio público como site estático no GitHub Pages. Publicar o artefato a partir de `.github/workflows/deploy-pages.yml`, preservando a geração dos PDFs de currículo e as verificações existentes. Adotar funcionalidades progressivas no navegador quando elas não exigirem processamento confiável no servidor.

Qualquer necessidade futura de armazenamento durável, segredos ou envio de mensagens deve ser avaliada como serviço separado, sem transferir implicitamente toda a hospedagem do site para uma nova plataforma.

## Consequences

A solução permanece simples de operar, versionada e compatível com os processos atuais de revisão e publicação. Conteúdo público e comportamento do navegador não dependem da disponibilidade de uma API externa.

O GitHub Pages não executa código de backend nem armazena segredos de aplicação. Funcionalidades como inscrições Web Push, controle de envio e retenção de dados demandam infraestrutura externa e contratos de integração explícitos. A introdução desse serviço será uma decisão independente.
