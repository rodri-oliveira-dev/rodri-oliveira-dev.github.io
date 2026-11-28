# Disparar notificações de artigos somente após a publicação do site

## Status

Proposed

### Atualização de 28/11/2026 — preparação para abertura pública

O responsável autorizou a abertura pública real do Web Push, sem tornar obrigatório um piloto individual anterior. A finalidade permanece estritamente limitada a artigos novos PT-BR e o processamento real continua condicionado à publicação confirmada, deduplicação durável, gates #155, #156 e #167, confirmações explícitas e kill switches. A autorização de produto não comprova entrega, operação, privacidade ou conformidade jurídica e não altera o status `Proposed` desta ADR.

## Context

A atualização editorial não corresponde necessariamente a conteúdo disponível ao visitante. O fluxo `import-newsletter-article.yml` incorpora manualmente artigos em português e abre PR; `sync-newsletter-articles.yml` é um mecanismo de reconciliação manual. Os fluxos DEV Community e Hashnode atendem inglês e espanhol e possuem regras de merge diferentes.

Um artigo importado pode aguardar revisão, falhar em quality gates ou ainda não ter sido publicado. Além disso, mudanças em metadados, RSS ou sitemap não significam uma publicação nova. Disparar notificações diretamente do job de importação criaria esses dois tipos de falso positivo.

## Decision

Na primeira versão, notificar **apenas artigos em português** já publicados no portfólio. A detecção editorial, porém, reconhece separadamente os três catálogos versionados: LinkedIn em `pt-BR`, DEV Community em `en` e Hashnode em `es-419`. Detectar conteúdo e decidir sua elegibilidade são responsabilidades distintas. Artigos EN/ES compõem a baseline para evitar falsos positivos futuros, mas não criam campanha, estado por inscrição, enqueue ou envio. Os workflows de importação em inglês e espanhol continuam fora da distribuição.

A execução de envio será separada da importação. O envio deverá considerar somente publicações concluídas com sucesso na `main`, vinculando o evento ao commit e ao conteúdo efetivamente disponibilizado no GitHub Pages. A [ADR 0012](0012-controlar-publicacao-por-release-manual.md) prevê integrar futuramente o envio como job pós-release reutilizável da pipeline manual, depois da verificação de frontend, tag e release. Não usar push na main como evidência de publicação. A reconciliação independente, quando necessária, verifica a última publicação efetiva e o estado durável, nunca o catálogo da ponta da main por si só. A conclusão do deploy é condição necessária, mas o processo também precisa conferir se há artigo novo no catálogo em português.

A identidade de publicação será baseada em origem, idioma e URL canônica ou identificador estável, não na posição do artigo nem em `git diff` genérico. Publicações semelhantes em plataformas distintas não são presumidas traduções. O backend manterá baseline durável em modo seed, histórico de identidades já observadas, campanhas determinísticas e estado por inscrição/geração. Campanhas são persistidas antes do avanço condicional da baseline, para que falha parcial produza replay idempotente em vez de perda silenciosa. Reenvios serão limitados e observáveis; falhas de push não reverterão o deploy.

A deduplicação usa criação condicional e ETags no Cosmos DB. A reivindicação por destinatário separa o claim reversível do início do transporte. Depois que o estado durável registra `Sending`, timeout, interrupção ou falha ao persistir o resultado tornam a entrega `OutcomeUnknown` e impedem reenvio automático. Esse trade-off favorece não duplicar uma notificação quando o provedor pode tê-la aceitado; não constitui garantia exactly-once.

## Consequences

O visitante não receberá avisos de conteúdo ainda não disponível nem de simples correções editoriais. A independência entre publicação e distribuição reduz o acoplamento das Actions existentes.

A notificação poderá ocorrer depois do deploy e dependerá de reconciliação quando eventos forem perdidos ou quando a publicação for iniciada por mecanismos diferentes do workflow habitual. A entrada futura deverá revalidar que a evidência ainda representa a última publicação bem-sucedida do Pages; a exclusão de releases da ADR 0012 e a sequência monotônica complementam o controle otimista, pois o Cosmos DB não oferece transação entre partições de baseline e campanha.

Serviços de push externos não oferecem garantia de entrega exatamente uma vez; nossa deduplicação controla os disparos sob nossa responsabilidade, não o comportamento do provedor ou do dispositivo. O enqueue pós-release e a reconciliação operacional permanecem, respectivamente, nas issues #164 e #165.
