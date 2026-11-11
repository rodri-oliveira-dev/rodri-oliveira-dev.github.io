import { PROJECTS, PROFILES, SITE_URL, SKILLS, projectSummary } from "./webmcp-data.mjs";

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
});

const EMPTY_INPUT = Object.freeze({
  type: "object",
  properties: {},
  additionalProperties: false,
});

function definition(name, description, inputSchema, execute) {
  return { name, description, inputSchema, annotations: READ_ONLY, execute };
}

function normalized(value) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    : "";
}

function invalidInput(field) {
  return { error: { code: "INVALID_INPUT", message: `Invalid ${field} argument.` } };
}

/**
 * Read-only tools for the five public case studies and the published portfolio.
 * Locale is initially selected from the current page; language negotiation
 * and translated discovery descriptions are part of stage 3.
 */
export function createPortfolioTools(language = "pt-BR") {
  const locale = language === "en" ? "en" : "pt-BR";
  const listProjects = () => PROJECTS.map((project) => projectSummary(project, locale));

  return [
    definition(
      "getProfile",
      "Get the public professional profile of software architect Rodrigo de Oliveira.",
      EMPTY_INPUT,
      () => ({
        language: locale,
        ...PROFILES[locale],
        experienceYearsMinimum: 20,
        websiteUrl: locale === "en" ? `${SITE_URL}/en/` : `${SITE_URL}/`,
      })
    ),
    definition(
      "getSkills",
      "List Rodrigo de Oliveira's publicly documented software architecture and engineering skills.",
      EMPTY_INPUT,
      () => ({
        language: locale,
        skills: [...SKILLS[locale]],
        sourceUrl: locale === "en" ? `${SITE_URL}/en/` : `${SITE_URL}/`,
      })
    ),
    definition(
      "searchProjects",
      "Search the five featured open-source projects by keyword and/or technology; omit filters to list all.",
      {
        type: "object",
        properties: {
          query: { type: "string", maxLength: 120, description: "Optional keyword in name or description." },
          technology: { type: "string", maxLength: 80, description: "Optional technology name." },
          limit: { type: "integer", minimum: 1, maximum: 5, description: "Maximum number of projects, default 5." },
        },
        additionalProperties: false,
      },
      (input = {}) => {
        if (!input || typeof input !== "object" || Array.isArray(input)) return invalidInput("search");
        if ((input.query !== undefined && typeof input.query !== "string")
          || (input.technology !== undefined && typeof input.technology !== "string")
          || (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 5))) {
          return invalidInput("search");
        }
        const keyword = normalized(input.query);
        const technology = normalized(input.technology);
        const matches = listProjects().filter((project) => {
          const tags = project.technologies.map(normalized);
          const searchable = normalized(`${project.name} ${project.description} ${tags.join(" ")}`);
          return (!keyword || searchable.includes(keyword))
            && (!technology || tags.some((tag) => tag.includes(technology)));
        });
        return {
          language: locale,
          total: matches.length,
          projects: matches.slice(0, input.limit ?? 5),
        };
      }
    ),
    definition(
      "getProjectDetails",
      "Get the public description, technology tags, repository, and case-study URL for a featured project.",
      {
        type: "object",
        properties: {
          projectId: { type: "string", description: "A project slug returned by searchProjects.", maxLength: 80 },
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      (input = {}) => {
        if (!input || typeof input !== "object" || Array.isArray(input)) return invalidInput("projectId");
        if (typeof input.projectId !== "string" || input.projectId.length > 80) {
          return invalidInput("projectId");
        }
        const project = PROJECTS.find((item) => item.id === normalized(input.projectId));
        return project
          ? { language: locale, project: projectSummary(project, locale) }
          : { error: { code: "PROJECT_NOT_FOUND", message: "No featured project matches that ID." },
              availableIds: PROJECTS.map((item) => item.id) };
      }
    ),
    definition(
      "getResume",
      "Find the public HTML and PDF resume. The available resume is in Brazilian Portuguese.",
      EMPTY_INPUT,
      () => ({
        language: locale,
        availableLanguages: ["pt-BR"],
        htmlUrl: `${SITE_URL}/curriculo/`,
        pdfUrl: `${SITE_URL}/curriculo/rodrigo-de-oliveira.pdf`,
        note: locale === "en"
          ? "The published resume is available in Brazilian Portuguese only; no English translation is claimed."
          : "O currículo publicado está disponível apenas em português do Brasil.",
      })
    ),
    definition(
      "getContactInfo",
      "Get the professional contact channels already published on the portfolio.",
      EMPTY_INPUT,
      () => ({
        language: locale,
        email: "rodrigodotnet@outlook.com",
        linkedInUrl: "https://www.linkedin.com/in/rodri-oliveira-dev",
        githubUrl: "https://github.com/rodri-oliveira-dev",
        websiteUrl: locale === "en" ? `${SITE_URL}/en/` : `${SITE_URL}/`,
      })
    ),
  ];
}
