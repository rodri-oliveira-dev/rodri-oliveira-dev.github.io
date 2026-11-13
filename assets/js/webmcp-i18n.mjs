/**
 * User-facing WebMCP discovery text and response messages.
 * Tool names and JSON result keys are intentionally stable across locales.
 */
export const SUPPORTED_LANGUAGES = Object.freeze(["pt-BR", "en", "es-419"]);
export const DEFAULT_LANGUAGE = "pt-BR";

/** Use a supported page locale, falling back to Brazilian Portuguese. */
export function pageLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

/** An absent language follows the page; an unsupported explicit value is rejected. */
export function resolveLanguage(requested, page = DEFAULT_LANGUAGE) {
  if (requested === undefined) return pageLanguage(page);
  return SUPPORTED_LANGUAGES.includes(requested) ? requested : null;
}

export const MESSAGES = Object.freeze({
  "pt-BR": Object.freeze({
    tools: Object.freeze({
      getProfile: "Consulta o perfil profissional público de Rodrigo de Oliveira, arquiteto de software.",
      getSkills: "Lista as competências técnicas e arquiteturais publicadas no portfólio.",
      searchProjects: "Pesquisa os cinco projetos open source em destaque por palavra-chave e/ou tecnologia; sem filtros, lista todos.",
      getProjectDetails: "Consulta descrição, tecnologias, repositório e estudo de caso de um projeto em destaque.",
      getResume: "Obtém os links do currículo público em HTML e PDF no idioma solicitado.",
      getContactInfo: "Consulta os canais públicos de contato profissional publicados no portfólio.",
    }),
    parameters: Object.freeze({
      language: "Idioma da resposta: pt-BR, en ou es-419. Se omitido, utiliza o idioma desta página.",
      query: "Palavra-chave opcional no nome, na descrição ou nas tecnologias do projeto.",
      technology: "Tecnologia opcional, por exemplo: .NET, Angular ou RabbitMQ.",
      limit: "Número máximo de resultados; o padrão é 5.",
      projectId: "Identificador retornado pela ferramenta searchProjects.",
    }),
    invalidInput: "Parâmetros inválidos para",
    invalidLanguage: "Idioma não suportado. Use pt-BR, en ou es-419.",
    projectNotFound: "Nenhum projeto em destaque corresponde ao identificador informado.",
    resumeNote: "Currículo em português do Brasil.",
  }),
  en: Object.freeze({
    tools: Object.freeze({
      getProfile: "Retrieve software architect Rodrigo de Oliveira's public professional profile.",
      getSkills: "List the software engineering and architecture skills published on the portfolio.",
      searchProjects: "Search the five featured open-source projects by keyword and/or technology; omit filters to list all.",
      getProjectDetails: "Retrieve a featured project's description, technologies, repository, and case study.",
      getResume: "Get the public HTML and PDF resume links in the requested language.",
      getContactInfo: "Retrieve the public professional contact channels published on the portfolio.",
    }),
    parameters: Object.freeze({
      language: "Response language: pt-BR, en or es-419. Defaults to this page's language.",
      query: "Optional keyword in a project name, description, or technologies.",
      technology: "Optional technology, such as .NET, Angular, or RabbitMQ.",
      limit: "Maximum number of matches; defaults to 5.",
      projectId: "Project identifier returned by searchProjects.",
    }),
    invalidInput: "Invalid arguments for",
    invalidLanguage: "Unsupported language. Use pt-BR, en or es-419.",
    projectNotFound: "No featured project matches the supplied identifier.",
    resumeNote: "English-language resume.",
  }),
  "es-419": Object.freeze({
    tools: Object.freeze({
      getProfile: "Consulta el perfil profesional público de Rodrigo de Oliveira, arquitecto de software.",
      getSkills: "Enumera las competencias técnicas y de arquitectura publicadas en el portafolio.",
      searchProjects: "Busca los cinco proyectos de código abierto destacados por palabra clave o tecnología; sin filtros, muestra todos.",
      getProjectDetails: "Consulta la descripción, tecnologías, repositorio y estudio de caso de un proyecto destacado.",
      getResume: "Obtiene los enlaces del currículum público en HTML y PDF en el idioma solicitado.",
      getContactInfo: "Consulta los canales públicos de contacto profesional del portafolio.",
    }),
    parameters: Object.freeze({
      language: "Idioma de la respuesta: pt-BR, en o es-419. Si se omite, se usa el idioma de esta página.",
      query: "Palabra clave opcional en el nombre, la descripción o las tecnologías del proyecto.",
      technology: "Tecnología opcional, por ejemplo: .NET, Angular o RabbitMQ.",
      limit: "Número máximo de resultados; el valor predeterminado es 5.",
      projectId: "Identificador devuelto por la herramienta searchProjects.",
    }),
    invalidInput: "Parámetros no válidos para",
    invalidLanguage: "Idioma no admitido. Usa pt-BR, en o es-419.",
    projectNotFound: "Ningún proyecto destacado corresponde al identificador indicado.",
    resumeNote: "Currículum en español latinoamericano.",
  }),
});
