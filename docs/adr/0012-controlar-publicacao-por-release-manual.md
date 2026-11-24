# ADR 0012: Controlar publicação por release manual

## Status

Proposed

## Context

A publicação do portfólio ocorria a cada push na main, em paralelo com as validações, enquanto a tag era criada após os gates de um único PR. Isso aproxima a cadência de publicação da cadência de integração, embora não exista necessidade de entregar cada mudança isoladamente. O deploy nativo por branch também pode competir com o artefato que inclui os currículos em PDF.

## Decision

Manter a integração e os quality gates automáticos em PR e main. Acionar a publicação exclusivamente por workflow_dispatch na main, com escolha explícita do incremento SemVer. Validar a origem GitHub Actions do Pages, o SHA e os gates obrigatórios desse SHA antes de gerar e validar os três PDFs de produção e montar o artefato estático. Preservar prévias em PR. Publicar o artefato antes de criar a tag anotada e a GitHub Release, com changelog desde a última release publicada, e notificar IndexNow somente após a publicação e release bem-sucedidas. Reutilizar uma tag existente para o mesmo SHA e não mover tags.

A alternativa de manter deploy automático com aprovação por environment ainda criaria uma execução de publicação a cada merge; a publicação sob demanda permite acumular mudanças sem esse custo.

## Consequences

A main pode ficar à frente da produção por decisão operacional. O proprietário precisa iniciar o fluxo manualmente; a configuração de Pages deve usar GitHub Actions, não publicação por branch. Uma falha de metadados após deploy não reverte automaticamente o site: deve ser recuperada por reexecução enquanto o SHA permanece na main. Os checks de PR continuam exigidos pela proteção da branch; os checks de main são conferidos no fluxo de publicação. As integrações externas precisam observar a publicação efetiva, e não apenas um merge. A hospedagem permanece conforme a ADR 0001.
