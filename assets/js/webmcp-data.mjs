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
      "Responsabilidade arquitetural por dois times de engenharia, em colaboração com lideranças técnicas e de produto.",
      "Modernização de funcionalidades legadas para microsserviços, do levantamento inicial à implantação em produção.",
      "Participação no Centro de Excelência de Arquitetura, com revisões técnicas e avaliação da qualidade das soluções.",
      "Liderança técnica e atuação como Career Advisor, incluindo mentoria, avaliação de competências e PDI.",
      "Participação na adoção e implementação de ferramentas de inteligência artificial no desenvolvimento de novos sistemas.",
    ],
  },
  en: {
    name: "Rodrigo de Oliveira",
    role: "Senior Software Architect",
    summary: "Senior Software Architect with more than 20 years of experience in modernization, .NET, distributed systems, integrations, and cloud.",
    careerHighlights: [
      "Architectural responsibility for two engineering teams, working with product owners, tech leads, and other architects.",
      "Modernization of legacy functionality into microservices, from initial discovery through production deployment.",
      "Participation in the Architecture Center of Excellence, contributing to technical reviews and solution quality assessments.",
      "Technical leadership and Career Advisor work, including mentoring, competency assessments, and IDPs.",
      "Participation in adopting and implementing AI tools for the development of new systems.",
    ],
  },
  "es-419": {
    name: "Rodrigo de Oliveira",
    role: "Arquitecto de Software Senior",
    summary: "Arquitecto de Software Senior con más de 20 años de experiencia en modernización, .NET, sistemas distribuidos, integraciones y plataformas en la nube.",
    careerHighlights: [
      "Responsabilidad arquitectónica sobre dos equipos de ingeniería, junto con responsables de producto y líderes técnicos.",
      "Modernización de funcionalidades heredadas hacia microservicios, desde el análisis inicial hasta su puesta en producción.",
      "Participación en el Centro de Excelencia de Arquitectura, con revisiones técnicas y evaluación de calidad de las soluciones.",
      "Liderazgo técnico y trabajo como Career Advisor, con mentoría, evaluación de competencias y PDI.",
      "Participación en la adopción e implementación de herramientas de inteligencia artificial para desarrollar nuevos sistemas.",
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
