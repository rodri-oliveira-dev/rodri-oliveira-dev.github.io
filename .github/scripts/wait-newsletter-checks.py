#!/usr/bin/env python3
"""Wait for required newsletter pull-request checks using GitHub's REST API.

Unlike `gh pr checks --watch`, this avoids a long-lived GraphQL polling
session. An unavailable API never counts as a successful quality gate.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

REQUIRED_CHECKS = (
    "Site validation",
    "SEO metadata consistency",
    "WCAG 2 AA accessibility",
    "Lighthouse quality",
    "zizmor security audit",
)
POLL_SECONDS = 10
TIMEOUT_SECONDS = 25 * 60
API_RETRIES = 12
TRANSIENT_HTTP_CODES = {429, 500, 502, 503, 504}


def evaluate_checks(payload: dict) -> tuple[str, str]:
    """Return (success|pending|failure, human-readable status).

    Duplicate check-runs can occur after reruns; use the newest run by ID.
    Ignore optional third-party checks, but require *all* five expected gates.
    """
    observed: dict[str, dict] = {}
    for run in payload.get("check_runs", []):
        if not isinstance(run, dict):
            continue
        name = run.get("name")
        if name not in REQUIRED_CHECKS or (run.get("app") or {}).get("slug") != "github-actions":
            continue
        if name not in observed or int(run.get("id") or 0) > int(observed[name].get("id") or 0):
            observed[name] = run

    pending = False
    failed = False
    summary = []
    for name in REQUIRED_CHECKS:
        run = observed.get(name)
        if run is None:
            state = "missing"
            pending = True
        elif run.get("status") != "completed":
            state = run.get("status") or "pending"
            pending = True
        else:
            state = run.get("conclusion") or "unknown"
            if state != "success":
                failed = True
        summary.append(f"{name}: {state}")

    return ("failure" if failed else "pending" if pending else "success"), "; ".join(summary)


def api_get(path: str, token: str) -> dict:
    request = urllib.request.Request(
        "https://api.github.com/" + path,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "newsletter-quality-gates",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )

    for attempt in range(1, API_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.load(response)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            if isinstance(exc, urllib.error.HTTPError) and exc.code not in TRANSIENT_HTTP_CODES:
                raise
            if attempt == API_RETRIES:
                raise
            print(
                f"Temporary GitHub API error ({exc}); retrying "
                f"{attempt}/{API_RETRIES - 1}...",
                flush=True,
            )
            time.sleep(POLL_SECONDS)

    raise RuntimeError("GitHub API retries exhausted")


def main() -> None:
    repo = os.environ["GH_REPO"]
    pr_number = os.environ["PR_NUMBER"]
    token = os.environ["GH_TOKEN"]
    if not repo or not pr_number or not token:
        raise SystemExit("Missing repository, PR number, or GitHub token.")

    pr = api_get(f"repos/{repo}/pulls/{pr_number}", token)
    head_sha = (pr.get("head") or {}).get("sha")
    if not head_sha:
        raise SystemExit("Could not determine the pull request head commit.")

    print(f"Waiting for required checks on PR #{pr_number} ({head_sha})...", flush=True)
    deadline = time.monotonic() + TIMEOUT_SECONDS
    previous_summary = None

    while time.monotonic() < deadline:
        checks = api_get(f"repos/{repo}/commits/{head_sha}/check-runs?per_page=100", token)
        state, summary = evaluate_checks(checks)
        if summary != previous_summary:
            print(summary, flush=True)
            previous_summary = summary

        if state == "failure":
            raise SystemExit("A required quality gate did not pass.")
        if state == "success":
            print("All five required quality gates passed.", flush=True)
            return

        time.sleep(POLL_SECONDS)

    raise SystemExit("Timed out waiting for all required quality gates; merge blocked.")


if __name__ == "__main__":
    main()
