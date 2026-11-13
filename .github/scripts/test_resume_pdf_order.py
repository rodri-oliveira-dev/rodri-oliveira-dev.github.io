#!/usr/bin/env python3
"""Confere a sequência linear do texto extraído do currículo em PDF.

A versão impressa deve manter uma sequência textual linear, sem intercalar o
rodapé ou seções laterais às experiências profissionais. Os modos padrão e
-layout representam extração textual de leitura; -raw expõe a ordem interna
de gravação dos objetos e não é critério de ordem lógica. Requer Poppler.
"""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import unicodedata


RESUMES = {
    "pt-BR": (
        Path("curriculo/rodrigo-de-oliveira.pdf"),
        ("Perfil profissional", "Experiência profissional", "CI&T", "IBM", "Pearson",
         "weme", "Comtel e Fernandez S/A", "Áreas de atuação", "Tecnologias",
         "Formação acadêmica", "Idiomas", "Projetos independentes",
         "Portfólio e estudos de caso"),
    ),
    "en": (
        Path("en/resume/rodrigo-de-oliveira.pdf"),
        ("Professional profile", "Professional experience", "CI&T", "IBM", "Pearson",
         "weme", "Comtel e Fernandez S/A", "Areas of expertise", "Technologies",
         "Education", "Languages", "Independent projects", "Portfolio and case studies"),
    ),
    "es-419": (
        Path("es/curriculo/rodrigo-de-oliveira.pdf"),
        ("Perfil profesional", "Experiencia profesional", "CI&T", "IBM", "Pearson",
         "weme", "Comtel e Fernandez S/A", "Áreas de experiencia", "Tecnologías",
         "Formación académica", "Idiomas", "Proyectos independientes",
         "Portafolio y estudios de caso"),
    ),
}


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).casefold()


def verify(pdf: Path, sections: tuple[str, ...], layout: bool) -> None:
    args = ["pdftotext"]
    if layout:
        args.append("-layout")
    args.extend(["-enc", "UTF-8", "-nopgbrk", str(pdf), "-"])
    result = subprocess.run(
        args, check=True, capture_output=True, text=True, encoding="utf-8"
    )
    content = normalized(result.stdout)
    cursor = -1
    for label in sections:
        index = content.find(normalized(label), cursor + 1)
        if index < 0:
            positions = [(name, content.find(normalized(name))) for name in sections]
            raise AssertionError(
                f"Seção ausente ou fora de ordem no pdftotext "
                f"({'layout' if layout else 'padrão'}): {label}. "
                f"Posições encontradas: {positions}. "
                f"Contexto após seção anterior: {content[max(0, cursor-180):cursor+600]!r}"
            )
        cursor = index


def main() -> int:
    if shutil.which("pdftotext") is None:
        raise RuntimeError("Instale poppler-utils para executar a validação do PDF.")
    if shutil.which("pdfinfo") is None:
        raise RuntimeError("Instale poppler-utils para verificar a paginação do PDF.")
    for language, (pdf, sections) in RESUMES.items():
        if not pdf.is_file():
            raise FileNotFoundError(f"PDF não encontrado: {pdf}")
        verify(pdf, sections, layout=False)
        verify(pdf, sections, layout=True)
        metadata = subprocess.run(
            ["pdfinfo", str(pdf)], check=True, capture_output=True, text=True,
            encoding="utf-8",
        ).stdout
        match = re.search(r"^Pages:\s*(\d+)\s*$", metadata, re.MULTILINE)
        if not match:
            raise AssertionError(f"Não foi possível determinar a paginação de {pdf}.")
        pages = int(match.group(1))
        if not 1 <= pages <= 3:
            raise AssertionError(f"O currículo {language} deve ocupar no máximo 3 páginas A4, mas possui {pages}.")
        print(f"{language}: ordem de leitura validada; {pages} páginas A4 (limite de 3).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
