/**
 * User-facing WebMCP discovery text and response messages.
 * Tool names and JSON result keys are intentionally stable across locales.
 */
export const SUPPORTED_LANGUAGES = Object.freeze(["pt-BR", "en"]);
export const DEFAULT_LANGUAGE = "pt-BR";

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
      getResume: "Obtém os links do currículo público em HTML e PDF. O currículo publicado está em português do Brasil.",
      getContactInfo: "Consulta os canais públicos de contato profissional publicados no portfólio.",
    }),
    parameters: Object.freeze({
      language: "Idioma da resposta: pt-BR ou en. Se omitido, utiliza o idioma desta página.",
      query: "Palavra-chave opcional no nome, na descrição ou nas tecnologias do projeto.",
      technology: "Tecnologia opcional, por exemplo: .NET, Angular ou RabbitMQ.",
      limit: "Número máximo de resultados; o padrão é 5.",
      projectId: "Identificador retornado pela ferramenta searchProjects.",
    }),
    invalidInput: "Parâmetros inválidos para",
    invalidLanguage: "Idioma não suportado. Use pt-BR ou en.",
    projectNotFound: "Nenhum projeto em destaque corresponde ao identificador informado.",
    resumeNote: "O currículo publicado está disponível apenas em português do Brasil.",
  }),
  en: Object.freeze({
    tools: Object.freeze({
      getProfile: "Retrieve software architect Rodrigo de Oliveira's public professional profile.",
      getSkills: "List the software engineering and architecture skills published on the portfolio.",
      searchProjects: "Search the five featured open-source projects by keyword and/or technology; omit filters to list all.",
      getProjectDetails: "Retrieve a featured project's description, technologies, repository, and case study.",
      getResume: "Get the public HTML and PDF resume links. The published resume is in Brazilian Portuguese.",
      getContactInfo: "Retrieve the public professional contact channels published on the portfolio.",
    }),
    parameters: Object.freeze({
      language: "Response language: pt-BR or en. Defaults to this page's language.",
      query: "Optional keyword in a project name, description, or technologies.",
      technology: "Optional technology, such as .NET, Angular, or RabbitMQ.",
      limit: "Maximum number of matches; defaults to 5.",
      projectId: "Project identifier returned by searchProjects.",
    }),
    invalidInput: "Invalid arguments for",
    invalidLanguage: "Unsupported language. Use pt-BR or en.",
    projectNotFound: "No featured project matches the supplied identifier.",
    resumeNote: "The published resume is available only in Brazilian Portuguese.",
  }),
});
