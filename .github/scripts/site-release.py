"""Plan and publish a manually deployed site release using the GitHub CLI."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

SEMVER = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
REQUIRED = ("site-validation.yml", "accessibility.yml", "actions-security.yml",
            "seo-validation.yml", "adr-guard.yml")
OPTIONAL = ("pwa.yml", "terraform-validation.yml", "lighthouse.yml")


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def api(repo, endpoint, *args):
    return command("gh", "api", f"repos/{repo}/{endpoint}", *args)


def version(tag):
    match = SEMVER.fullmatch(tag)
    return tuple(map(int, match.groups())) if match else None


def next_version(tags, bump):
    major, minor, patch = max((version(t) for t in tags if version(t) is not None),
                              default=(0, 0, 0))
    if bump == "major":
        major, minor, patch = major + 1, 0, 0
    elif bump == "minor":
        minor, patch = minor + 1, 0
    elif bump == "patch":
        patch += 1
    else:
        raise ValueError("Invalid version increment")
    return f"{major}.{minor}.{patch}"


def tags_at(sha):
    return [t for t in command("git", "tag", "--points-at", sha).splitlines()
            if version(t) is not None]


def require_main(repo, sha):
    if os.environ["GITHUB_REF"] != "refs/heads/main":
        raise RuntimeError("Release is restricted to main")
    if api(repo, "git/ref/heads/main", "--jq", ".object.sha") != sha:
        raise RuntimeError("main advanced; start a new release for its current head")


def check_runs(repo, sha):
    for workflow in REQUIRED + OPTIONAL:
        runs = json.loads(api(repo, f"actions/workflows/{workflow}/runs?branch=main&head_sha={sha}&per_page=100"))
        matches = [run for run in runs["workflow_runs"]
                   if run["head_sha"] == sha and run["event"] in ("push", "workflow_dispatch")]
        if not matches:
            if workflow in REQUIRED:
                raise RuntimeError(f"Missing validation for {workflow} at {sha}; run it on main first")
            continue
        latest = max(matches, key=lambda run: run["id"])
        if latest["status"] != "completed" or latest["conclusion"] != "success":
            raise RuntimeError(f"Validation not successful: {workflow} ({latest['html_url']})")
        print(f"Validated {workflow}: {latest['html_url']}")


def plan(repo, sha):
    require_main(repo, sha)
    if api(repo, "pages", "--jq", ".build_type") != "workflow":
        raise RuntimeError("Select GitHub Actions as the Pages source in Settings > Pages")
    check_runs(repo, sha)
    existing = tags_at(sha)
    tag = max(existing, key=version) if existing else next_version(
        command("git", "tag", "--list").splitlines(), os.environ["BUMP"])
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as out:
        out.write(f"tag={tag}\n")
    print(f"Release candidate: {tag} ({sha})")


def publish(repo, sha):
    require_main(repo, sha)
    tag = os.environ["RELEASE_TAG"]
    if version(tag) is None:
        raise RuntimeError("Invalid release tag")
    # The preflight output is immutable across a failed-job retry; never retarget a tag.
    tags = command("git", "tag", "--list").splitlines()
    if tag in tags:
        if command("git", "rev-list", "-n", "1", tag) != sha:
            raise RuntimeError(f"Tag {tag} already points to a different commit")
    else:
        tag_object = api(repo, "git/tags", "--method", "POST",
                         "-f", f"tag={tag}", "-f", f"message=Release {tag}",
                         "-f", f"object={sha}", "-f", "type=commit", "--jq", ".sha")
        api(repo, "git/refs", "--method", "POST", "-f", f"ref=refs/tags/{tag}",
            "-f", f"sha={tag_object}")
    # List rather than swallowing arbitrary errors from a failed release lookup.
    release_tags = api(repo, "releases?per_page=100", "--paginate",
                       "--jq", ".[] | select(.draft == false) | .tag_name").splitlines()
    if tag in release_tags:
        print(f"Release {tag} already exists")
        return
    previous = [t for t in release_tags if version(t) is not None and version(t) < version(tag)]
    previous = max(previous, key=version) if previous else None
    args = ["gh", "release", "create", tag, "--repo", repo, "--verify-tag",
            "--title", f"Release {tag}"]
    if previous:
        # GitHub generates PR-based notes across the entire release interval.
        args += ["--generate-notes", "--notes-start-tag", previous]
    else:
        # Legacy tags were created per merge, not per published GitHub Release.
        # Start the first changelog with the full first-parent history.
        notes = command("git", "log", "--first-parent", "--format=- %s (%h)", sha)
        notes_path = Path(os.environ["RUNNER_TEMP"]) / "site-release-notes.md"
        notes_path.write_text(f"## Changes\n\n{notes}\n", encoding="utf-8")
        args += ["--notes-file", str(notes_path)]
    print(command(*args))


def main():
    repo, sha = os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_SHA"]
    {"plan": plan, "publish": publish}[sys.argv[1]](repo, sha)


if __name__ == "__main__":
    main()
