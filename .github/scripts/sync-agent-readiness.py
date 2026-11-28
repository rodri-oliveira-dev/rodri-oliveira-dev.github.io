"""Generate and validate static agent-discovery manifests deterministically."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / ".github" / "agent-readiness.json"
WELL_KNOWN = ROOT / ".well-known"
SKILLS_ROOT = WELL_KNOWN / "agent-skills"
GENERATED_PATHS = (
    SKILLS_ROOT / "index.json",
    WELL_KNOWN / "ard.json",
    WELL_KNOWN / "poppy.json",
    WELL_KNOWN / "ai-catalog.json",
)
NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def parse_frontmatter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if len(lines) < 4 or lines[0] != "---":
        raise ValueError(f"Missing YAML frontmatter: {path}")
    try:
        end = lines.index("---", 1)
    except ValueError as error:
        raise ValueError(f"Unclosed YAML frontmatter: {path}") from error
    fields: dict[str, str] = {}
    for line in lines[1:end]:
        key, separator, value = line.partition(":")
        if not separator or not value.strip():
            raise ValueError(f"Unsupported frontmatter line in {path}: {line}")
        fields[key.strip()] = value.strip()
    return fields


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def validate_config(config: dict) -> None:
    origin = urlparse(config["canonical_origin"])
    planned = urlparse(config["planned_origin"])
    if origin.scheme != "https" or origin.path or origin.query or origin.fragment:
        raise ValueError("canonical_origin must be an HTTPS origin without a path")
    if planned.scheme != "https" or planned.path or planned.query or planned.fragment:
        raise ValueError("planned_origin must be an HTTPS origin without a path")
    if config["identity"]["domain"] != origin.hostname:
        raise ValueError("identity.domain must match canonical_origin")
    names = [skill["name"] for skill in config["skills"]]
    if len(names) != 5 or len(set(names)) != len(names):
        raise ValueError("Exactly five unique public skills are required")
    if any(not NAME_PATTERN.fullmatch(name) for name in names):
        raise ValueError("Public skill names must follow the Agent Skills naming rules")


def build_outputs() -> dict[Path, bytes]:
    config = load_config()
    validate_config(config)
    origin = config["canonical_origin"]
    publisher = config["identity"]["domain"]
    index_skills = []
    ard_entries = []

    for skill in config["skills"]:
        name = skill["name"]
        artifact = SKILLS_ROOT / name / "SKILL.md"
        frontmatter = parse_frontmatter(artifact)
        if frontmatter.get("name") != name:
            raise ValueError(f"Skill name mismatch: {artifact}")
        description = frontmatter.get("description", "")
        if not 1 <= len(description) <= 1024:
            raise ValueError(f"Invalid skill description: {artifact}")
        artifact_bytes = artifact.read_bytes()
        path = f"/.well-known/agent-skills/{name}/SKILL.md"
        index_skills.append(
            {
                "name": name,
                "type": "skill-md",
                "description": description,
                "url": path,
                "digest": f"sha256:{hashlib.sha256(artifact_bytes).hexdigest()}",
            }
        )
        ard_entries.append(
            {
                "@context": "https://agenticresourcediscovery.org/context/v1",
                "identifier": f"urn:air:{publisher}:skill:{name}",
                "displayName": skill["display_name"],
                "type": "application/agent-skills+md",
                "url": f"{origin}{path}",
                "description": description,
                "representativeQueries": skill["representative_queries"],
                "capabilities": skill["capabilities"],
            }
        )

    identity = config["identity"]
    outputs = {
        GENERATED_PATHS[0]: json_bytes(
            {"$schema": config["agent_skills_schema"], "skills": index_skills}
        ),
        GENERATED_PATHS[1]: json_bytes({"entries": ard_entries}),
        GENERATED_PATHS[2]: json_bytes(
            {
                "protocol_version": "1.0",
                "organization": {
                    "name": identity["name"],
                    "domain": identity["domain"],
                    "logo_uri": f"{origin}{identity['logo_path']}",
                },
                "web": {},
            }
        ),
    }
    # AI Catalog 1.0 is a compatibility projection, not another source of truth.
    # Its predecessor envelope has no ARD-specific JSON-LD context member.
    outputs[GENERATED_PATHS[3]] = json_bytes(
        {
            "specVersion": "1.0",
            "host": {
                "displayName": identity["name"],
                "logoUrl": f"{origin}{identity['logo_path']}",
            },
            "entries": [
                {key: value for key, value in entry.items() if key != "@context"}
                for entry in ard_entries
            ],
        }
    )
    return outputs


def synchronize(check: bool) -> None:
    drift = []
    for path, expected in build_outputs().items():
        actual = path.read_bytes() if path.exists() else None
        if actual == expected:
            continue
        if check:
            drift.append(path.relative_to(ROOT).as_posix())
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(expected)
    if drift:
        raise SystemExit("Agent-readiness artifacts are out of sync: " + ", ".join(drift))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail instead of writing on drift")
    args = parser.parse_args()
    synchronize(args.check)


if __name__ == "__main__":
    main()
