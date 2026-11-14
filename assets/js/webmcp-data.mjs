// Public information already presented in the portfolio homepages.
// CI checks project descriptions, tags, links and skills against the visible PT/EN/ES HTML.
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
      "es-419": "Herramienta para crear, validar y organizar registros de decisiones de arquitectura (ADR). Incluye una CLI, integración con GitHub Actions y una extensión para VS Code.",
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
      "es-419": "Biblioteca de mapeo fluido para Dapper, creada originalmente por Henk Mollema. Actualmente mantengo el proyecto, con especial atención a la compatibilidad, las pruebas y la gestión de versiones.",
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
      "es-419": "Biblioteca .NET para la entrega confiable de webhooks, con políticas de reintento, control de concurrencia, leases, firma HMAC y observabilidad. Diseñada para entregas de al menos una vez (at-least-once) y mecanismos de persistencia extensibles.",
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
      "es-419": "Panel de control desarrollado en Angular para supervisar mis repositorios de GitHub. Reúne información sobre procesos de CI, seguridad, versiones publicadas, actividad y versiones de las tecnologías utilizadas.",
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
      "es-419": "Laboratorio .NET para estudiar procesamiento asíncrono, mensajería, idempotencia, observabilidad y recuperación ante fallas, utilizando patrones como Outbox e Inbox.",
    },
  },
]);

export const PROFILES = Object.freeze({
  "pt-BR": {
    name: "Rodrigo de Oliveira",
    role: "Arquiteto de Software Sênior",
    summary: "Arquiteto de Software Sênior com mais de 20 anos de experiência em modernização, .NET, sistemas distribuídos, integrações e cloud.",
    careerHighlights: [
      "Hoje apoio dois times de engenharia na arquitetura de soluções para crédito e empréstimos.",
      "Em um projeto no setor de seguros, defini a arquitetura para levar regras de negócio de stored procedures para microsserviços, estabelecendo as responsabilidades dos serviços.",
      "Também colaboro com outros arquitetos e o Centro de Excelência de Arquitetura na evolução de padrões para APIs e integrações.",
      "Atuei como líder técnico e Career Advisor, com mentoria, avaliações de competências e Planos de Desenvolvimento Individual (PDI).",
      "Participei ainda da adoção de ferramentas de IA no desenvolvimento de novos sistemas, acompanhando seu uso e os indicadores de entrega com as equipes.",
    ],
  },
  en: {
    name: "Rodrigo de Oliveira",
    role: "Senior Software Architect",
    summary: "Senior Software Architect with more than 20 years of experience in modernization, .NET, distributed systems, integrations, and cloud.",
    careerHighlights: [
      "Today I support two engineering teams working on credit and lending solutions.",
      "On a project in the insurance sector, I defined the architecture for moving business rules from stored procedures into microservices, including the boundaries between services.",
      "I also work with fellow architects and the Architecture Center of Excellence on shared API and integration standards.",
      "I've worked as a technical lead and Career Advisor, supporting engineers through mentoring, competency assessments, and Individual Development Plans (IDPs).",
      "I've also taken part in adopting AI tools for the development of new systems, working with teams to follow their use and delivery indicators.",
    ],
  },
  "es-419": {
    name: "Rodrigo de Oliveira",
    role: "Arquitecto de Software Senior",
    summary: "Arquitecto de Software Senior con más de 20 años de experiencia en modernización, .NET, sistemas distribuidos, integraciones y plataformas en la nube.",
    careerHighlights: [
      "Hoy acompaño a dos equipos de ingeniería en la arquitectura de soluciones de crédito y préstamos.",
      "En un proyecto del sector asegurador, definí la arquitectura para trasladar reglas de negocio de procedimientos almacenados a microservicios, estableciendo las responsabilidades de los servicios.",
      "También colaboro con otros arquitectos y el Centro de Excelencia de Arquitectura en estándares compartidos para APIs e integraciones.",
      "He trabajado como líder técnico y Career Advisor, acompañando a profesionales mediante mentoría, evaluación de competencias y Planes de Desarrollo Individual.",
      "Participé también en la adopción de herramientas de IA para desarrollar nuevos sistemas, acompañando su uso y los indicadores de entrega junto a los equipos.",
    ],
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
  "es-419": [
    "Arquitectura de Software", ".NET", "C#", "Sistemas Distribuidos",
    "Integración de Sistemas y APIs", "Modernización de Sistemas Legados",
    "Domain-Driven Design", "Cloud Computing", "GCP", "AWS",
    "Arquitectura Orientada a Eventos", "Diseño de APIs", "Observabilidad",
    "Seguridad de Software", "Mantenibilidad", "Ingeniería de Confiabilidad",
    "Calidad de Software",
  ],
});

/** Return a published project summary with locale-specific descriptions, tags and case-study links. */
export function projectSummary(project, language) {
  return {
    id: project.id,
    name: project.name,
    description: project.descriptions[language],
    technologies: project.technologies.map((tag) => {
      if (tag !== "Resiliência") return tag;
      return language === "en" ? "Resilience" : language === "es-419" ? "Resiliencia" : tag;
    }),
    repositoryUrl: project.repository,
    caseStudyUrl: `${SITE_URL}${language === "en" ? "/en" : language === "es-419" ? "/es" : ""}/case-studies/${project.id}/`,
  };
}
