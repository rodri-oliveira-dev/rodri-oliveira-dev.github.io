# Gerenciar a infraestrutura GCP com Terraform no monorepo

## Status

Superseded

## Context

O portfólio já possui pipelines de site, conteúdo, segurança e qualidade. Abrir outro repositório apenas para uma API pequena e poucos recursos de nuvem criaria uma segunda trilha de revisão sem ganho claro de autonomia. Em contrapartida, reunir tudo sem limites entre workflows poderia fazer mudanças editoriais dispararem deploy de backend ou alterar recursos de produção.

O provisionamento deve ser reproduzível e auditável. Os riscos principais não são de capacidade: são credenciais com privilégio excessivo, alterações não revisadas, exposição do Terraform State e despesas inesperadas. A exigência de armazenamento em São Paulo também deve aparecer na configuração, não depender de escolhas manuais no console.

## Decision

Manter código da API e infraestrutura no mesmo repositório, mas em diretórios e pipelines independentes. Usar Terraform para criar os recursos necessários de Cloud Run, Firestore, Secret Manager, contas de serviço e controles de observabilidade e acesso. Recursos que armazenem dados das inscrições deverão ser configurados na região `southamerica-east1`.

O State ficará em backend remoto privado, fora do Git, com IAM restrito e versionamento adequado. O bucket de State e a identidade inicial de automação exigem uma etapa explícita de bootstrap; não serão simulados como recursos que o próprio State já existente consegue criar sozinho.

A autenticação do GitHub Actions na GCP deverá usar Workload Identity Federation com OIDC e condições de confiança restritas ao repositório, à branch e ao ambiente de implantação. Em PRs, executar `fmt`, `validate` e análises sem credenciais privilegiadas; `plan` autenticado somente em contexto confiável. `apply` exigirá ambiente protegido e aprovação. Pipelines do site, da API e de infraestrutura terão gatilhos separados.

Dimensionar Cloud Run para escala a zero e limitar instâncias e consumo. Configurar orçamento, alertas e observabilidade desde o início, sem tratar alertas como bloqueio absoluto de cobrança. Validar custo regional de cada recurso antes da criação, inclusive logs, imagens e armazenamento de State.

## Consequences

O monorepo permite revisar código, infraestrutura e ADRs em conjunto, sem acoplar seus ciclos de implantação. O Terraform reduz configuração manual e facilita reconstrução e auditoria do ambiente.

Haverá trabalho inicial de bootstrap, separação de IAM e manutenção de estado. Mudanças de infraestrutura poderão afetar recursos duráveis, especialmente a localização imutável do Firestore, portanto exigirão cuidado maior que um deploy de código. O objetivo é gasto baixo e controlado; esta decisão não promete operação permanentemente gratuita.

Esta proposta foi substituída pela [ADR 0009](0009-adotar-azure-para-web-push-por-custo.md) antes do provisionamento na GCP.
