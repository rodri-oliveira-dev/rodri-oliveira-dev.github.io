# Instruções para agentes

Este arquivo se aplica a todo o repositório. Ele contém as regras permanentes para qualquer agente que leia, revise ou altere o portfólio. Procedimentos específicos estão em `.github/skills/*/SKILL.md`; a referência operacional dos workflows está em `.github/AUTOMATION.md`.

## Objetivo e arquitetura

- Preservar um portfólio profissional estático, publicado no GitHub Pages, sem backend e sem complexidade desnecessária.
- Trabalhar a partir do conteúdo versionado, sem inventar experiência, certificações, resultados, números, clientes atuais, depoimentos, preços ou endossos.
- Manter conteúdo claro, natural, sóbrio e tecnicamente correto, com foco em arquitetura de software e evidências verificáveis.
- Preferir ajustes pequenos, rastreáveis e compatíveis com o desenho atual; não introduzir frameworks, dependências, telemetria ou serviços externos sem necessidade explícita.

## Regra obrigatória: sitemap em toda mudança do site

**Toda alteração que afete o site publicado deve acompanhar, no mesmo PR/commit, a atualização de `sitemap.xml`, especialmente o `<lastmod>` das URLs indexáveis afetadas. Não concluir a tarefa sem verificar o sitemap.**

1. Identificar as páginas realmente afetadas: HTML, conteúdo renderizado por catálogos, CSS, JavaScript, imagens, componentes ou recursos compartilhados. Uma mudança global pode afetar várias URLs; alterações restritas a uma página não devem atualizar todas as demais.
2. Após modificar o site, executar `python3 .github/scripts/sync-seo.py` **antes do commit**, com os arquivos alterados ainda detectáveis pelo Git.
3. Inspecionar `git diff -- sitemap.xml`. Confirmar que todas as URLs afetadas possuem `<lastmod>` atualizado para a data da mudança, em `YYYY-MM-DD` (UTC), e que novas URLs indexáveis possuem entradas válidas. Preservar datas de URLs sem alteração real.
4. Se a alteração afetar somente recursos compartilhados (por exemplo, CSS, JS ou imagem), o gerador pode não detectar as páginas impactadas. Nesse caso, atualizar manualmente os `<lastmod>` correspondentes no sitemap e executar novamente o sincronizador para verificar que as datas permanecem estáveis.
5. Se o sincronizador alterar HTML/JSON-LD, revisar esse diff e confirmar novamente o sitemap. Incluir os artefatos gerados junto com a mudança original; nunca usar a data atual para simular atualização de conteúdo inexistente.
6. Executar `python3 -m unittest discover -s .github/scripts -p 'test_sync_seo.py'` e conferir o gate de SEO. Se uma atualização real do site não produzir mudança no sitemap, investigar antes de finalizar.

Mudanças exclusivamente internas, como documentação de manutenção, skills, `AGENTS.md`, workflows ou testes que não alterem o site publicado, **não justificam** modificar `<lastmod>`. O RSS não é uma URL indexável listada no sitemap; alterações de artigo devem refletir a página de destino efetivamente atualizada.

## Idiomas e integridade editorial

- Idiomas do site: português do Brasil (`/`, `lang="pt-BR"`), inglês (`/en/`, `lang="en"`) e espanhol latino-americano (`/es/`, `lang="es-419"`). O `hreflang` espanhol usa `es`, conforme a implementação atual.
- Alterações em páginas equivalentes devem ser refletidas nas três versões no mesmo PR, mantendo significado, estrutura, navegação e tom natural em cada idioma. Não traduzir automaticamente artigos externos.
- Currículos publicados: português em `/curriculo/`, inglês em `/en/resume/` e espanhol em `/es/curriculo/`; manter conteúdo factual equivalente e `hreflang` recíproco.
- Preservar os vínculos entre cada tradução, URLs canônicas, metadados Open Graph/Twitter, JSON-LD e links internos. Usar a URL publicada `https://rodri-oliveira-dev.github.io/`.
- Dar preferência a frases claras, concretas e sem exageros comerciais. Não atribuir resultados open source a clientes ou trabalhos anteriores.

## Segurança, acessibilidade e compatibilidade

- Preservar a CSP restritiva, a política sem credenciais no cliente e as funcionalidades progressivas. WebMCP é experimental, somente leitura e não substitui SEO/HTML.
- Manter navegação por teclado, foco visível, landmarks, texto alternativo, hierarquia de títulos, contraste e leiaute responsivo. Testar impactos em 320, 360, 390, 768, 1024 e 1440 px quando a interface mudar.
- Não incluir informações privadas, tokens, dados profissionais confidenciais ou detalhes não publicados em páginas, scripts, testes e artefatos de CI.
- Manter o currículo PDF gerado pelo workflow a partir do HTML/CSS. Não versionar o PDF de build como fonte.

## Verificações e entrega

Aplicar os testes pertinentes à alteração, incluindo:

- `python3 .github/scripts/sync-seo.py`
- `python3 -m unittest discover -s .github/scripts -p 'test_sync_seo.py'`
- `node .github/scripts/test-site-i18n.cjs`
- `node .github/scripts/test-services.cjs`
- `node --test .github/scripts/test-webmcp.mjs`
- `git diff --check`

Usar os workflows `Site validation`, `SEO validation`, `Accessibility`, `Lighthouse CI` e `GitHub Actions security` conforme a área impactada. Não alterar ou contornar checks obrigatórios para forçar sucesso. Em mudanças de workflows, preservar permissões mínimas, pinning de actions e a proteção da `main`. Criar PR com resumo, páginas/idiomas afetados, alterações de sitemap e verificações efetivamente executadas; não alegar testes não executados.

## Skills disponíveis

- `.github/skills/portfolio-seo-sitemap/SKILL.md`: SEO técnico, canonical, JSON-LD e `lastmod`.
- `.github/skills/portfolio-localization/SKILL.md`: revisão editorial e sincronização de idiomas.
- `.github/skills/portfolio-services/SKILL.md`: páginas de serviços e narrativa comercial baseada em evidências.
- `.github/skills/portfolio-case-studies/SKILL.md`: estudos de caso trilíngues.
- `.github/skills/portfolio-accessibility/SKILL.md`: acessibilidade e responsividade.
- `.github/skills/portfolio-content-sync/SKILL.md`: newsletter, DEV Community, Hashnode e feeds.
- `.github/skills/portfolio-webmcp/SKILL.md`: ferramentas para agentes no navegador.
- `.github/skills/portfolio-resume-pages/SKILL.md`: currículo HTML, PDF e deploy no Pages.
- `.github/skills/portfolio-ci-automation/SKILL.md`: workflows, segurança e quality gates.

Carregar apenas as skills relevantes à tarefa; as regras deste arquivo permanecem obrigatórias em todos os casos.
