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


PDF = Path("curriculo/rodrigo-de-oliveira.pdf")
SECTIONS = (
    "Perfil profissional",
    "Experiência profissional",
    "CI&T",
    "IBM",
    "Pearson",
    "weme",
    "Comtel e Fernandez S/A",
    "Áreas de atuação",
    "Tecnologias",
    "Formação acadêmica",
    "Idiomas",
    "Projetos independentes",
    "Portfólio e estudos de caso",
)


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).casefold()


def verify(layout: bool) -> None:
    args = ["pdftotext"]
    if layout:
        args.append("-layout")
    args.extend(["-enc", "UTF-8", "-nopgbrk", str(PDF), "-"])
    result = subprocess.run(args, check=True, capture_output=True, text=True)
    content = normalized(result.stdout)
    cursor = -1
    for label in SECTIONS:
        index = content.find(normalized(label), cursor + 1)
        if index < 0:
            positions = [(name, content.find(normalized(name))) for name in SECTIONS]
            raise AssertionError(
                f"Seção ausente ou fora de ordem no pdftotext "
                f"({'layout' if layout else 'padrão'}): {label}. "
                f"Posições encontradas: {positions}. "
                f"Contexto após seção anterior: {content[max(0, cursor-180):cursor+600]!r}"
            )
        cursor = index


def main() -> int:
    if not PDF.is_file():
        raise FileNotFoundError(f"PDF não encontrado: {PDF}")
    if shutil.which("pdftotext") is None:
        raise RuntimeError("Instale poppler-utils para executar a validação do PDF.")
    verify(layout=False)
    verify(layout=True)
    print("Ordem de leitura do PDF validada em extrações padrão e layout.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
