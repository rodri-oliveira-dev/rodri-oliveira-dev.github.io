// Generate public, localized vCard 3.0 files for mobile contact import.
// Update identity.revision whenever contact data or the portrait changes.
// Keep rodrigo-contact.jpg derived from the public rodrigo-about.webp:
// centered 400x400 crop, RGB, baseline JPEG quality 85, no source metadata.
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
  "revision": "20261128T021000Z",
  "name": "Rodrigo de Oliveira",
  "structuredName": "de Oliveira;Rodrigo;;;",
  "email": "rodrigodotnet@outlook.com",
  "telephone": "+5519998861786",
  "site": "https://rodri-oliveira-dev.github.io",
  "links": [
    {
      "url": "https://www.linkedin.com/in/rodri-oliveira-dev",
      "label": "LinkedIn"
    },
    {
      "url": "https://github.com/rodri-oliveira-dev",
      "label": "GitHub"
    },
    {
      "url": "https://wa.me/5519998861786",
      "label": "WhatsApp"
    }
  ]
};

function escapeText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[,;]/g, "\\$&");
}

function foldLine(line) {
  let result = "", length = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0);
    const bytes = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (length + bytes > 75) { result += "\r\n "; length = 1; }
    result += ch;
    length += bytes;
  }
  return result;
}

function buildCards(photo) {
  const cards = {};
  for (const locale of locales) {
    // Use UTF-8 text and simple vCard 3.0 TYPE parameters. Apple labels
    // are optional grouped extensions; URL values remain portable.
    const links = identity.links.flatMap(({ url, label }, index) => [
      `item${index + 1}.URL:${url}`,
      `item${index + 1}.X-ABLabel:${escapeText(label)}`
    ]);
    const lines = [
      "BEGIN:VCARD", "VERSION:3.0",
      "FN:" + escapeText(identity.name),
      "N:" + identity.structuredName,
      "TITLE:" + escapeText(locale.title),
      "ROLE:" + escapeText(locale.role),
      "EMAIL;TYPE=INTERNET,WORK,PREF:" + identity.email,
      "TEL;TYPE=CELL:" + identity.telephone,
      "ADR;TYPE=WORK:;;;Limeira;São Paulo;;" + escapeText(locale.country),
      "URL:" + identity.site + locale.route,
      ...links,
      "NOTE:" + escapeText(locale.bio),
      "CATEGORIES:" + locale.categories.map(escapeText).join(","),
      "TZ:-03:00",
      "PHOTO;ENCODING=b;TYPE=JPEG:" + photo,
      "UID:" + identity.uid,
      "REV:" + identity.revision,
      "END:VCARD"
    ];
    cards["rodrigo-de-oliveira-" + locale.suffix + ".vcf"] = lines.map(foldLine).join("\r\n") + "\r\n";
  }
  cards["rodrigo-de-oliveira.vcf"] = cards["rodrigo-de-oliveira-pt-br.vcf"];
  return cards;
}

function expectedCards() {
  const photo = fs.readFileSync(path.join(ROOT, "assets/profile/rodrigo-contact.jpg")).toString("base64");
  return buildCards(photo);
}

if (require.main === module) {
  for (const [name, content] of Object.entries(expectedCards())) {
    fs.writeFileSync(path.join(ROOT, "assets/contact", name), content, "utf8");
  }
}
module.exports = { expectedCards };
