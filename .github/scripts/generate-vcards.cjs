// Generate public, localized vCards from the existing public portrait.
// Update identity.revision explicitly whenever the contact data or portrait changes.
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../..");
const locales = [
  {
    "suffix": "pt-br",
    "language": "pt-BR",
    "route": "/",
    "title": "Arquiteto de Software",
    "role": "Arquitetura de software",
    "country": "Brasil",
    "bio": "Arquiteto de Software com mais de 20 anos de experiência em engenharia de software, especializado em arquitetura de sistemas distribuídos, .NET, computação em nuvem e engenharia de software assistida por inteligência artificial.",
    "categories": [
      "Arquitetura de software",
      "Engenharia de software",
      "Sistemas distribuídos",
      ".NET",
      "Computação em nuvem",
      "Inteligência artificial",
      "Liderança técnica",
      "Governança de arquitetura"
    ]
  },
  {
    "suffix": "en-us",
    "language": "en-US",
    "route": "/en/",
    "title": "Software Architect",
    "role": "Software architecture",
    "country": "Brazil",
    "bio": "Software Architect with over 20 years of experience in software engineering, specializing in distributed systems architecture, .NET, cloud computing, and AI-assisted software engineering.",
    "categories": [
      "Software architecture",
      "Software engineering",
      "Distributed systems",
      ".NET",
      "Cloud computing",
      "Artificial intelligence",
      "Technical leadership",
      "Architecture governance"
    ]
  },
  {
    "suffix": "es",
    "language": "es-419",
    "route": "/es/",
    "title": "Arquitecto de Software",
    "role": "Arquitectura de software",
    "country": "Brasil",
    "bio": "Arquitecto de Software con más de 20 años de experiencia en ingeniería de software, especializado en arquitectura de sistemas distribuidos, .NET, computación en la nube e ingeniería de software asistida por inteligencia artificial.",
    "categories": [
      "Arquitectura de software",
      "Ingeniería de software",
      "Sistemas distribuidos",
      ".NET",
      "Computación en la nube",
      "Inteligencia artificial",
      "Liderazgo técnico",
      "Gobernanza de arquitectura"
    ]
  }
];
const identity = {
  "uid": "urn:uuid:3ec4c6ea-07c3-4bf2-8a9e-258ee9a8bed2",
  "revision": "20261127T201300Z",
  "name": "Rodrigo de Oliveira",
  "structuredName": "de Oliveira;Rodrigo;;;",
  "email": "rodrigodotnet@outlook.com",
  "telephone": "+5519998861786",
  "site": "https://rodri-oliveira-dev.github.io",
  "links": [
    "https://www.linkedin.com/in/rodri-oliveira-dev",
    "https://github.com/rodri-oliveira-dev",
    "https://wa.me/5519998861786"
  ]
};

function escapeText(value){return value.replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n").replace(/[,;]/g,"\\$&");}

function foldLine(line){let result="",length=0;for(const ch of line){const cp=ch.codePointAt(0);const bytes=cp<=0x7f?1:cp<=0x7ff?2:cp<=0xffff?3:4;if(length+bytes>75){result+="\r\n ";length=1;}result+=ch;length+=bytes;}return result;}

function buildCards(photo){const cards={};for(const locale of locales){const lang=";LANGUAGE="+locale.language;const lines=["BEGIN:VCARD","VERSION:4.0","KIND:individual","FN:"+escapeText(identity.name),"N:"+identity.structuredName,"TITLE"+lang+":"+escapeText(locale.title),"ROLE"+lang+":"+escapeText(locale.role),"EMAIL;TYPE=work;PREF=1:"+identity.email,"TEL;VALUE=uri;TYPE=cell;PREF=1:tel:"+identity.telephone,"ADR;TYPE=work"+lang+":;;;Limeira;São Paulo;;"+escapeText(locale.country),"URL;PREF=1:"+identity.site+locale.route,...identity.links.map(url=>"URL:"+url),"NOTE"+lang+":"+escapeText(locale.bio),"CATEGORIES:"+locale.categories.map(escapeText).join(","),"TZ:America/Sao_Paulo","PHOTO;MEDIATYPE=image/webp:data:image/webp;base64,"+photo,"UID:"+identity.uid,"REV:"+identity.revision,"END:VCARD"];cards["rodrigo-de-oliveira-"+locale.suffix+".vcf"]=lines.map(foldLine).join("\r\n")+"\r\n";}cards["rodrigo-de-oliveira.vcf"]=cards["rodrigo-de-oliveira-pt-br.vcf"];return cards;}

function expectedCards() {
  const photo = fs.readFileSync(path.join(ROOT, "assets/profile/rodrigo-about.webp")).toString("base64");
  return buildCards(photo);
}

if (require.main === module) {
  for (const [name, content] of Object.entries(expectedCards())) {
    fs.writeFileSync(path.join(ROOT, "assets/contact", name), content, "utf8");
  }
}
module.exports = { expectedCards };
