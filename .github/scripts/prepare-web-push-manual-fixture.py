"""Build an isolated, mock-only Web Push fixture outside the Pages artifact."""

from __future__ import annotations

import argparse
import shutil
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = {
    ".github/scripts/fixtures/web-push-manual.html": "index.html",
    ".github/scripts/fixtures/web-push-manual.mjs": "web-push-manual.mjs",
    "assets/css/site.css": "assets/css/site.css",
    "assets/css/web-push.css": "assets/css/web-push.css",
    "assets/js/web-push-lifecycle.mjs": "assets/js/web-push-lifecycle.mjs",
    "assets/js/web-push-view.mjs": "assets/js/web-push-view.mjs",
    ".github/scripts/serve-test-site.py": "serve.py",
}


def prepare(destination: Path) -> Path:
    destination = destination.resolve()
    if destination.exists():
        raise FileExistsError(f"Destination already exists: {destination}")
    destination.mkdir(parents=True)
    for source_name, destination_name in FILES.items():
        source = ROOT / source_name
        target = destination / destination_name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return destination


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", type=Path)
    args = parser.parse_args()
    destination = args.destination or Path(tempfile.gettempdir()) / (
        "portfolio-web-push-manual-" + uuid.uuid4().hex
    )
    prepared = prepare(destination)
    print(prepared)


if __name__ == "__main__":
    main()
