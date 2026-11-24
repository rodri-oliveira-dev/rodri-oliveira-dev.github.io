"""Build the Pages artifact from an explicit public allowlist."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

PUBLIC_PATHS = (
    ".nojekyll",
    "1e7dfc65bd806e29edef5985f15cdb79.txt",
    "BingSiteAuth.xml",
    "assets",
    "case-studies",
    "curriculo",
    "en",
    "es",
    "favicon.svg",
    "google03f812d1021f07e7.html",
    "index.html",
    "newsletter",
    "offline.html",
    "pt-br",
    "robots.txt",
    "servicos",
    "site.webmanifest",
    "sitemap.xml",
    "sw.js",
)
PUBLIC_DOCS = (
    "accessibility-audit.md",
    "pwa.md",
    "webmcp-services-contract.md",
    "webmcp.en.md",
    "webmcp.es-419.md",
    "webmcp.pt-BR.md",
    "contracts/webmcp-services.v1.json",
)


def reject_symlinks(path: Path) -> None:
    candidates = [path] if path.is_symlink() else path.rglob("*") if path.is_dir() else []
    if any(candidate.is_symlink() for candidate in candidates):
        raise RuntimeError(f"Public artifact cannot contain symlinks: {path}")


def copy_path(source: Path, destination: Path) -> None:
    if not source.exists():
        raise FileNotFoundError(source)
    reject_symlinks(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, destination)
    else:
        shutil.copy2(source, destination)


def assemble(source: Path, destination: Path) -> None:
    source, destination = source.resolve(), destination.resolve()
    if destination == source or source in destination.parents:
        raise RuntimeError("Destination must be outside the source tree")
    if destination.exists():
        raise RuntimeError("Destination must not already exist")
    destination.mkdir(parents=True)
    for relative in PUBLIC_PATHS:
        copy_path(source / relative, destination / relative)
    for relative in PUBLIC_DOCS:
        copy_path(source / "docs" / relative, destination / "docs" / relative)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    assemble(args.source, args.destination)


if __name__ == "__main__":
    main()
