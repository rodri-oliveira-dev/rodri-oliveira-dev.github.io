#!/usr/bin/env bash
# Validate the data plane without accessing the Terraform state blob.
set -euo pipefail

account=strotfstatepushdev
container=tfstate
blob="_validation/blob-lease-$(cat /proc/sys/kernel/random/uuid)"
lease_id="$(cat /proc/sys/kernel/random/uuid)"
payload="$(mktemp)"
created=false
leased=false

common=(--account-name "$account" --container-name "$container" --auth-mode login --only-show-errors)

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$leased" == true ]]; then
    az storage blob lease release "${common[@]}" --blob-name "$blob" --lease-id "$lease_id" --output none || status=1
  fi
  if [[ "$created" == true ]]; then
    if ! az storage blob delete "${common[@]}" --name "$blob" --output none; then
      printf 'Cleanup failed for disposable blob: %s\n' "$blob" >&2
      status=1
    fi
  fi
  rm -f "$payload"
  exit "$status"
}
trap cleanup EXIT

printf 'Terraform backend validation probe\n' > "$payload"
az storage blob upload "${common[@]}" --name "$blob" --file "$payload" --overwrite false --if-none-match '*' --output none
created=true

az storage blob lease acquire "${common[@]}" --blob-name "$blob" --lease-duration 60 --proposed-lease-id "$lease_id" --output none
leased=true
test "$(az storage blob show "${common[@]}" --name "$blob" --query properties.lease.status --output tsv)" = locked

az storage blob lease release "${common[@]}" --blob-name "$blob" --lease-id "$lease_id" --output none
leased=false
test "$(az storage blob show "${common[@]}" --name "$blob" --query properties.lease.status --output tsv)" = unlocked

az storage blob delete "${common[@]}" --name "$blob" --output none
created=false
printf 'Blob data plane: create, acquire lease, release lease and delete succeeded.\n'
