#!/usr/bin/env bash
# Executed only inside infra/terraform/diagnostics by the protected reusable jobs.
set -euo pipefail
umask 077
mode="${1:-}"
case "$mode" in plan|apply) ;; *) exit 1 ;; esac
scratch="$(mktemp -d "$RUNNER_TEMP/terraform-diagnostics.XXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT
scripts=../../../.github/scripts
report_failure() {
  local status="$1" log="$2"
  if ! python3 "$scripts/terraform-plan-diagnostics.py" "$log" --exit-code "$status" --summary "$GITHUB_STEP_SUMMARY" 2>/dev/null; then
    echo 'Safe diagnostic extraction failed; raw output withheld.' >&2
  fi
  exit "$status"
}
recheck_main() {
  test "$(git rev-parse HEAD)" = "$DIAGNOSTICS_SHA"
  test "$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq .object.sha)" = "$DIAGNOSTICS_SHA"
}
recheck_main
if ! terraform init -backend-config=backend.hcl.example -input=false -lockfile=readonly -no-color >"$scratch/init.log" 2>&1; then
  echo 'Diagnostics backend initialization failed; raw output withheld.' >&2
  exit 1
fi
status=0
terraform plan -json -detailed-exitcode -input=false -lock-timeout=5m -no-color -out="$scratch/plan.tfplan" >"$scratch/plan.log" 2>&1 || status=$?
if [ "$status" -ne 0 ] && [ "$status" -ne 2 ]; then
  report_failure "$status" "$scratch/plan.log"
fi
if ! terraform show -json "$scratch/plan.tfplan" >"$scratch/plan.json" 2>"$scratch/show.log"; then
  echo 'Diagnostic plan JSON failed; raw output withheld.' >&2
  exit 1
fi
manifest_args=(--scope diagnostics)
if [ "$TF_VAR_include_function" = true ]; then manifest_args+=(--include-function); fi
if [ "$mode" = plan ]; then
  python3 "$scripts/terraform-release-plan.py" "$scratch/plan.json" "${manifest_args[@]}"
  exit 0
fi
GITHUB_OUTPUT="$scratch/manifest" python3 "$scripts/terraform-release-plan.py" "$scratch/plan.json" "${manifest_args[@]}"
test -n "${APPROVED_FINGERPRINT:-}"
test "$(sed -n 's/^fingerprint=//p' "$scratch/manifest")" = "$APPROVED_FINGERPRINT" || { echo 'Diagnostic plan changed after approval.' >&2; exit 1; }
recheck_main
if [ "$(sed -n 's/^has_changes=//p' "$scratch/manifest")" = false ]; then
  echo 'No diagnostic changes; no Apply executed.' >>"$GITHUB_STEP_SUMMARY"
  exit 0
fi
status=0
terraform apply -json -auto-approve -input=false -lock-timeout=5m -no-color "$scratch/plan.tfplan" >"$scratch/apply.log" 2>&1 || status=$?
if [ "$status" -ne 0 ]; then
  report_failure "$status" "$scratch/apply.log"
fi
echo 'Applied the revalidated diagnostic plan; no plan, State or raw log retained.' >>"$GITHUB_STEP_SUMMARY"
