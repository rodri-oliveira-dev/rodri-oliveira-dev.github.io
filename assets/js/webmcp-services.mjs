/**
 * WebMCP service tool definitions, version 1.0.0.
 * Pure browser-independent handlers, not registered until integration stage 4.
 * Schemas and discovery text are derived from docs/contracts/webmcp-services.v1.json.
 * Keep the versioned contract and this module in sync (CI parity checks in stage 5).
 */
import {
  SERVICES_CONTRACT_VERSION, SERVICES_SUPPORTED_LANGUAGES, SERVICES_PAGE_URLS,
  SERVICES_SERVICE_IDS, SERVICES_CONTACT_EMAIL, SERVICES_LINKEDIN_URL,
  SERVICES_CATALOG,
} from "./webmcp-services-data.mjs";

const ERROR_MESSAGES = Object.freeze({
  "pt-BR": {
    "INVALID_INPUT": "Parâmetros inválidos para",
    "UNSUPPORTED_LANGUAGE": "Idioma não suportado. Use pt-BR, en ou es-419.",
    "SERVICE_NOT_FOUND": "Serviço não encontrado."
  },
  "en": {
    "INVALID_INPUT": "Invalid arguments for",
    "UNSUPPORTED_LANGUAGE": "Unsupported language. Use pt-BR, en or es-419.",
    "SERVICE_NOT_FOUND": "Service not found."
  },
  "es-419": {
    "INVALID_INPUT": "Parámetros no válidos para",
    "UNSUPPORTED_LANGUAGE": "Idioma no admitido. Usa pt-BR, en o es-419.",
    "SERVICE_NOT_FOUND": "Servicio no encontrado."
  }
});
const SERVICE_TOOL_DEFINITIONS = Object.freeze({
  "getServices": {
    "title": {
      "pt-BR": "Consultar serviços",
      "en": "Get services",
      "es-419": "Consultar servicios"
    },
    "description": {
      "pt-BR": "Lista as quatro frentes públicas de serviços profissionais.",
      "en": "List the four public professional service areas.",
      "es-419": "Enumera las cuatro áreas públicas de servicios profesionales."
    },
    "annotations": {
      "readOnlyHint": true,
      "idempotentHint": true,
      "openWorldHint": false,
      "consequentialHint": false
    },
    "inputSchema": {
      "type": "object",
      "properties": {
        "language": {
          "type": "string",
          "enum": [
            "pt-BR",
            "en",
            "es-419"
          ]
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "outputSchema": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "contractVersion": {
              "type": "string",
              "const": "1.0.0"
            },
            "language": {
              "type": "string",
              "enum": [
                "pt-BR",
                "en",
                "es-419"
              ]
            },
            "sourceUrl": {
              "type": "string",
              "format": "uri"
            },
            "services": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string",
                    "enum": [
                      "architecture-review",
                      "dotnet-modernization",
                      "apis-distributed-systems",
                      "technical-decision-support"
                    ]
                  },
                  "title": {
                    "type": "string",
                    "minLength": 1
                  },
                  "description": {
                    "type": "string",
                    "minLength": 1
                  }
                },
                "required": [
                  "id",
                  "title",
                  "description"
                ],
                "additionalProperties": false
              },
              "minItems": 4,
              "maxItems": 4
            },
            "engagementNote": {
              "type": "string",
              "minLength": 1
            }
          },
          "required": [
            "contractVersion",
            "language",
            "sourceUrl",
            "services",
            "engagementNote"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "contractVersion": {
              "type": "string",
              "const": "1.0.0"
            },
            "language": {
              "type": "string",
              "enum": [
                "pt-BR",
                "en",
                "es-419"
              ]
            },
            "error": {
              "type": "object",
              "properties": {
                "code": {
                  "type": "string",
                  "enum": [
                    "INVALID_INPUT",
                    "UNSUPPORTED_LANGUAGE"
                  ]
                },
                "message": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "required": [
                "code",
                "message"
              ],
              "additionalProperties": false
            },
            "availableIds": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "architecture-review",
                  "dotnet-modernization",
                  "apis-distributed-systems",
                  "technical-decision-support"
                ]
              },
              "minItems": 4,
              "maxItems": 4
            }
          },
          "required": [
            "contractVersion",
            "language",
            "error"
          ],
          "additionalProperties": false
        }
      ]
    }
  },
  "getServiceDetails": {
    "title": {
      "pt-BR": "Detalhes do serviço",
      "en": "Get service details",
      "es-419": "Consultar detalles del servicio"
    },
    "description": {
      "pt-BR": "Consulta a descrição de um serviço e possíveis resultados condicionados ao escopo acordado.",
      "en": "Retrieve a service description and possible outcomes subject to the agreed scope.",
      "es-419": "Consulta la descripción de un servicio y sus posibles resultados sujetos al alcance acordado."
    },
    "annotations": {
      "readOnlyHint": true,
      "idempotentHint": true,
      "openWorldHint": false,
      "consequentialHint": false
    },
    "inputSchema": {
      "type": "object",
      "properties": {
        "language": {
          "type": "string",
          "enum": [
            "pt-BR",
            "en",
            "es-419"
          ]
        },
        "serviceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80,
          "pattern": "^[a-z][a-z0-9-]*$"
        }
      },
      "required": [
        "serviceId"
      ],
      "additionalProperties": false
    },
    "outputSchema": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "contractVersion": {
              "type": "string",
              "const": "1.0.0"
            },
            "language": {
              "type": "string",
              "enum": [
                "pt-BR",
                "en",
                "es-419"
              ]
            },
            "sourceUrl": {
              "type": "string",
              "format": "uri"
            },
            "service": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "enum": [
                    "architecture-review",
                    "dotnet-modernization",
                    "apis-distributed-systems",
                    "technical-decision-support"
                  ]
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "description": {
                  "type": "string",
                  "minLength": 1
                },
                "potentialOutputs": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1
                  },
                  "maxItems": 2
                },
                "scopeNote": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "required": [
                "id",
                "title",
                "description",
                "potentialOutputs",
                "scopeNote"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "contractVersion",
            "language",
            "sourceUrl",
            "service"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "contractVersion": {
              "type": "string",
              "const": "1.0.0"
            },
            "language": {
              "type": "string",
              "enum": [
                "pt-BR",
                "en",
                "es-419"
              ]
            },
            "error": {
              "type": "object",
              "properties": {
                "code": {
                  "type": "string",
                  "enum": [
                    "INVALID_INPUT",
                    "UNSUPPORTED_LANGUAGE",
                    "SERVICE_NOT_FOUND"
                  ]
                },
                "message": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "required": [
                "code",
                "message"
              ],
              "additionalProperties": false
            },
            "availableIds": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "architecture-review",
                  "dotnet-modernization",
                  "apis-distributed-systems",
                  "technical-decision-support"
                ]
              },
              "minItems": 4,
              "maxItems": 4
            }
          },
          "required": [
            "contractVersion",
            "language",
            "error"
          ],
          "additionalProperties": false
        }
      ]
    }
  },
  "getEngagementProcess": {
    "title": {
      "pt-BR": "Abordagem de trabalho",
      "en": "Get engagement process",
      "es-419": "Consultar el proceso de colaboración"
    },
    "description": {
      "pt-BR": "Explica as três etapas da abordagem profissional apresentadas no site.",
      "en": "Explain the three professional engagement steps described on the site.",
      "es-419": "Explica las tres etapas del enfoque profesional descritas en el sitio."
    },
    "annotations": {
      "readOnlyHint": true,
      "idempotentHint": true,
      "openWorldHint": false,
      "consequentialHint": false
    },
    "inputSchema": {
      "type": "object",
      "properties": {
        "language": {
          "type": "string",
          "enum": [
            "pt-BR",
            "en",
            "es-419"
          ]
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "outputSchema": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "contractVersion": {
              "type": "string",
              "const": "1.0.0"
            },
            "language": {
              "type": "string",
              "enum": [
                "pt-BR",
                "en",
                "es-419"
              ]
            },
            "sourceUrl": {
              "type": "string",
              "format": "uri"
            },
            "introduction": {
              "type": "string",
              "minLength": 1
            },
            "steps": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string",
                    "enum": [
                      "context",
                      "alternatives",
                      "next-steps"
                    ]
                  },
                  "title": {
                    "type": "string",
                    "minLength": 1
                  },
                  "description": {
                    "type": "string",
                    "minLength": 1
                  }
                },
                "required": [
                  "id",
                  "title",
                  "description"
                ],
                "additionalProperties": false
              },
              "minItems": 3,
              "maxItems": 3
            }
          },
          "required": [
            "contractVersion",
            "language",
            "sourceUrl",
            "introduction",
            "steps"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "contractVersion": {
              "type": "string",
              "const": "1.0.0"
            },
            "language": {
              "type": "string",
              "enum": [
                "pt-BR",
                "en",
                "es-419"
              ]
            },
            "error": {
              "type": "object",
              "properties": {
                "code": {
                  "type": "string",
                  "enum": [
                    "INVALID_INPUT",
                    "UNSUPPORTED_LANGUAGE"
                  ]
                },
                "message": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "required": [
                "code",
                "message"
              ],
              "additionalProperties": false
            },
            "availableIds": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "architecture-review",
                  "dotnet-modernization",
                  "apis-distributed-systems",
                  "technical-decision-support"
                ]
              },
              "minItems": 4,
              "maxItems": 4
            }
          },
          "required": [
            "contractVersion",
            "language",
            "error"
          ],
          "additionalProperties": false
        }
      ]
    }
  },
  "getConsultingContact": {
    "title": {
      "pt-BR": "Contato para consultoria",
      "en": "Get consulting contact",
      "es-419": "Obtener contacto de consultoría"
    },
    "description": {
      "pt-BR": "Consulta canais de contato públicos e orientações para uma conversa inicial; não envia mensagens.",
      "en": "Get public contact channels and initial outreach guidance; does not send messages.",
      "es-419": "Consulta los canales públicos de contacto y las indicaciones iniciales; no envía mensajes."
    },
    "annotations": {
      "readOnlyHint": true,
      "idempotentHint": true,
      "openWorldHint": false,
      "consequentialHint": false
    },
    "inputSchema": {
      "type": "object",
      "properties": {
        "language": {
          "type": "string",
          "enum": [
            "pt-BR",
            "en",
            "es-419"
          ]
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "outputSchema": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "contractVersion": {
              "type": "string",
              "const": "1.0.0"
            },
            "language": {
              "type": "string",
              "enum": [
                "pt-BR",
                "en",
                "es-419"
              ]
            },
            "sourceUrl": {
              "type": "string",
              "format": "uri"
            },
            "email": {
              "type": "string",
              "format": "email"
            },
            "emailUrl": {
              "type": "string",
              "minLength": 1
            },
            "linkedInUrl": {
              "type": "string",
              "format": "uri"
            },
            "guidance": {
              "type": "string",
              "minLength": 1
            }
          },
          "required": [
            "contractVersion",
            "language",
            "sourceUrl",
            "email",
            "emailUrl",
            "linkedInUrl",
            "guidance"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "contractVersion": {
              "type": "string",
              "const": "1.0.0"
            },
            "language": {
              "type": "string",
              "enum": [
                "pt-BR",
                "en",
                "es-419"
              ]
            },
            "error": {
              "type": "object",
              "properties": {
                "code": {
                  "type": "string",
                  "enum": [
                    "INVALID_INPUT",
                    "UNSUPPORTED_LANGUAGE"
                  ]
                },
                "message": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "required": [
                "code",
                "message"
              ],
              "additionalProperties": false
            },
            "availableIds": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "architecture-review",
                  "dotnet-modernization",
                  "apis-distributed-systems",
                  "technical-decision-support"
                ]
              },
              "minItems": 4,
              "maxItems": 4
            }
          },
          "required": [
            "contractVersion",
            "language",
            "error"
          ],
          "additionalProperties": false
        }
      ]
    }
  }
});

function failure(language,code,toolName){
 const message=ERROR_MESSAGES[language][code];
 return {contractVersion:SERVICES_CONTRACT_VERSION,language,error:{code,message:code==="INVALID_INPUT"?`${message} ${toolName}.`:message}};
}

function resolveCall(input,page,toolName) {
 if(input===null||typeof input!=="object"||Array.isArray(input)||
   ![Object.prototype,null].includes(Object.getPrototypeOf(input))) {
   return {error:failure(page,"INVALID_INPUT",toolName)};
 }
 const explicit=Object.prototype.hasOwnProperty.call(input,"language");
 const language=explicit? (SERVICES_SUPPORTED_LANGUAGES.includes(input.language)?input.language:null):page;
 if(language===null)return {error:failure(page,"UNSUPPORTED_LANGUAGE",toolName)};
 const expected=toolName==="getServiceDetails"?["language","serviceId"]:["language"];
 if(Reflect.ownKeys(input).some(key=>typeof key!=="string"||!expected.includes(key))) {
   return {error:failure(language,"INVALID_INPUT",toolName)};
 }
 if(toolName==="getServiceDetails"&&(
   typeof input.serviceId!=="string"||
   input.serviceId.length===0||
   input.serviceId.length>80||
   !/^[a-z][a-z0-9-]*$/.test(input.serviceId)
 ))return {error:failure(language,"INVALID_INPUT",toolName)};
 return {language};
}

export function createServiceTools(pageLocale="pt-BR"){
 const page=SERVICES_SUPPORTED_LANGUAGES.includes(pageLocale)?pageLocale:"pt-BR";
 return ["getServices","getServiceDetails","getEngagementProcess","getConsultingContact"].map((name)=>{
   const metadata=SERVICE_TOOL_DEFINITIONS[name];
   return {
     name,
     title:metadata.title[page],
     description:metadata.description[page],
     inputSchema:metadata.inputSchema,
     outputSchema:metadata.outputSchema,
     annotations:metadata.annotations,
     execute(input={}){
       const resolved=resolveCall(input,page,name);
       if(resolved.error)return resolved.error;
       const language=resolved.language;
       const data=SERVICES_CATALOG[language];
       const base={contractVersion:SERVICES_CONTRACT_VERSION,language,sourceUrl:SERVICES_PAGE_URLS[language]};
       switch(name){
         case "getServices":
           return {...base,services:data.services.map(({id,title,description})=>({id,title,description})),engagementNote:data.engagementNote};
         case "getServiceDetails": {
           const service=data.services.find(item=>item.id===input.serviceId);
           if(!service)return {...failure(language,"SERVICE_NOT_FOUND",name),availableIds:[...SERVICES_SERVICE_IDS]};
           return {...base,service:{id:service.id,title:service.title,description:service.description,potentialOutputs:[...data.potentialOutputs],scopeNote:data.scopeNote}};
         }
         case "getEngagementProcess":
           return {...base,introduction:data.process.introduction,steps:data.process.steps.map(({id,title,description})=>({id,title,description}))};
         case "getConsultingContact":
           return {...base,email:SERVICES_CONTACT_EMAIL,emailUrl:data.contact.emailUrl,linkedInUrl:SERVICES_LINKEDIN_URL,guidance:data.contact.guidance};
         default:
           // Unreachable for the four names in this contract.
           return failure(language,"INVALID_INPUT",name);
       }
     }
   };
 });
}
