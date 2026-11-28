"""Fail-closed site-only release; never authenticate to Azure or apply Terraform."""
from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path


def load_sibling(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release = load_sibling("site_release", "site-release.py")
publication = load_sibling("web_push_release", "web-push-release.py")
SHA = re.compile(r"[0-9a-f]{40}")
FULL_WORKFLOW = ".github/workflows/deploy-pages.yml"
FULL_JOBS = {
    "Validate release candidate",
    "Plan and apply workload infrastructure",
    "Reconcile diagnostic settings / Plan and apply diagnostic settings",
    "Package notifications backend",
    "Deploy and verify notifications backend",
}
PUBLIC_PREFIXES = (
    ".well-known/", "assets/", "case-studies/", "curriculo/", "en/", "es/",
    "newsletter/", "pt-br/", "servicos/", "docs/",
)
SITE_FILES = {
    ".nojekyll", "1e7dfc65bd806e29edef5985f15cdb79.txt", "BingSiteAuth.xml",
    "favicon.svg", "google03f812d1021f07e7.html", "index.html", "offline.html",
    "robots.txt", "site.webmanifest", "sitemap.xml", "README.md", "README.en.md",
    "README.es.md", "ACCESSIBILITY.md",
    ".github/agent-readiness.json", ".github/AUTOMATION.md",
    ".github/workflows/deploy-site.yml",
    ".github/scripts/site-only-release.py", ".github/scripts/test_site_release.py",
    ".github/scripts/generate-vcards.cjs", ".github/scripts/test-site-i18n.cjs",
    ".github/scripts/sync-agent-readiness.py", ".github/scripts/test_agent_readiness.py",
    ".github/scripts/test_assemble_site.py", ".github/scripts/assemble-site.py",
    ".github/scripts/generate-resume-pdf.mjs", ".github/scripts/test_resume_pdf_order.py",
    ".github/scripts/sync-seo.py", ".github/scripts/test_sync_seo.py",
    ".github/scripts/render-newsletter.py", ".github/scripts/generate-newsletter-feed.py",
    ".github/scripts/sync-devto-articles.py", ".github/scripts/sync-hashnode-articles.py",
    ".github/scripts/test_sync_devto_articles.py", ".github/scripts/test_sync_hashnode_articles.py",
}
# Changes in these browser-side integration contracts also require a full release.
PROTECTED_PREFIXES = ("assets/js/web-push", "docs/contracts/web-push")
PROTECTED_FILES = {"sw.js"}


def allowed_path(path):
    if path in PROTECTED_FILES or path.startswith(PROTECTED_PREFIXES):
        return False
    return (path in SITE_FILES or path.startswith(PUBLIC_PREFIXES)
            or (path.startswith(".github/skills/portfolio-") and path.endswith(".md")))


def read_json(repo, endpoint):
    return json.loads(release.api(repo, endpoint))


def latest_full_release(repo):
    result = read_json(
        repo, "actions/workflows/deploy-pages.yml/runs?branch=main&event=workflow_dispatch&per_page=100"
    )
    runs = result["workflow_runs"]
    if not runs:
        raise RuntimeError("No full release evidence; run Release and Deploy first")
    # Do not fall back to older success after a failed, cancelled or partial deployment.
    latest = max(runs, key=lambda item: item["id"])
    if (latest.get("status") != "completed" or latest.get("conclusion") != "success"
            or latest.get("head_branch") != "main" or latest.get("event") != "workflow_dispatch"
            or latest.get("path") != FULL_WORKFLOW
            or not SHA.fullmatch(latest.get("head_sha", ""))):
        raise RuntimeError("Latest full release is not successful; use Release and Deploy")
    jobs = read_json(repo, f"actions/runs/{latest['id']}/jobs?filter=latest&per_page=100")
    if jobs["total_count"] > len(jobs["jobs"]):
        raise RuntimeError("Incomplete full release job evidence")
    for name in FULL_JOBS:
        matches = [job for job in jobs["jobs"] if job["name"] == name]
        if len(matches) != 1 or matches[0].get("conclusion") != "success":
            raise RuntimeError(f"Full release evidence missing successful job: {name}")
    backend = next(job for job in jobs["jobs"] if job["name"] == "Deploy and verify notifications backend")
    for name in ("Deploy immutable package", "Smoke test"):
        steps = [step for step in backend.get("steps", []) if step["name"] == name]
        if len(steps) != 1 or steps[0].get("conclusion") != "success":
            raise RuntimeError(f"Full release evidence missing successful backend step: {name}")
    return latest


def changed_paths(baseline, sha):
    subprocess.run(["git", "merge-base", "--is-ancestor", baseline, sha], check=True)
    result = subprocess.check_output(
        ["git", "diff", "--name-only", "--no-renames", "-z", baseline, sha, "--"]
    )
    return [os.fsdecode(path) for path in result.split(b"\0") if path]


def guard(repo, sha):
    if not SHA.fullmatch(sha) or release.command("git", "rev-parse", "HEAD") != sha:
        raise RuntimeError("Checkout does not match requested SHA")
    release.require_main(repo, sha)
    if release.api(repo, "pages", "--jq", ".build_type") != "workflow":
        raise RuntimeError("Select GitHub Actions as the Pages source in Settings > Pages")
    baseline = latest_full_release(repo)
    blocked = sorted(path for path in changed_paths(baseline["head_sha"], sha) if not allowed_path(path))
    if blocked:
        # repr escapes control characters in untrusted repository paths.
        raise RuntimeError("Full release required for changed paths: " + ", ".join(map(repr, blocked)))
    print(f"Verified successful full release run {baseline['id']} at {baseline['head_sha']}; no protected path changes")
    return baseline


def plan(repo, sha):
    baseline = guard(repo, sha)
    release.check_runs(repo, sha)
    existing = release.tags_at(sha)
    tag = max(existing, key=release.version) if existing else release.next_version(
        release.command("git", "tag", "--list").splitlines(), os.environ["BUMP"]
    )
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as out:
        out.write(f"sha={sha}\ntag={tag}\nbaseline_run_id={baseline['id']}\n")
    print(f"Site-only release candidate: {tag} ({sha})")


def recheck(repo, sha):
    baseline = guard(repo, sha)
    if str(baseline["id"]) != os.environ["BASELINE_RUN_ID"]:
        raise RuntimeError("Full release baseline changed; start a new site-only release")
    release.check_runs(repo, sha)


def verify_publication(repo, sha):
    if (os.environ.get("GITHUB_REF") != "refs/heads/main" or not SHA.fullmatch(sha)
            or release.command("git", "rev-parse", "HEAD") != sha):
        raise RuntimeError("Release metadata requires a trusted main checkout")
    deployment, _ = publication.latest_successful_pages_deployment(repo)
    if (deployment.get("sha") != sha or deployment.get("ref") != "main"
            or deployment.get("task") != "deploy" or deployment.get("environment") != "github-pages"):
        raise RuntimeError("Pages publication is missing or superseded; refusing release metadata")


def tag(repo, sha):
    verify_publication(repo, sha)
    release.create_tag(repo, sha)


def publish(repo, sha):
    verify_publication(repo, sha)
    release.publish_release(repo, sha)


if __name__ == "__main__":
    {"plan": plan, "recheck": recheck, "tag": tag, "release": publish}[sys.argv[1]](
        os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_SHA"]
    )
