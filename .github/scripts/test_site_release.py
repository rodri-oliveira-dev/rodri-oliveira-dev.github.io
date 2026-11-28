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



site_only_spec = importlib.util.spec_from_file_location(
    "site_only_release", Path(__file__).with_name("site-only-release.py")
)
site_only = importlib.util.module_from_spec(site_only_spec)
site_only_spec.loader.exec_module(site_only)


class SiteOnlyReleaseTests(unittest.TestCase):
    def full_evidence(self):
        run = {
            "id": 42, "status": "completed", "conclusion": "success",
            "event": "workflow_dispatch", "head_branch": "main",
            "path": site_only.FULL_WORKFLOW, "head_sha": "a" * 40,
        }
        jobs = [{"name": name, "conclusion": "success"} for name in sorted(site_only.FULL_JOBS)]
        backend = next(job for job in jobs if job["name"] == "Deploy and verify notifications backend")
        backend["steps"] = [{"name": name, "conclusion": "success"}
                            for name in ("Deploy immutable package", "Smoke test")]
        return run, {"total_count": len(jobs), "jobs": jobs}

    def test_path_allowlist_blocks_unknown_and_backend_changes(self):
        for path in ("index.html", "assets/contact/contact.vcf", ".well-known/ai-catalog.json",
                     ".github/scripts/generate-vcards.cjs", ".github/workflows/deploy-site.yml",
                     "docs/adr/0012.md"):
            self.assertTrue(site_only.allowed_path(path), path)
        for path in ("backend/notifications-functions/Program.cs", "infra/terraform/main.tf",
                     ".github/workflows/deploy-pages.yml", ".github/scripts/function-release.py",
                     ".github/scripts/verify-runtime-iam.py", "global.json",
                     "assets/js/web-push-platform.mjs", "sw.js"):
            self.assertFalse(site_only.allowed_path(path), path)

    def test_successful_full_release_requires_backend_and_smoke_evidence(self):
        run, jobs = self.full_evidence()
        with patch.object(site_only, "read_json", side_effect=[{"workflow_runs": [run]}, jobs]):
            self.assertEqual(site_only.latest_full_release("owner/repo"), run)
        jobs["jobs"] = [job for job in jobs["jobs"] if job["name"] != "Package notifications backend"]
        jobs["total_count"] = len(jobs["jobs"])
        with patch.object(site_only, "read_json", side_effect=[{"workflow_runs": [run]}, jobs]):
            with self.assertRaisesRegex(RuntimeError, "missing successful job"):
                site_only.latest_full_release("owner/repo")

    def test_latest_failed_release_does_not_fall_back(self):
        run, _ = self.full_evidence()
        newer = {**run, "id": 43, "conclusion": "failure"}
        with patch.object(site_only, "read_json", return_value={"workflow_runs": [run, newer]}):
            with self.assertRaisesRegex(RuntimeError, "Latest full release"):
                site_only.latest_full_release("owner/repo")

    def test_failed_backend_smoke_is_rejected(self):
        run, jobs = self.full_evidence()
        backend = next(job for job in jobs["jobs"] if job["name"] == "Deploy and verify notifications backend")
        backend["steps"][1]["conclusion"] = "failure"
        with patch.object(site_only, "read_json", side_effect=[{"workflow_runs": [run]}, jobs]):
            with self.assertRaisesRegex(RuntimeError, "missing successful backend step"):
                site_only.latest_full_release("owner/repo")

    def test_guard_rejects_changed_protected_paths(self):
        run, _ = self.full_evidence()
        with patch.object(site_only.release, "command", return_value="b" * 40), patch.object(
            site_only.release, "require_main"
        ), patch.object(site_only.release, "api", return_value="workflow"), patch.object(
            site_only, "latest_full_release", return_value=run
        ), patch.object(site_only, "changed_paths", return_value=["infra/terraform/main.tf"]):
            with self.assertRaisesRegex(RuntimeError, "Full release required"):
                site_only.guard("owner/repo", "b" * 40)

    def test_retry_rechecks_baseline(self):
        with patch.object(site_only, "guard", return_value={"id": 43}), patch.dict(
            site_only.os.environ, {"BASELINE_RUN_ID": "42"}
        ):
            with self.assertRaisesRegex(RuntimeError, "baseline changed"):
                site_only.recheck("owner/repo", "b" * 40)

    def test_metadata_rejects_superseded_pages_revision(self):
        with patch.dict(site_only.os.environ, {"GITHUB_REF": "refs/heads/main"}), patch.object(
            site_only.release, "command", return_value="a" * 40
        ), patch.object(site_only.publication, "latest_successful_pages_deployment",
                        return_value=({"sha": "b" * 40}, {})):
            with self.assertRaisesRegex(RuntimeError, "superseded"):
                site_only.verify_publication("owner/repo", "a" * 40)

    def test_site_workflow_is_manual_serialized_and_has_no_azure_jobs(self):
        workflow = (WORKFLOWS / "deploy-site.yml").read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", workflow)
        self.assertNotIn("pull_request:", workflow)
        self.assertNotIn("\n  push:", workflow)
        self.assertIn("format('production-release-{0}', github.repository)", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertNotIn("azure/login", workflow)
        self.assertNotIn("environment: terraform-dev", workflow)
        self.assertNotIn("environment: functions-dev", workflow)
        self.assertNotIn("terraform apply", workflow)
        self.assertEqual(workflow.count("id-token: write"), 1)
        self.assertIn("site-only-release.py recheck", workflow)
        self.assertIn("needs: [preflight, pages_smoke]", workflow)
        self.assertIn("--mode dry-run", workflow)
        self.assertNotIn("ENQUEUE", workflow)


if __name__ == "__main__":
    unittest.main()
