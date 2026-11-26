import runpy
import unittest
from pathlib import Path

module = runpy.run_path(str(Path(__file__).with_name("verify-diagnostics.py")))
verify, expected = module["verify"], module["expected"]
SUB = "00000000-0000-0000-0000-000000000000"


class VerifyDiagnosticsTests(unittest.TestCase):
    def data(self, include):
        workspace, specs = expected(SUB, include)
        return {target: {"name": name, "properties": {
            "workspaceId": workspace,
            "logs": [{key: value, "enabled": True} for key, value in logs],
            "metrics": [{"category": value, "enabled": True} for value in metrics],
        }} for _, target, name, logs, metrics in specs}

    def test_foundation_and_full(self):
        for include in (False, True):
            data = self.data(include)
            self.assertEqual(verify(SUB, include, lambda target, name: data[target]), [])
            self.assertEqual(len(data), 4 if include else 3)

    def test_absent_and_bad_destination(self):
        data = self.data(True)
        _, specs = expected(SUB, True)
        del data[specs[-1][1]]
        data[specs[0][1]]["properties"]["workspaceId"] = "other"
        self.assertEqual(verify(SUB, True, lambda target, name: data.get(target)), ["cosmos", "function"])

    def test_disabled_and_extra_category(self):
        data = self.data(False)
        _, specs = expected(SUB)
        data[specs[0][1]]["properties"]["logs"][0]["enabled"] = False
        data[specs[1][1]]["properties"]["logs"].append({"category": "other", "enabled": True})
        self.assertEqual(verify(SUB, False, lambda target, name: data[target]), ["cosmos", "vault"])

    def test_unexpected_sink_and_read_error(self):
        data = self.data(False)
        _, specs = expected(SUB)
        data[specs[0][1]]["properties"]["storageAccountId"] = "other"
        def fetch(target, name):
            if target == specs[2][1]:
                raise OSError("PRIVATE_CANARY")
            return data[target]
        self.assertEqual(verify(SUB, False, fetch), ["cosmos", "queue"])


if __name__ == "__main__":
    unittest.main()
