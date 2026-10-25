# Deployment

Yeet runs on orch at `95.216.118.49`. Its S3 settings are already stored as
orch secrets; they do not belong in GitHub. There are no local data volumes.

`.github/workflows/orch-image.yml` uses orch's GitHub Action to build the existing
server Dockerfile for AMD64, push to `ghcr.io/torstendittmann/yeet`, and deploy
the exact built digest. No local Docker, custom deployment script or stored
production SSH key is needed. CI does not publish a moving `latest` tag: the
manifest's readable tag is replaced by the built digest during deployment.

## Enable CI

These repository Actions variables are configured:

| Variable | Current value |
| --- | --- |
| `ORCH_CLUSTER` | Controller URL with its CA fingerprint |
| `ORCH_VERSION` | `v0.1.12`; update to the wildcard-routing release |
| `ORCH_DEPLOY_ENABLED` | `false` |

The controller trusts `TorstenDittmann/yeet` to deploy only app `yeet`, from
`main`, using the GitHub `production` environment and short-lived OIDC credentials.

Before enabling:

1. Replace the migration catch-all with explicit `yeet.page` / `*.yeet.page`
   routes and install the supporting orch release on the cluster.
2. Update `ORCH_VERSION` to that exact release.
3. Make the GHCR package public or give orch a read-only `read:packages` credential:

   ```sh
   printf '%s' "$GHCR_READ_TOKEN" | orch registry login ghcr.io \
     --username "$GHCR_READ_USER" --password-stdin --target torsten-cloud
   ```

4. Set `ORCH_DEPLOY_ENABLED=true` and run **Deploy** on `main`.

While disabled, the entire build/push/deploy job is skipped. Once enabled, pushes
to `main` build and deploy; the action waits for health checks. Set the variable
back to `false` to pause. The workflow does not change DNS or Bunny settings.

Bunny acceleration currently connects to the origin over HTTP and must preserve
the original Host header. Visitor-facing HTTPS stays enabled. Domain routing is
being handled separately; direct-IP requests must not serve Yeet.
