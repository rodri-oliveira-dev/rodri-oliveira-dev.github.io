// Public information already presented in the portfolio homepages.
// Stage 4 will add drift checks against the visible PT/EN project cards.
export const SITE_URL = "https://rodri-oliveira-dev.github.io";

export const PROJECTS = Object.freeze([
  {
    id: "adr-guard",
    name: "ADR Guard",
    repository: "https://github.com/rodri-oliveira-dev/adr-guard",
    technologies: [".NET", "GitHub Actions", "VS Code"],
    descriptions: {
      "pt-BR": "Ferramenta para criar, validar e organizar registros de decisões arquiteturais (ADRs). Inclui CLI, integração com GitHub Actions e extensão para VS Code.",
      en: "A tool for creating, validating, and organizing Architecture Decision Records (ADRs). It includes a CLI, GitHub Actions integration, and a VS Code extension.",
    },
  },
  {
    id: "dapper-fluentmap",
    name: "Dapper.FluentMap",
    repository: "https://github.com/rodri-oliveira-dev/Dapper-FluentMap",
    technologies: [".NET", "Dapper", "NuGet"],
    descriptions: {
      "pt-BR": "Biblioteca de mapeamento fluente para Dapper, criada originalmente por Henk Mollema. Hoje sou responsável por sua manutenção, com foco em compatibilidade, testes e versionamento.",
      en: "A fluent mapping library for Dapper, originally created by Henk Mollema. I now maintain the project, focusing on compatibility, testing, and versioning.",
    },
  },
  {
    id: "reliable-webhooks",
    name: "ReliableWebhooks",
    repository: "https://github.com/rodri-oliveira-dev/ReliableWebhooks",
    technologies: [".NET", "Webhooks", "Resiliência"],
    descriptions: {
      "pt-BR": "Biblioteca .NET para entrega confiável de webhooks, com políticas de retry, controle de concorrência, leases, assinatura HMAC e observabilidade. Projetada para cenários de entrega at-least-once e persistência extensível.",
      en: "A .NET library for reliable webhook delivery with retry policies, bounded concurrency, leases, HMAC signing, and observability. Designed for at-least-once delivery and extensible persistence.",
    },
  },
  {
    id: "repo-control-center",
    name: "Repo Control Center",
    repository: "https://github.com/rodri-oliveira-dev/repo-status-dashboard",
    technologies: ["Angular", "TypeScript", "GitHub API"],
    descriptions: {
      "pt-BR": "Dashboard desenvolvido em Angular para acompanhar meus repositórios GitHub, reunindo informações sobre pipelines, segurança, releases, atividade e versões de tecnologias.",
      en: "An Angular dashboard for monitoring my GitHub repositories, bringing together information about pipelines, security, releases, activity, and technology versions.",
    },
  },
  {
    id: "dotnet-observability-lab",
    name: "dotnet-observability-lab",
    repository: "https://github.com/rodri-oliveira-dev/dotnet-observability-lab",
    technologies: [".NET", "RabbitMQ", "OpenTelemetry"],
    descriptions: {
      "pt-BR": "Laboratório .NET para estudar processamento assíncrono, mensageria, idempotência, observabilidade e recuperação de falhas, utilizando padrões como Outbox e Inbox.",
      en: "A .NET lab for exploring asynchronous processing, messaging, idempotency, observability, and failure recovery using patterns such as Outbox and Inbox.",
    },
  },
]);

export const PROFILES = Object.freeze({
  "pt-BR": {
    name: "Rodrigo de Oliveira",
    role: "Arquiteto de Software Sênior",
    summary: "Arquiteto de Software Sênior com mais de 20 anos de experiência em modernização, .NET, sistemas distribuídos, integrações e cloud.",
  },
  en: {
    name: "Rodrigo de Oliveira",
    role: "Senior Software Architect",
    summary: "Senior Software Architect with more than 20 years of experience in modernization, .NET, distributed systems, integrations, and cloud.",
  },
});

export const SKILLS = Object.freeze({
  "pt-BR": [
    "Arquitetura de Software", ".NET", "C#", "Sistemas Distribuídos",
    "Integração de Sistemas e APIs", "Modernização de Sistemas Legados",
    "Domain-Driven Design", "Cloud Computing", "GCP", "AWS",
    "Arquitetura Orientada a Eventos", "APIs", "Observabilidade",
    "Segurança de Software", "Manutenibilidade", "Reliability Engineering",
    "Qualidade de Software",
  ],
  en: [
    "Software Architecture", ".NET", "C#", "Distributed Systems",
    "Systems Integration and APIs", "Legacy System Modernization",
    "Domain-Driven Design", "Cloud Computing", "GCP", "AWS",
    "Event-Driven Architecture", "API Design", "Observability",
    "Software Security", "Maintainability", "Reliability Engineering",
    "Software Quality",
  ],
});

export function projectSummary(project, language) {
  return {
    id: project.id,
    name: project.name,
    description: project.descriptions[language],
    technologies: project.technologies.map((tag) =>
      language === "en" && tag === "Resiliência" ? "Resilience" : tag
    ),
    repositoryUrl: project.repository,
    caseStudyUrl: `${SITE_URL}${language === "en" ? "/en" : ""}/case-studies/${project.id}/`,
  };
}
