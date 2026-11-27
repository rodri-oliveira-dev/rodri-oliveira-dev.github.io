"""Conservative PR-only optimization for internal Markdown documentation.

Keep every main push and manual run fully validated for exact-SHA release gates.
Unknown paths, invalid/missing comparison context, and Git errors run all checks.
"""
import os
import re
import subprocess

INTERNAL_PREFIXES = (b"docs/adr/", b"docs/privacy/web-push/", b"docs/validation/")
INTERNAL_FILES = {b".github/AUTOMATION.md", b"AGENTS.md"}


def is_internal(path):
    return path in INTERNAL_FILES or (
        path.startswith(INTERNAL_PREFIXES)
        and path.endswith(b".md")
        and all(part not in (b"", b".", b"..") for part in path.split(b"/"))
    )


def should_run(event, base, head, cwd=None):
    if event != "pull_request":
        return True
    if not all(re.fullmatch(r"[0-9a-fA-F]{40}", sha or "") for sha in (base, head)):
        return True
    try:
        raw = subprocess.check_output(
            ["git", "diff", "--no-ext-diff", "--no-renames", "--name-only", "-z",
             f"{base}...{head}", "--"], cwd=cwd, stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.CalledProcessError):
        return True
    if not raw or not raw.endswith(b"\0"):
        return True
    return not all(is_internal(path) for path in raw[:-1].split(b"\0"))


def main():
    run = should_run(os.getenv("GITHUB_EVENT_NAME"), os.getenv("BASE_SHA"), os.getenv("HEAD_SHA"))
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
        out.write(f"run={str(run).lower()}\n")
    print("Full validation required." if run else "Only known internal Markdown changed; site-specific checks not applicable.")


if __name__ == "__main__":
    main()
