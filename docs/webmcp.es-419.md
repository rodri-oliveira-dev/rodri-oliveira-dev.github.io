# Integración WebMCP del portafolio (es-419)

[Português (Brasil)](webmcp.pt-BR.md) | [English](webmcp.en.md) | **Español (América Latina)**

## Objetivo y alcance

El sitio ofrece seis herramientas generales **de solo lectura** y cuatro herramientas adicionales para servicios mediante la [API imperativa de WebMCP](https://developer.chrome.com/docs/ai/webmcp/imperative-api). Se registran dentro de una pestaña de un navegador compatible mediante `document.modelContext.registerTool`. No son endpoints REST ni un servidor MCP remoto. La apariencia del sitio no cambia.

- Idiomas: `pt-BR`, `en` y `es-419`. Las descripciones de las herramientas siguen el idioma de la página, pero cada llamada puede solicitar otro idioma.
- Páginas: inicio y cinco estudios de caso en portugués, inglés y español; currículum en portugués y servicios en `/servicos/`, `/en/services/` y `/es/servicios/`.
- Datos: información profesional pública, cinco proyectos destacados y cuatro servicios de consultoría; sin credenciales, análisis de usuarios, peticiones externas ni operaciones de escritura.
- Compatibilidad: si la API no existe o el contexto no es seguro, el sitio continúa funcionando normalmente sin registrar herramientas.
- Currículum: los documentos HTML y PDF publicados **solo están disponibles en portugués de Brasil**. Una respuesta en español no implica que exista una versión traducida.

**WebMCP todavía es experimental.** No sustituye al SEO, al HTML semántico, a los datos estructurados ni al sitemap, y no garantiza que los agentes descubran o recomienden el sitio. Su disponibilidad depende del navegador, versión y configuración. Este repositorio no incorpora un token de prueba de origen (*origin trial*).

## Arquitectura

| Archivo | Responsabilidad |
| --- | --- |
| [`assets/js/webmcp.js`](../assets/js/webmcp.js) | Detectar WebMCP, registrar herramientas, cancelarlas al salir y restaurarlas tras volver desde bfcache |
| [`assets/js/webmcp-tools.mjs`](../assets/js/webmcp-tools.mjs) | Definiciones, esquemas JSON Schema, validación de entradas y resultados |
| [`assets/js/webmcp-data.mjs`](../assets/js/webmcp-data.mjs) | Información pública de proyectos, perfil y competencias |
| [`assets/js/webmcp-i18n.mjs`](../assets/js/webmcp-i18n.mjs) | Descripciones, parámetros, mensajes de error y selección de idioma |
| [`assets/js/webmcp-services.mjs`](../assets/js/webmcp-services.mjs) | Cuatro herramientas de consulta de servicios, contratos y errores traducidos |
| [`assets/js/webmcp-services-data.mjs`](../assets/js/webmcp-services-data.mjs) | Servicios y enfoque de trabajo en los tres idiomas |
| [`docs/contracts/webmcp-services.v1.json`](contracts/webmcp-services.v1.json) | Contrato JSON Schema v1.0.0 |
| [`docs/webmcp-services-contract.md`](webmcp-services-contract.md) | Especificación, versionado, seguridad y mantenimiento |
| [`.github/scripts/test-webmcp-services.mjs`](../.github/scripts/test-webmcp-services.mjs) | Pruebas de contratos, coherencia con HTML y simulación del navegador |
| [`.github/scripts/test-webmcp.mjs`](../.github/scripts/test-webmcp.mjs) | Pruebas de contratos, traducciones, seguridad y coherencia con el HTML |
| [`.github/workflows/site-validation.yml`](../.github/workflows/site-validation.yml) | Ejecutar pruebas WebMCP en pull requests y cambios a `main` |
| [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) | Verificar los módulos y la documentación en el sitio estático generado |

Las páginas cargan `/assets/js/webmcp.js` como módulo ECMAScript nativo. Solo las tres rutas de servicios importan bajo demanda `webmcp-services.mjs`, ofreciendo hasta diez herramientas; las demás conservan las seis generales. No se requiere backend, empaquetador ni dependencias adicionales. Se mantiene la política de seguridad CSP: `script-src 'self'` y `connect-src 'none'`.

## Herramientas disponibles

| Herramienta | Parámetros | Respuesta |
| --- | --- | --- |
| `getProfile` | `language?` | Nombre, cargo, resumen, experiencia y URL del sitio |
| `getSkills` | `language?` | Competencias técnicas publicadas |
| `searchProjects` | `query?`, `technology?`, `limit?`, `language?` | Total y resultados de búsqueda de proyectos |
| `getProjectDetails` | `projectId`, `language?` | Información de un proyecto, repositorio y estudio de caso |
| `getResume` | `language?` | Enlaces HTML/PDF e idioma realmente disponible: `pt-BR` |
| `getContactInfo` | `language?` | Correo, LinkedIn, GitHub y sitio público |

### Herramientas adicionales exclusivas de las páginas de servicios

| Herramienta | Parámetros | Respuesta |
| --- | --- | --- |
| `getServices` | `language?` | Cuatro servicios profesionales y una nota sobre el alcance |
| `getServiceDetails` | `serviceId`, `language?` | Descripción de un servicio y posibles resultados sujetos al alcance acordado |
| `getEngagementProcess` | `language?` | Introducción y tres etapas del enfoque de trabajo |
| `getConsultingContact` | `language?` | Correo, LinkedIn e indicaciones para el primer contacto |

Estas herramientas solo consultan información pública. No envían mensajes ni celebran contratos. Los identificadores de servicio son `architecture-review`, `dotnet-modernization`, `apis-distributed-systems` y `technical-decision-support`. Un ID desconocido devuelve `SERVICE_NOT_FOUND` y `availableIds`. Consulta los esquemas y ejemplos en el [contrato de servicios v1](webmcp-services-contract.md).

Los nombres de herramientas y propiedades JSON se conservan en inglés por estabilidad del contrato. Las descripciones, la ayuda y los mensajes están traducidos.

### Idiomas, búsqueda y errores

- Si se omite `language`, se utiliza el atributo `lang` de la página: `pt-BR`, `en` o `es-419`.
- Se puede solicitar cualquiera de estos tres idiomas independientemente de la página abierta.
- Un idioma explícito no admitido devuelve `UNSUPPORTED_LANGUAGE`. Los argumentos inválidos devuelven `INVALID_INPUT`.
- Si `projectId` no existe, la herramienta devuelve `PROJECT_NOT_FOUND` y la lista `availableIds`.
- La búsqueda ignora diferencias entre mayúsculas, minúsculas y tildes; consulta nombres, descripciones y tecnologías de los tres idiomas.
- `limit` admite 1 a 5 resultados (valor predeterminado: 5); `query`, hasta 120 caracteres; `technology`, hasta 80.

Ejemplo:

```json
{
  "tool": "searchProjects",
  "arguments": {
    "technology": ".NET",
    "language": "es-419",
    "limit": 3
  }
}
```

## Pruebas automatizadas

Desde la raíz del repositorio:

```bash
node --test .github/scripts/test-webmcp.mjs
node --test .github/scripts/test-webmcp-services.mjs
node .github/scripts/test-site-i18n.cjs
```

La primera prueba verifica las seis herramientas generales. La segunda cubre las cuatro herramientas de servicios, el contrato JSON Schema v1.0.0, los tres idiomas, los errores, el registro restringido por ruta, la restauración mediante bfcache y la coherencia entre los datos y el HTML de las tres páginas de servicios.

El workflow de GitHub Actions `Site validation` ejecuta estas pruebas con Node.js 24. El build de GitHub Pages verifica la presencia de los módulos generales y de servicios, además de las guías. Las pruebas simuladas **no demuestran compatibilidad en un navegador real**.

## Prueba manual adicional para las páginas de servicios

Con una versión compatible de Chrome y WebMCP experimental habilitado, inicia el servidor local indicado más abajo. Abre sucesivamente `http://localhost:8000/servicos/`, `http://localhost:8000/en/services/` y `http://localhost:8000/es/servicios/`.

En la consola DevTools:

```javascript
const context = document.modelContext;
const registered = await context.getTools();
console.log(registered.map((tool) => tool.name).sort());
const details = registered.find((tool) => tool.name === "getServiceDetails");
const result = await context.executeTool(details, {
  serviceId: "architecture-review",
  language: "es-419"
});
console.log(result);
```

Deben aparecer **diez herramientas** en cada página de servicios: seis generales y cuatro específicas. La consulta devolverá la descripción de revisión arquitectónica en español. En `/`, `/en/` y `/es/`, deben aparecer **solo seis**. Comprueba además `getServices`, `getEngagementProcess`, `getConsultingContact` y `SERVICE_NOT_FOUND` para un servicio desconocido. Al salir de la página se cancelan los registros; al volver desde bfcache se restauran sin duplicados.

Esta es una **prueba manual en navegador nativo**, no una verificación realizada por las pruebas automatizadas con simulaciones. Las versiones, opciones experimentales e inspectores de Chrome pueden cambiar; consulta la documentación oficial.

## Prueba manual en un navegador compatible

1. Utiliza una versión de Chrome compatible con la API WebMCP experimental. Si está disponible, habilita la opción de prueba en `chrome://flags/#enable-webmcp-testing` y reinicia el navegador. Comprueba los requisitos actuales en [Chrome Developers: WebMCP](https://developer.chrome.com/docs/ai/webmcp).
2. En la raíz de la branch del PR, ejecuta `python3 -m http.server 8000` y abre `http://localhost:8000/es/`. `localhost` funciona como contexto seguro. No abras el archivo con `file://`.
3. En la consola DevTools, comprueba `"modelContext" in document`. Un valor `false` indica ausencia de soporte en el navegador.
4. Si el navegador expone la API de inspección desde DevTools, ejecuta:

```javascript
const ctx = document.modelContext;
const available = await ctx.getTools();
available.map((tool) => tool.name);
```

Deben aparecer `getProfile`, `getSkills`, `searchProjects`, `getProjectDetails`, `getResume` y `getContactInfo`.

5. Prueba una consulta:

```javascript
const search = available.find((tool) => tool.name === "searchProjects");
const result = await ctx.executeTool(search, {
  query: "observabilidad",
  language: "es-419"
});
console.log(result);
```

6. Repite desde `/en/` y `/` con `language: "es-419"`. Comprueba también `INVALID_INPUT`, `UNSUPPORTED_LANGUAGE` y `PROJECT_NOT_FOUND`. Al salir de una página se aborta el `AbortSignal` de su registro. Al regresar mediante el historial, si el navegador restaura el documento desde bfcache (`pageshow.persisted`), las seis herramientas se registran de nuevo con una señal nueva.

Algunos navegadores no exponen `getTools()` y `executeTool()` directamente en DevTools. En ese caso utiliza el inspector WebMCP disponible para esa versión. Una flag local no activa automáticamente WebMCP para todos los agentes externos.

## Mantenimiento

Si cambias proyectos en `es/index.html`, actualiza sus descripciones en `assets/js/webmcp-data.mjs` dentro del mismo PR. El gate de CI compara los cinco proyectos en los tres idiomas, incluidos los enlaces. Mantén las competencias y el perfil alineados con el JSON-LD correspondiente. Al cambiar las páginas de servicios, actualiza también `assets/js/webmcp-services-data.mjs` y ejecuta `node --test .github/scripts/test-webmcp-services.mjs`. Conserva el contrato versionado y actualiza `lastmod` en el sitemap cuando cambie el contenido del sitio. Las nuevas herramientas deben ser de solo lectura, contar con descripciones en los tres idiomas y tener pruebas de entrada, salida y errores.

Referencias: [visión general](https://developer.chrome.com/docs/ai/webmcp), [API imperativa](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [borrador de la especificación](https://webmachinelearning.github.io/webmcp/).
