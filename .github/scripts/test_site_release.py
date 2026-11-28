import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("site_release", Path(__file__).with_name("site-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

runtime_spec = importlib.util.spec_from_file_location("runtime_iam", Path(__file__).with_name("verify-runtime-iam.py"))
runtime_iam = importlib.util.module_from_spec(runtime_spec)
runtime_spec.loader.exec_module(runtime_iam)
WORKFLOWS = Path(__file__).parents[1] / "workflows"


class RuntimeIamTests(unittest.TestCase):
    def test_direct_role_requires_exact_scope_principal_and_unconditional_access(self):
        principal, scope, role = "principal", "/subscriptions/sub/resourceGroups/rg/storage", runtime_iam.ROLES["blob"]
        assignment = {"principalId": principal.upper(), "scope": scope.upper(), "roleDefinitionId": "/roles/" + role}
        self.assertTrue(runtime_iam.has_role([assignment], principal, scope, role))
        for override in ({"scope": scope + "/child"}, {"principalId": "other"}, {"roleDefinitionId": "/roles/other"}, {"condition": "conditional"}):
            self.assertFalse(runtime_iam.has_role([{**assignment, **override}], principal, scope, role))

    def test_missing_assignments_block_release(self):
        with patch.dict(runtime_iam.os.environ, {"ARM_SUBSCRIPTION_ID": "sub"}), patch.object(
            runtime_iam, "az_json", side_effect=["principal", [], [], []]
        ):
            with self.assertRaisesRegex(SystemExit, "Runtime IAM incomplete: blob, queue, vault, cosmos"):
                runtime_iam.main()


class ReleaseWorkflowTests(unittest.TestCase):
    def test_release_uses_one_protected_workload_job(self):
        workflow = (WORKFLOWS / "deploy-pages.yml").read_text(encoding="utf-8")
        self.assertEqual(workflow.count("environment: terraform-dev"), 1)
        self.assertNotIn("\n  terraform_plan:", workflow)
        self.assertNotIn("\n  diagnostics_gate:", workflow)
        self.assertIn("name: Plan and apply workload infrastructure", workflow)
        self.assertIn("needs: [preflight, terraform_apply, backend_package, diagnostics_apply]", workflow)
        self.assertEqual(workflow.count("terraform plan -input=false"), 1)
        self.assertEqual(workflow.count('terraform apply -json'), 1)
        self.assertIn('terraform apply -json -auto-approve -input=false -lock-timeout=5m -no-color "$plan_file"', workflow)
        self.assertIn("WORKLOAD_MODE: ${{ inputs.bootstrap_foundation_only && 'foundation' || 'full' }}", workflow)
        self.assertIn('args=(--workload-mode "$WORKLOAD_MODE")', workflow)

    def test_diagnostics_plan_and_apply_are_mutually_exclusive(self):
        workflow = (WORKFLOWS / "terraform-diagnostics-reusable.yml").read_text(encoding="utf-8")
        script = Path(__file__).with_name("run-diagnostics-terraform.sh").read_text(encoding="utf-8")
        self.assertIn("if: inputs.operation == 'plan'", workflow)
        self.assertIn("if: inputs.operation == 'apply'", workflow)
        self.assertIn("run-diagnostics-terraform.sh plan-apply", workflow)
        self.assertNotIn("APPROVED_FINGERPRINT", workflow + script)
        self.assertIn('case "$mode" in plan|plan-apply)', script)
        self.assertEqual(script.count("terraform plan -json -detailed-exitcode"), 1)
        self.assertEqual(script.count('terraform apply -json'), 1)
        self.assertIn('terraform apply -json -auto-approve -input=false -lock-timeout=5m -no-color "$scratch/plan.tfplan"', script)


class ReleaseTests(unittest.TestCase):
    def test_semver(self):
        self.assertEqual(release.next_version(["1.9.9", "1.10.2", "v9.0.0"], "patch"), "1.10.3")
        self.assertEqual(release.next_version(["1.10.2"], "minor"), "1.11.0")
        self.assertEqual(release.next_version(["1.10.2"], "major"), "2.0.0")
        self.assertEqual(release.next_version([], "patch"), "0.0.1")
        with self.assertRaises(ValueError):
            release.next_version([], "invalid")

    def test_missing_required_gate_fails_closed(self):
        with patch.object(release, "api", return_value='{"workflow_runs": []}'):
            with self.assertRaisesRegex(RuntimeError, "Missing validation"):
                release.check_runs("owner/repo", "sha")

    def test_non_main_is_rejected(self):
        with patch.dict(release.os.environ, {"GITHUB_REF": "refs/heads/feature"}):
            with self.assertRaisesRegex(RuntimeError, "restricted to main"):
                release.require_main("owner/repo", "sha")

    def test_stale_sha_is_rejected(self):
        with patch.dict(release.os.environ, {"GITHUB_REF": "refs/heads/main"}):
            with patch.object(release, "api", return_value="new-sha"):
                with self.assertRaisesRegex(RuntimeError, "main advanced"):
                    release.require_main("owner/repo", "old-sha")

    def test_plan_requires_one_recovery_mode(self):
        base = {
            "GITHUB_REF": "refs/heads/main",
            "TERRAFORM_CONFIRMATION": "APPLY",
            "ALLOW_FIRST_BACKEND_DEPLOY": "false",
            "BACKEND_ROLLBACK_RUN_ID": "",
        }
        with patch.dict(release.os.environ, base, clear=True), patch.object(release, "require_main"):
            with self.assertRaisesRegex(RuntimeError, "exactly one"):
                release.plan("owner/repo", "a" * 40)

    def test_plan_rejects_non_release_rollback_run(self):
        environment = {
            "GITHUB_REF": "refs/heads/main",
            "TERRAFORM_CONFIRMATION": "APPLY",
            "ALLOW_FIRST_BACKEND_DEPLOY": "false",
            "BACKEND_ROLLBACK_RUN_ID": "42",
        }
        invalid = json.dumps({
            "conclusion": "failure", "event": "workflow_dispatch",
            "head_branch": "main", "path": ".github/workflows/deploy-pages.yml",
        })
        with patch.dict(release.os.environ, environment, clear=True), patch.object(
            release, "require_main"
        ), patch.object(release, "api", return_value=invalid):
            with self.assertRaisesRegex(RuntimeError, "successful main release"):
                release.plan("owner/repo", "a" * 40)

    def test_foundation_does_not_allocate_release_tag(self):
        environment = {
            "TERRAFORM_CONFIRMATION": "APPLY",
            "BOOTSTRAP_FOUNDATION_ONLY": "true",
            "ALLOW_FIRST_BACKEND_DEPLOY": "false",
            "BACKEND_ROLLBACK_RUN_ID": "",
            "ALLOW_DESTRUCTIVE": "false",
            "GITHUB_OUTPUT": "unused",
        }
        from unittest.mock import mock_open
        output = mock_open()
        with patch.dict(release.os.environ, environment, clear=True), patch.object(
            release, "require_main"
        ), patch.object(release, "check_runs"), patch.object(
            release, "api"
        ) as api, patch.object(release.Path, "open", output):
            release.plan("owner/repo", "a" * 40)
            api.assert_not_called()
            output().write.assert_called_once_with("sha=" + "a" * 40 + "\n")

    def test_foundation_rejects_destructive_or_deploy_inputs(self):
        base = {
            "TERRAFORM_CONFIRMATION": "APPLY",
            "BOOTSTRAP_FOUNDATION_ONLY": "true",
            "ALLOW_FIRST_BACKEND_DEPLOY": "false",
            "BACKEND_ROLLBACK_RUN_ID": "",
            "ALLOW_DESTRUCTIVE": "false",
        }
        for override in ({"ALLOW_DESTRUCTIVE": "true"}, {"ALLOW_FIRST_BACKEND_DEPLOY": "true"}, {"BACKEND_ROLLBACK_RUN_ID": "42"}):
            with self.subTest(override=override), patch.dict(
                release.os.environ, {**base, **override}, clear=True
            ), patch.object(release, "require_main"):
                with self.assertRaisesRegex(RuntimeError, "Foundation bootstrap cannot"):
                    release.plan("owner/repo", "a" * 40)

    def test_tag_is_idempotent_and_never_retargeted(self):
        environment = {"RELEASE_TAG": "1.2.3"}
        with patch.dict(release.os.environ, environment), patch.object(
            release, "command", side_effect=["1.2.3", "a" * 40]
        ), patch.object(release, "api") as api:
            release.create_tag("owner/repo", "a" * 40)
            api.assert_not_called()
        with patch.dict(release.os.environ, environment), patch.object(
            release, "command", side_effect=["1.2.3", "b" * 40]
        ):
            with self.assertRaisesRegex(RuntimeError, "different commit"):
                release.create_tag("owner/repo", "a" * 40)

    def test_release_resume_does_not_duplicate_existing_release(self):
        with patch.dict(release.os.environ, {"RELEASE_TAG": "1.2.3"}), patch.object(
            release, "command", return_value="a" * 40
        ), patch.object(release, "api", return_value="1.2.3"), patch("builtins.print") as output:
            release.publish_release("owner/repo", "a" * 40)
            output.assert_called_once_with("Release 1.2.3 already exists")


if __name__ == "__main__":
    unittest.main()
