"""Credential-free tests. No Azure requests or real credentials."""
import importlib.util
import io
import os
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch, ANY

spec = importlib.util.spec_from_file_location("isolation", Path(__file__).with_name("verify-state-isolation.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def listing(container="tfstate", entries="", maximum="1"):
    return (f'<EnumerationResults ServiceEndpoint="https://{m.HOST}/" ContainerName="{container}">'
            f'<MaxResults>{maximum}</MaxResults><Blobs>{entries}</Blobs><NextMarker>opaque</NextMarker>'
            '</EnumerationResults>').encode()


def error(code):
    return f"<Error><Code>{code}</Code><Message>sensitive details</Message></Error>".encode()


class ClassifierTests(unittest.TestCase):
    def test_positive_empty_or_one(self):
        for entries in ("", "<Blob><Name>private-state</Name></Blob>"):
            self.assertEqual(m.classify(200, None, "request", listing(entries=entries), "tfstate"), "ALLOWED")

    def test_explicit_denial(self):
        self.assertEqual(m.classify(403, m.DENIAL, "request", error(m.DENIAL), "tfstate"), "DENIED")

    def test_false_positive_denials(self):
        for code in (None, "", "AuthenticationFailed", "AuthorizationFailure",
                     "AuthorizationServiceMismatch", "KeyBasedAuthenticationNotPermitted",
                     "ContainerNotFound", "Other"):
            with self.subTest(code=code):
                self.assertEqual(m.classify(403, code, "request", error(code), "tfstate"), "INCONCLUSIVE")

    def test_status_and_body_must_agree(self):
        for status in (200, 401, 404, 409, 429, 500, 503):
            self.assertEqual(m.classify(status, m.DENIAL, "request", error(m.DENIAL), "tfstate"), "INCONCLUSIVE")
        for body in (b"", b"not XML", error("AuthenticationFailed"),
                     b"<Error><Message>AuthorizationPermissionMismatch</Message></Error>",
                     b"<Error><Code>AuthorizationPermissionMismatch</Code><Code>Other</Code></Error>"):
            self.assertEqual(m.classify(403, m.DENIAL, "request", body, "tfstate"), "INCONCLUSIVE")

    def test_invalid_positive(self):
        for body in (b"<html/>", b"<EnumerationResults/>", listing("tfstate-diagnostics"),
                     listing(maximum="2"), listing(entries="<Blob/><Blob/>"),
                     listing(entries="<BlobPrefix/>"), listing(entries="<Blob/>"),
                     listing().replace(m.HOST.encode(), b"other.invalid"),
                     b"<!DOCTYPE x>" + listing(), b"x" * (m.LIMIT + 1)):
            self.assertEqual(m.classify(200, None, "request", body, "tfstate"), "INCONCLUSIVE")
        self.assertEqual(m.classify(200, None, None, listing(), "tfstate"), "INCONCLUSIVE")

    def test_matrix_including_unexpected_allow(self):
        for identity in m.CONTAINERS:
            calls = []
            def fake(container, token):
                calls.append(container)
                return "ALLOWED"
            rows = m.evaluate(identity, "fake", fake)
            self.assertEqual(calls[0], m.CONTAINERS[identity])
            self.assertEqual(len(set(calls)), 2)
            self.assertEqual(rows[1][1:], ("DENIED", "ALLOWED"))

    @patch.object(m.http.client, "HTTPSConnection")
    def test_transport_single_read_only_request(self, factory):
        connection = factory.return_value
        response = connection.getresponse.return_value
        response.status = 200
        response.getheader.side_effect = lambda key: "request" if key == "x-ms-request-id" else None
        response.read.return_value = listing()
        self.assertEqual(m.probe("tfstate", "fake"), "ALLOWED")
        connection.request.assert_called_once_with("GET", "/tfstate?restype=container&comp=list&maxresults=1",
            headers={"Authorization": "Bearer fake", "x-ms-version": m.API_VERSION, "x-ms-date": ANY, "Accept": "application/xml"})
        response.read.assert_called_once_with(m.LIMIT + 1)
        connection.close.assert_called_once()
        connection.getresponse.side_effect = TimeoutError("private detail")
        self.assertEqual(m.probe("tfstate", "fake"), "INCONCLUSIVE")

    @patch.object(m.http.client, "HTTPSConnection")
    def test_redirect_and_unknown_target(self, factory):
        response = factory.return_value.getresponse.return_value
        response.status = 302
        response.getheader.return_value = "request"
        response.read.return_value = b""
        self.assertEqual(m.probe("tfstate", "fake"), "INCONCLUSIVE")
        self.assertEqual(m.probe("unknown", "fake"), "INCONCLUSIVE")
        factory.assert_called_once()

    @patch.object(m, "cli")
    def test_wrong_identity_no_token(self, cli):
        value = "00000000-0000-0000-0000-000000000000"
        env = dict.fromkeys(("EXPECTED_CLIENT", "EXPECTED_TENANT", "EXPECTED_SUBSCRIPTION"), value)
        cli.return_value = {"user": {"name": value, "type": "user"}, "tenantId": value, "id": value}
        with patch.dict(os.environ, env):
            with self.assertRaises(ValueError):
                m.get_token()
        cli.assert_called_once()

    @patch.object(m, "get_token", side_effect=subprocess.CalledProcessError(1, "az", output=b"private-token"))
    def test_report_failure_is_sanitized(self, _):
        import tempfile
        with tempfile.TemporaryDirectory() as temp:
            report = Path(temp) / "summary"
            with patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(report)}), \
                 patch.object(m.sys, "argv", ["probe", "foundation"]), \
                 patch("sys.stdout", new_callable=io.StringIO) as stdout:
                self.assertEqual(m.main(), 1)
            self.assertIn("INCONCLUSIVE", report.read_text())
            self.assertNotIn("private-token", report.read_text() + stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
