import { PROJECTS, PROFILES, SITE_URL, SKILLS, projectSummary } from "./webmcp-data.mjs";
import { MESSAGES, SUPPORTED_LANGUAGES, pageLanguage, resolveLanguage } from "./webmcp-i18n.mjs";

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
});

/** Build a read-only tool definition with a stable public contract. */
function definition(name, description, inputSchema, execute) {
  return { name, description, inputSchema, annotations: READ_ONLY, execute };
}

/** Normalize user search terms for accent-insensitive matching. */
function normalized(value) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    : "";
}

/** Build a strict JSON Schema with an optional language override. */
function schema(text, properties = {}, required = []) {
  return {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: [...SUPPORTED_LANGUAGES],
        description: text.parameters.language,
      },
      ...properties,
    },
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

/** Encode an error as a localized, serializable tool response. */
function failure(language, code, message) {
  return { language, error: { code, message } };
}

/** Report invalid tool arguments without throwing across the browser API. */
function inputError(language, name) {
  return failure(language, "INVALID_INPUT", MESSAGES[language].invalidInput + " " + name + ".");
}

/**
 * Resolve a tool call's requested response language. A missing argument uses
 * the page language, while an explicit unsupported value produces an error.
 */
function callLanguage(input, page, name, allowed) {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.includes(key))
  ) {
    return { error: inputError(page, name) };
  }

  const language = resolveLanguage(input.language, page);
  return language
    ? { language }
    : { error: failure(page, "UNSUPPORTED_LANGUAGE", MESSAGES[page].invalidLanguage) };
}

/** Map a supported locale to its published portfolio homepage. */
function urlFor(language) {
  return SITE_URL + (language === "en" ? "/en/" : language === "es-419" ? "/es/" : "/");
}

/**
 * Read-only tools for the five featured open-source projects. Descriptions and
 * schemas use the page locale; each call may override the response locale.
 */
export function createPortfolioTools(pageLocale = "pt-BR") {
  const page = pageLanguage(pageLocale);
  const text = MESSAGES[page];
  const common = (name, allowed, execute) => (input = {}) => {
    const resolution = callLanguage(input, page, name, ["language", ...allowed]);
    return resolution.error ?? execute(input, resolution.language);
  };

  return [
    definition(
      "getProfile",
      text.tools.getProfile,
      schema(text),
      common("getProfile", [], (_, language) => ({
        language,
        ...PROFILES[language],
        experienceYearsMinimum: 20,
        websiteUrl: urlFor(language),
      }))
    ),
    definition(
      "getSkills",
      text.tools.getSkills,
      schema(text),
      common("getSkills", [], (_, language) => ({
        language,
        skills: [...SKILLS[language]],
        sourceUrl: urlFor(language),
      }))
    ),
    definition(
      "searchProjects",
      text.tools.searchProjects,
      schema(text, {
        query: { type: "string", maxLength: 120, description: text.parameters.query },
        technology: { type: "string", maxLength: 80, description: text.parameters.technology },
        limit: { type: "integer", minimum: 1, maximum: 5, description: text.parameters.limit },
      }),
      common("searchProjects", ["query", "technology", "limit"], (input, language) => {
        if (
          (input.query !== undefined && (typeof input.query !== "string" || input.query.length > 120)) ||
          (input.technology !== undefined && (typeof input.technology !== "string" || input.technology.length > 80)) ||
          (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 5))
        ) {
          return inputError(language, "searchProjects");
        }

        const query = normalized(input.query);
        const technology = normalized(input.technology);
        // Filter using every supported locale, independent of the output language.
        const matches = PROJECTS.filter((project) => {
          const localized = SUPPORTED_LANGUAGES.map((code) => projectSummary(project, code));
          const tags = localized.flatMap((item) => item.technologies).map(normalized);
          const searchable = normalized([
            project.name, ...localized.map((item) => item.description), ...tags,
          ].join(" "));
          return (!query || searchable.includes(query)) &&
            (!technology || tags.some((tag) => tag.includes(technology)));
        });

        return {
          language,
          total: matches.length,
          projects: matches.slice(0, input.limit ?? 5).map((project) => projectSummary(project, language)),
        };
      })
    ),
    definition(
      "getProjectDetails",
      text.tools.getProjectDetails,
      schema(text, {
        projectId: {
          type: "string",
          maxLength: 80,
          description: text.parameters.projectId,
        },
      }, ["projectId"]),
      common("getProjectDetails", ["projectId"], (input, language) => {
        if (
          typeof input.projectId !== "string" ||
          input.projectId.length > 80 ||
          !input.projectId.trim()
        ) {
          return inputError(language, "getProjectDetails");
        }
        const project = PROJECTS.find((item) => item.id === normalized(input.projectId));
        return project
          ? { language, project: projectSummary(project, language) }
          : {
              ...failure(language, "PROJECT_NOT_FOUND", MESSAGES[language].projectNotFound),
              availableIds: PROJECTS.map((item) => item.id),
            };
      })
    ),
    definition(
      "getResume",
      text.tools.getResume,
      schema(text),
      common("getResume", [], (_, language) => ({
        language,
        availableLanguages: ["pt-BR"],
        htmlUrl: SITE_URL + "/curriculo/",
        pdfUrl: SITE_URL + "/curriculo/rodrigo-de-oliveira.pdf",
        note: MESSAGES[language].resumeNote,
      }))
    ),
    definition(
      "getContactInfo",
      text.tools.getContactInfo,
      schema(text),
      common("getContactInfo", [], (_, language) => ({
        language,
        email: "rodrigodotnet@outlook.com",
        linkedInUrl: "https://www.linkedin.com/in/rodri-oliveira-dev",
        githubUrl: "https://github.com/rodri-oliveira-dev",
        websiteUrl: urlFor(language),
      }))
    ),
  ];
}
