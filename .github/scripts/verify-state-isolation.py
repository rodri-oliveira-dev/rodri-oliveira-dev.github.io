"""Read-only, fail-closed Storage data-plane isolation probe (stdlib only)."""
import http.client
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HOST = "strotfstatepushdev.blob.core.windows.net"
CONTAINERS = {"foundation": "tfstate", "diagnostics": "tfstate-diagnostics"}
API_VERSION = "2023-11-03"
LIMIT = 131072
DENIAL = "AuthorizationPermissionMismatch"


def classify(status, error_code, request_id, body, container):
    """Return only a fixed enum; never return server content."""
    if not request_id or len(body) > LIMIT or b"<!DOCTYPE" in body.upper() or b"<!ENTITY" in body.upper():
        return "INCONCLUSIVE"
    try:
        root = ET.fromstring(body)
    except (ET.ParseError, ValueError):
        return "INCONCLUSIVE"
    if status == 403 and error_code == DENIAL:
        if root.tag == "Error" and [node.text for node in root.findall("Code")] == [DENIAL]:
            return "DENIED"
    if status == 200 and error_code is None and root.tag == "EnumerationResults":
        blobs = root.findall("Blobs")
        if (root.get("ServiceEndpoint") == f"https://{HOST}/"
                and root.get("ContainerName") == container
                and root.findtext("MaxResults") == "1"
                and len(blobs) == 1 and len(blobs[0]) <= 1
                and all(node.tag == "Blob" and node.find("Name") is not None for node in blobs[0])):
            return "ALLOWED"
    return "INCONCLUSIVE"


def cli(*args):
    result = subprocess.run(["az", *args, "--only-show-errors", "--output", "json"],
                            capture_output=True, check=True, timeout=60)
    return json.loads(result.stdout)


def get_token():
    # Azure Login uses the environment's federated service principal. Verify the
    # CLI context locally; no account information is written to the report.
    expected = [os.environ[k] for k in ("EXPECTED_CLIENT", "EXPECTED_TENANT", "EXPECTED_SUBSCRIPTION")]
    if any(not re.fullmatch(r"[0-9a-fA-F-]{36}", value) for value in expected):
        raise ValueError("Invalid expected identity configuration")
    account = cli("account", "show")
    actual = [account["user"]["name"], account["tenantId"], account["id"]]
    if account["user"]["type"] != "servicePrincipal" or [v.lower() for v in actual] != [v.lower() for v in expected]:
        raise ValueError("Unexpected CLI identity")
    token = cli("account", "get-access-token", "--resource", "https://storage.azure.com/",
                "--tenant", expected[1])["accessToken"]
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9._~-]+", token):
        raise ValueError("Invalid bearer token")
    return token


def probe(container, token):
    if container not in CONTAINERS.values():
        return "INCONCLUSIVE"
    # Direct HTTPS, default certificate/hostname validation, no redirect,
    # no proxy, no retry, no continuation token or additional datasets.
    connection = http.client.HTTPSConnection(HOST, timeout=20)
    try:
        connection.request("GET", f"/{container}?restype=container&comp=list&maxresults=1",
                           headers={"Authorization": f"Bearer {token}",
                                    "x-ms-version": API_VERSION,
                                    "Accept": "application/xml"})
        response = connection.getresponse()
        return classify(response.status, response.getheader("x-ms-error-code"),
                        response.getheader("x-ms-request-id"), response.read(LIMIT + 1), container)
    except Exception:
        # Transport/parser exceptions can contain identifiers or headers.
        return "INCONCLUSIVE"
    finally:
        connection.close()


def evaluate(identity, token, probe_fn=probe):
    other = "diagnostics" if identity == "foundation" else "foundation"
    return [(identity, "ALLOWED", probe_fn(CONTAINERS[identity], token)),
            (other, "DENIED", probe_fn(CONTAINERS[other], token))]


def main():
    identity = sys.argv[1] if len(sys.argv) == 2 else ""
    if identity not in CONTAINERS:
        return 1
    try:
        rows = evaluate(identity, get_token())
    except Exception:
        other = "diagnostics" if identity == "foundation" else "foundation"
        rows = [(identity, "ALLOWED", "INCONCLUSIVE"), (other, "DENIED", "INCONCLUSIVE")]
    lines = [f"### State isolation: {identity}", "",
             "| Container alias | Expected | Observed |", "| --- | --- | --- |"]
    lines.extend(f"| {target} | {expected} | {observed} |" for target, expected, observed in rows)
    passed = all(expected == observed for _, expected, observed in rows)
    lines += ["", f"Result: {'PASS' if passed else 'FAIL'}", ""]
    try:
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a", encoding="utf-8") as output:
            output.write("\n".join(lines))
    except Exception:
        print("Unable to write sanitized report.")
        return 1
    print(f"State isolation probe: {'PASS' if passed else 'FAIL'}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
