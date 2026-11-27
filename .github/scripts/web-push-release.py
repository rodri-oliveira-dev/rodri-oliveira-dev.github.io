"""Validate durable Pages publication evidence and fail-closed Web Push gates."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

SHA = re.compile(r"[0-9a-f]{40}")
CATALOGS = {
    "linkedInPtBrJson": ("assets/data/newsletter-articles.json", "pt-BR"),
    "devCommunityEnglishJson": ("assets/data/devto-articles.json", "en"),
    "hashnodeSpanishJson": ("assets/data/hashnode-articles.json", "es-419"),
}


def api(repo: str, endpoint: str):
    output = subprocess.check_output(
        ["gh", "api", f"repos/{repo}/{endpoint}"], text=True, encoding="utf-8"
    )
    return json.loads(output)


def latest_successful_pages_deployment(repo: str) -> tuple[dict, dict]:
    deployments = api(repo, "deployments?environment=github-pages&per_page=100")
    if not isinstance(deployments, list):
        raise RuntimeError("Resposta inválida ao consultar deployments do Pages")
    for deployment in sorted(deployments, key=lambda item: int(item["id"]), reverse=True):
        statuses = api(repo, f"deployments/{deployment['id']}/statuses?per_page=1")
        if statuses and statuses[0].get("state") == "success":
            return deployment, statuses[0]
    raise RuntimeError("Nenhuma publicação bem-sucedida do GitHub Pages foi encontrada")


def tag_sha(repo: str, tag: str) -> str:
    reference = api(repo, f"git/ref/tags/{quote(tag, safe='')}")
    target = reference.get("object", {})
    if target.get("type") == "tag":
        target = api(repo, f"git/tags/{target.get('sha', '')}").get("object", {})
    sha = target.get("sha", "")
    if target.get("type") != "commit" or not SHA.fullmatch(sha):
        raise RuntimeError("A tag da release não resolve para um commit válido")
    return sha


def published_release_for(repo: str, sha: str) -> dict:
    releases = api(repo, "releases?per_page=100")
    if not isinstance(releases, list):
        raise RuntimeError("Resposta inválida ao consultar GitHub Releases")
    for release in releases:
        if release.get("draft") or release.get("prerelease"):
            continue
        try:
            if tag_sha(repo, release.get("tag_name", "")) == sha:
                return release
        except RuntimeError:
            continue
    raise RuntimeError("O SHA publicado ainda não possui GitHub Release válida")


def read_catalogs(root: Path) -> tuple[dict[str, str], dict[str, int]]:
    contents: dict[str, str] = {}
    counts: dict[str, int] = {}
    for field, (relative, locale) in CATALOGS.items():
        raw = (root / relative).read_text(encoding="utf-8")
        value = json.loads(raw)
        if not isinstance(value, list):
            raise RuntimeError(f"Catálogo {relative} não é uma lista")
        contents[field] = raw
        counts[locale] = len(value)
    return contents, counts


def build_evidence(repo: str, root: Path, expected_sha: str | None) -> tuple[dict, dict[str, int], dict]:
    deployment, status, release = resolve_publication(repo, expected_sha)
    sha = deployment["sha"]
    published_at = datetime.fromisoformat(status["created_at"].replace("Z", "+00:00"))
    catalogs, counts = read_catalogs(root)
    evidence = {
        "sha": sha,
        "sequence": int(deployment["id"]),
        "publishedAtUtc": published_at.isoformat().replace("+00:00", "Z"),
        "sourceRef": "refs/heads/main",
        "conclusion": "succeeded",
        "isLatestSuccessfulDeployment": True,
        "catalogs": catalogs,
    }
    return evidence, counts, release


def resolve_publication(repo: str, expected_sha: str | None) -> tuple[dict, dict, dict]:
    deployment, status = latest_successful_pages_deployment(repo)
    sha = deployment.get("sha", "")
    if not SHA.fullmatch(sha):
        raise RuntimeError("Deployment do Pages não contém SHA completo válido")
    if expected_sha and sha != expected_sha:
        raise RuntimeError("O SHA solicitado foi superado ou não corresponde à publicação efetiva")
    if deployment.get("environment") != "github-pages":
        raise RuntimeError("Deployment não pertence ao Environment github-pages")
    if deployment.get("ref") != "main" or deployment.get("task") != "deploy":
        raise RuntimeError("Deployment do Pages não foi produzido pela publicação da main")
    release = published_release_for(repo, sha)
    published_at = datetime.fromisoformat(status["created_at"].replace("Z", "+00:00"))
    if published_at.tzinfo is None or published_at.utcoffset() != timezone.utc.utcoffset(published_at):
        raise RuntimeError("Status de publicação não possui instante UTC válido")
    return deployment, status, release


def write_summary(path: Path, evidence: dict, counts: dict[str, int], release: dict, mode: str) -> None:
    path.write_text(
        "# Web Push pós-release\n\n"
        f"- **Modo:** `{mode}`\n"
        f"- **SHA publicado:** `{evidence['sha']}`\n"
        f"- **Deployment Pages:** `{evidence['sequence']}`\n"
        f"- **GitHub Release:** `{release['tag_name']}`\n"
        f"- **Artigos detectados:** PT-BR `{counts['pt-BR']}`, EN `{counts['en']}`, ES-419 `{counts['es-419']}`\n"
        + ("- **Efeitos Azure:** nenhum; dry-run não autentica nem escreve na Azure.\n"
           if mode == "dry-run" else
           "- **Efeitos Azure:** condicionados aos gates de privacidade, kill switches e OIDC segregado.\n"),
        encoding="utf-8",
    )


def real_processing_gate(repo: str, confirmation: str, enabled: str, sender_enabled: str) -> None:
    if confirmation != "ENQUEUE":
        raise RuntimeError("Processamento real exige a confirmação exata ENQUEUE")
    if enabled != "true" or sender_enabled != "true":
        raise RuntimeError("Processamento real bloqueado por kill switches fail-closed")
    for number in (155, 156):
        issue = api(repo, f"issues/{number}")
        if issue.get("state") != "closed":
            raise RuntimeError(f"Processamento real bloqueado enquanto a issue #{number} estiver aberta")


def output(name: str, value: str) -> None:
    target = os.environ.get("GITHUB_OUTPUT")
    if target:
        with Path(target).open("a", encoding="utf-8") as handle:
            handle.write(f"{name}={value}\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    evidence_parser = subparsers.add_parser("evidence")
    evidence_parser.add_argument("--repo", required=True)
    evidence_parser.add_argument("--root", type=Path, default=Path.cwd())
    evidence_parser.add_argument("--expected-sha")
    evidence_parser.add_argument("--output", type=Path, required=True)
    evidence_parser.add_argument("--summary", type=Path, required=True)
    evidence_parser.add_argument("--mode", choices=("dry-run", "enqueue"), default="dry-run")
    gate_parser = subparsers.add_parser("gate")
    gate_parser.add_argument("--repo", required=True)
    resolve_parser = subparsers.add_parser("resolve")
    resolve_parser.add_argument("--repo", required=True)
    args = parser.parse_args()

    if args.command == "gate":
        real_processing_gate(
            args.repo,
            os.environ.get("WEB_PUSH_CONFIRMATION", ""),
            os.environ.get("WEB_PUSH_REAL_PROCESSING_ENABLED", "false"),
            os.environ.get("WEB_PUSH_SENDER_ENABLED", "false"),
        )
        return

    if args.command == "resolve":
        deployment, _, _ = resolve_publication(args.repo, None)
        output("sha", deployment["sha"])
        output("sequence", str(deployment["id"]))
        print(f"Publicação efetiva resolvida: {deployment['sha']} (deployment {deployment['id']}).")
        return

    if args.expected_sha and not SHA.fullmatch(args.expected_sha):
        raise RuntimeError("SHA esperado inválido")
    evidence, counts, release = build_evidence(args.repo, args.root, args.expected_sha)
    args.output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_summary(args.summary, evidence, counts, release, args.mode)
    output("sha", evidence["sha"])
    output("sequence", str(evidence["sequence"]))


if __name__ == "__main__":
    main()
