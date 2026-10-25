#!/usr/bin/env bash
# GitHub-hosted Linux AMD64 runner only. No stored orch administrator credential.
set -euo pipefail

: "${ORCH_CLUSTER:?Set ORCH_CLUSTER to the controller URL with its CA fingerprint}"
: "${ORCH_VERSION:?Pin ORCH_VERSION to the release supporting the production manifest}"
: "${DEPLOY_IMAGE:?The build job must supply a GHCR image digest}"
: "${RUNNER_TEMP:?This script is intended for GitHub Actions}"
: "${GITHUB_SHA:?Missing source commit}"
: "${GITHUB_RUN_ID:?Missing run identity}"

[[ "$ORCH_VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid release pin' >&2; exit 1; }
[[ "$DEPLOY_IMAGE" =~ ^ghcr\.io/torstendittmann/yeet@sha256:[0-9a-f]{64}$ ]] || { echo 'Expected the built Yeet image digest' >&2; exit 1; }
[[ "$ORCH_CLUSTER" =~ ^https://[^/#]+#sha256:[0-9a-f]{64}$ ]] || { echo 'Expected a CA-pinned HTTPS controller address' >&2; exit 1; }
[[ "${GITHUB_REF:-}" == refs/heads/main ]] || { echo 'Production deploys require main' >&2; exit 1; }
[[ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" && -n "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ]] || { echo 'GitHub OIDC permission is required' >&2; exit 1; }

# Do not deploy an old queued run over newer main-branch changes.
current="$(git ls-remote origin refs/heads/main | cut -f1)"
[[ "$current" == "$GITHUB_SHA" ]] || { echo 'Refusing a stale main-branch deployment' >&2; exit 1; }

# Never reintroduce the migration catch-all through an automated deployment.
# This temporary fail-closed guard can be removed once the domain-only manifest
# has landed; until then the job is safe even if its variable is enabled early.
if grep -Eq 'public[[:space:]]*=[[:space:]]*true' infrastructure/orch.pkl; then
  echo 'Replace the catch-all with domain-scoped routes before enabling CI deployment' >&2
  exit 1
fi

bin="$(mktemp -d "$RUNNER_TEMP/orch-deploy.XXXXXX")"
trap 'rm -rf -- "$bin"' EXIT
release="https://github.com/TorstenDittmann/orch/releases/download/$ORCH_VERSION"
curl -fsSL --retry 3 "$release/orch-linux-amd64" -o "$bin/orch-linux-amd64"
curl -fsSL --retry 3 "$release/SHA256SUMS" -o "$bin/SHA256SUMS"
awk '$2 == "orch-linux-amd64" { print }' "$bin/SHA256SUMS" > "$bin/selected-checksum"
[[ "$(wc -l < "$bin/selected-checksum")" -eq 1 ]] || { echo 'Release checksum is missing or ambiguous' >&2; exit 1; }
(cd "$bin" && sha256sum --check selected-checksum)
chmod 0755 "$bin/orch-linux-amd64"
command -v pkl >/dev/null

"$bin/orch-linux-amd64" validate -f infrastructure/orch.pkl
"$bin/orch-linux-amd64" deploy -f infrastructure/orch.pkl \
  --image "web=$DEPLOY_IMAGE" --wait --timeout 8m \
  --idempotency-key "github-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT:-1}"
