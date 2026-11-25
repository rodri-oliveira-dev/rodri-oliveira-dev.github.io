"""Create and verify the non-secret manifest for an immutable Function package."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

SHA = re.compile(r"[0-9a-f]{40}")


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as package:
        for chunk in iter(lambda: package.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def create(package: Path, manifest: Path, revision: str, run_id: str) -> None:
    if not SHA.fullmatch(revision):
        raise ValueError("Revision must be a full Git SHA")
    manifest.write_text(json.dumps({
        "revision": revision,
        "run_id": run_id,
        "package": package.name,
        "sha256": digest(package),
    }, sort_keys=True) + "\n", encoding="utf-8")


def verify(package: Path, manifest: Path, expected_revision: str | None) -> str:
    data = json.loads(manifest.read_text(encoding="utf-8"))
    revision = data.get("revision", "")
    if not SHA.fullmatch(revision):
        raise ValueError("Manifest has an invalid revision")
    if expected_revision and revision != expected_revision:
        raise ValueError("Package revision does not match the selected release")
    if data.get("package") != package.name or data.get("sha256") != digest(package):
        raise ValueError("Package checksum or filename does not match its manifest")
    return revision


def verify_lineage(current: str, rollback: str) -> None:
    if not SHA.fullmatch(current) or not SHA.fullmatch(rollback) or current == rollback:
        raise ValueError("Rollback revisions are invalid or identical")
    result = subprocess.run(
        ["git", "merge-base", "--is-ancestor", rollback, current], check=False
    )
    if result.returncode != 0:
        raise ValueError("Rollback revision is not an ancestor of the selected release")


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    create_parser = subparsers.add_parser("create")
    verify_parser = subparsers.add_parser("verify")
    lineage_parser = subparsers.add_parser("lineage")
    for current in (create_parser, verify_parser):
        current.add_argument("package", type=Path)
        current.add_argument("manifest", type=Path)
    create_parser.add_argument("revision")
    create_parser.add_argument("run_id")
    verify_parser.add_argument("--revision")
    lineage_parser.add_argument("current")
    lineage_parser.add_argument("rollback")
    args = parser.parse_args()
    if args.command == "create":
        create(args.package, args.manifest, args.revision, args.run_id)
    elif args.command == "verify":
        print(verify(args.package, args.manifest, args.revision))
    else:
        verify_lineage(args.current, args.rollback)


if __name__ == "__main__":
    main()
