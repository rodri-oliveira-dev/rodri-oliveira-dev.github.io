/**
 * Public services data for the proposed WebMCP services contract v1.
 *
 * Editorial source of truth: the visible content in /servicos/,
 * /en/services/ and /es/servicios/. Keep these records aligned with HTML.
 * This module does not register browser tools or perform network operations.
 *
 * Contract: docs/contracts/webmcp-services.v1.json
 */
const deepFreeze = (value) => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
};

export const SERVICES_CONTRACT_VERSION = "1.0.0";
export const SERVICES_SUPPORTED_LANGUAGES = deepFreeze(["pt-BR","en","es-419"]);
export const SERVICES_PAGE_URLS = deepFreeze({
  "pt-BR": "https://rodri-oliveira-dev.github.io/servicos/",
  "en": "https://rodri-oliveira-dev.github.io/en/services/",
  "es-419": "https://rodri-oliveira-dev.github.io/es/servicios/"
});
export const SERVICES_SERVICE_IDS = deepFreeze([
  "architecture-review",
  "dotnet-modernization",
  "apis-distributed-systems",
  "technical-decision-support"
]);
export const SERVICES_PROCESS_STEP_IDS = deepFreeze([
  "context",
  "alternatives",
  "next-steps"
]);

export const SERVICES_CONTACT_EMAIL = "rodrigodotnet@outlook.com";
export const SERVICES_LINKEDIN_URL = "https://www.linkedin.com/in/rodri-oliveira-dev";

// Potential outputs are examples for a possible engagement, not commitments
// for every service. The shared scopeNote states this explicitly.
export const SERVICES_CATALOG = deepFreeze({
  "pt-BR": {
    "services": [
      {
        "id": "architecture-review",
        "title": "Revisão e evolução arquitetural",
        "description": "Reviso dependências, responsabilidades entre componentes e atributos de qualidade para identificar riscos e discutir alternativas antes de mudanças relevantes."
      },
      {
        "id": "dotnet-modernization",
        "title": "Modernização de sistemas .NET",
        "description": "Avalio aplicações existentes e suas dependências para identificar caminhos de modernização gradual, considerando manutenção, operação e necessidades do negócio."
      },
      {
        "id": "apis-distributed-systems",
        "title": "APIs e sistemas distribuídos",
        "description": "Apoio o desenho e a revisão de APIs, integrações e fluxos assíncronos, com atenção a contratos, tratamento de falhas, resiliência e observabilidade."
      },
      {
        "id": "technical-decision-support",
        "title": "Apoio a decisões técnicas",
        "description": "Ajudo equipes a discutir padrões, organizar o código e registrar decisões arquiteturais, aproximando o desenho técnico da implementação."
      }
    ],
    "engagementNote": "Se sua equipe precisa rever uma arquitetura, modernizar um sistema em uso ou integrar plataformas, posso contribuir em uma análise pontual ou em uma etapa do projeto. O trabalho pode resultar em recomendações priorizadas e decisões documentadas, conforme o escopo combinado.",
    "potentialOutputs": [
      "recomendações priorizadas",
      "decisões documentadas"
    ],
    "scopeNote": "O trabalho pode resultar em recomendações priorizadas e decisões documentadas, conforme o escopo combinado.",
    "process": {
      "introduction": "Uma decisão técnica pode resolver um problema e criar outro. Por isso, considero o cenário atual e as restrições do projeto antes de comparar alternativas.",
      "steps": [
        {
          "id": "context",
          "title": "Compreender o cenário",
          "description": "Levanto objetivos, principais dependências, restrições de negócio e riscos do sistema atual."
        },
        {
          "id": "alternatives",
          "title": "Explicitar os trade-offs",
          "description": "Comparo caminhos possíveis e discuto seus impactos na manutenção, na operação, nos custos e na capacidade de evolução."
        },
        {
          "id": "next-steps",
          "title": "Definir próximos passos",
          "description": "Organizo recomendações e próximos passos, com prioridades e critérios de avaliação compatíveis com o escopo."
        }
      ]
    },
    "contact": {
      "emailUrl": "mailto:rodrigodotnet@outlook.com?subject=Contato%20profissional%20-%20Arquitetura%20de%20Software",
      "guidance": "Se há uma decisão arquitetural difícil, uma aplicação que precisa evoluir ou uma integração a revisar, podemos conversar. Envie um resumo do cenário e do tipo de apoio que procura para avaliarmos se faz sentido colaborar."
    }
  },
  "en": {
    "services": [
      {
        "id": "architecture-review",
        "title": "Architecture reviews and evolution",
        "description": "I review dependencies, component boundaries, and quality attributes to identify risks and compare alternatives before major changes."
      },
      {
        "id": "dotnet-modernization",
        "title": ".NET application modernization",
        "description": "I assess existing applications and dependencies to identify practical paths for incremental modernization, taking maintenance, operations, and business needs into account."
      },
      {
        "id": "apis-distributed-systems",
        "title": "APIs and distributed systems",
        "description": "I help design and review APIs, integrations, and asynchronous workflows, with attention to contracts, failure handling, resilience, and observability."
      },
      {
        "id": "technical-decision-support",
        "title": "Technical decision support",
        "description": "I work with teams to assess patterns, organize code, and document architectural decisions, connecting technical design with implementation."
      }
    ],
    "engagementNote": "Whether your team needs an architecture review, a path to modernize an existing application, or help designing an integration, I can contribute to a focused assessment or a phase of a larger project. Depending on the agreed scope, the work may include prioritized recommendations and documented decisions.",
    "potentialOutputs": [
      "prioritized recommendations",
      "documented decisions"
    ],
    "scopeNote": "Depending on the agreed scope, the work may include prioritized recommendations and documented decisions.",
    "process": {
      "introduction": "A technical decision can solve one problem while creating another. That is why I look at the current system and project constraints before comparing possible approaches.",
      "steps": [
        {
          "id": "context",
          "title": "Understand the context",
          "description": "I identify goals, key dependencies, business constraints, and risks in the existing system."
        },
        {
          "id": "alternatives",
          "title": "Make trade-offs explicit",
          "description": "I compare approaches and discuss their impact on maintenance, operations, costs, and the system's ability to evolve."
        },
        {
          "id": "next-steps",
          "title": "Define next steps",
          "description": "I organize recommendations and next steps, with priorities and evaluation criteria suited to the agreed scope."
        }
      ]
    },
    "contact": {
      "emailUrl": "mailto:rodrigodotnet@outlook.com?subject=Software%20Architecture%20Consulting",
      "guidance": "If you are facing a difficult architecture decision, planning to modernize an application, or reviewing an integration, we can talk it through. Share a brief outline of the situation and the support you are looking for so we can see whether working together makes sense."
    }
  },
  "es-419": {
    "services": [
      {
        "id": "architecture-review",
        "title": "Revisión y evolución de arquitecturas",
        "description": "Reviso dependencias, responsabilidades entre componentes y atributos de calidad para identificar riesgos y valorar alternativas antes de realizar cambios importantes."
      },
      {
        "id": "dotnet-modernization",
        "title": "Modernización de sistemas .NET",
        "description": "Analizo aplicaciones existentes y sus dependencias para identificar formas de modernizarlas gradualmente, teniendo en cuenta el mantenimiento, la operación y las necesidades del negocio."
      },
      {
        "id": "apis-distributed-systems",
        "title": "APIs y sistemas distribuidos",
        "description": "Colaboro en el diseño y la revisión de APIs, integraciones y flujos asíncronos, con atención a los contratos, el manejo de fallas, la resiliencia y la observabilidad."
      },
      {
        "id": "technical-decision-support",
        "title": "Asesoramiento en decisiones técnicas",
        "description": "Ayudo a los equipos a evaluar patrones, organizar el código y documentar decisiones de arquitectura para conectar el diseño técnico con la implementación."
      }
    ],
    "engagementNote": "Si tu equipo necesita revisar una arquitectura, modernizar un sistema en uso o integrar plataformas, puedo colaborar en un análisis puntual o durante una etapa del proyecto. Según el alcance acordado, el trabajo puede incluir recomendaciones priorizadas y decisiones documentadas.",
    "potentialOutputs": [
      "recomendaciones priorizadas",
      "decisiones documentadas"
    ],
    "scopeNote": "Según el alcance acordado, el trabajo puede incluir recomendaciones priorizadas y decisiones documentadas.",
    "process": {
      "introduction": "Una decisión técnica puede resolver un problema y crear otro. Por eso, antes de comparar alternativas, considero el estado actual del sistema y las restricciones del proyecto.",
      "steps": [
        {
          "id": "context",
          "title": "Comprender el escenario",
          "description": "Identifico objetivos, dependencias principales, restricciones del negocio y riesgos del sistema actual."
        },
        {
          "id": "alternatives",
          "title": "Hacer explícitos los trade-offs",
          "description": "Comparo alternativas y analizo sus efectos en el mantenimiento, la operación, los costos y la capacidad de evolución."
        },
        {
          "id": "next-steps",
          "title": "Definir los próximos pasos",
          "description": "Organizo recomendaciones y próximos pasos, con prioridades y criterios de evaluación acordes con el alcance del trabajo."
        }
      ]
    },
    "contact": {
      "emailUrl": "mailto:rodrigodotnet@outlook.com?subject=Consulta%20sobre%20Arquitectura%20de%20Software",
      "guidance": "Si tienes que tomar una decisión de arquitectura compleja, modernizar una aplicación o revisar una integración, podemos hablarlo. Cuéntame brevemente el escenario y el apoyo que buscas para valorar si tiene sentido colaborar."
    }
  }
});
