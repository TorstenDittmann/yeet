# orch deployment

Application infrastructure belongs in this repository; shared server
installation remains in `TorstenDittmann/torsten.cloud`.

## Deployment and migration

- Source: `157.180.79.15`, Dokploy service `yeetpage-web-w6i5sl`, port 3000.
- Destination: orch v0.1.12 on `95.216.118.49`, worker `storage-01`.
- Source checkout: `f265823e4260ce005b0e79b5b6ffd9e4469330aa`.
- The source image is ARM64; the destination is AMD64. The
  `Build and deploy orch image` CI workflow builds the existing server Dockerfile for AMD64
  on relevant pushes to main (or manual dispatch), records the source commit,
  and publishes `ghcr.io/torstendittmann/yeet:<commit>`. No local Docker is required.
  Deployment is separately gated; CI never receives the application's S3 secrets.
  The base tag remains the existing
  Dockerfile's `oven/bun:1`, so this is a rebuild, not a byte-identical image.
- The service has no local persistent mounts. Published sites remain in the
  existing S3 bucket at RustFS; no object copy is required for this move.
- S3 credentials must be transferred directly into orch secrets, never Git,
  workflow inputs, build arguments or artifacts.
- BunnyCDN serves public HTTPS. Dynamic `*.yeet.page` hosting requires forwarding
  the original Host header to the origin. Orch v0.1.12 disallows wildcard domain
  declarations. The temporary migration catch-all must be replaced by explicit
  `yeet.page` / `*.yeet.page` routes as part of the separate wildcard-routing
  work. CI refuses to deploy while `public = true` remains in the manifest.

## CI and GHCR

The build job uses GitHub's short-lived `GITHUB_TOKEN` to publish Linux AMD64
images with commit tags to **`ghcr.io/torstendittmann/yeet`**. Production deploys
use the build job's immutable **digest**, never a moving tag or a separate build.
No Docker engine is needed on a workstation or the production server.

Deployment is **disabled by default**. Builds still publish while routing is
being prepared. Once enabled, relevant pushes to `main` deploy; manual runs also
require the `deploy` input to be checked. The production job is serialized,
rejects stale commits and waits for orch health gates. Failure or rollback fails
the workflow. Pull requests never receive deployment credentials.

### One-time setup before enabling deployments

1. Finish domain-scoped wildcard routing and update `infrastructure/orch.pkl`.
   The deployment script fails closed if the catch-all remains.
2. Give orch read access to the GHCR package. GitHub often creates new packages
   as private. Either deliberately make this package public or configure a
   read-only `read:packages` credential once using an administrator:

   ```sh
   printf '%s' "$GHCR_READ_TOKEN" | orch registry login ghcr.io \
     --username "$GHCR_READ_USER" --password-stdin --target torsten-cloud
   ```

   Do not use an expiring Actions `GITHUB_TOKEN` as the cluster's persistent
   pull credential. The CI build token is only for pushing this repo's image.
3. On the cluster, trust **only this app, branch and GitHub environment**:

   ```sh
   orch github trust TorstenDittmann/yeet --app yeet --branch main \
     --environment production --target torsten-cloud
   ```

   Record the printed `https://HOST:9443#sha256:...` cluster address in repository
   Actions variable **`ORCH_CLUSTER`**. This pins the controller CA; it is not a
   secret. GitHub-hosted runners must be able to reach controller port 9443.
   No administrator SSH key, orch admin context or long-lived deployment token
   belongs in GitHub.
4. Create/configure the **`production`** GitHub environment: limit deployment to
   `main` and add required reviewers if approval is wanted. Orch's trust must
   match that environment. CI requests GitHub OIDC credentials scoped to `yeet`.
5. Set repository Actions variable **`ORCH_VERSION`** to the exact release
   supporting the final manifest (for example `vX.Y.Z`, not `latest`). The script
   downloads that official AMD64 CLI and verifies its release checksum.
   Controller and workers must already support the manifest; CI does not
   upgrade infrastructure. Pkl is pinned to `0.32.1` for the current schema.
6. Only after routing, GHCR pulls and OIDC connectivity are checked, set
   **`ORCH_DEPLOY_ENABLED=true`**. Run the workflow manually on `main` with
   **deploy** selected for the first controlled rollout. Afterwards relevant
   main-branch pushes also deploy. Set the variable back to `false` to pause.

Repository trust, GitHub environment/variables and GHCR visibility/read access
are intentionally not activated by committing these files. The migration's
stored-image manifest can remain digest-pinned: CI overrides only `web` with
`--image web=ghcr.io/torstendittmann/yeet@sha256:...`.

## Historical migration image

CI run [40233187359](https://github.com/TorstenDittmann/yeet/actions/runs/40233187359)
built commit `b3238a76361f6f8f7e1605baaa3bfc98c3094c08` (application code unchanged
from the source checkout). The artifact was checksum-verified before upload:

- Docker archive SHA-256: `a96e3e7a1f8c0bff492de0ee8b79bfd14e6dc93d2e98d7daaaa1aa37ad165d86`
- Image config ID: `sha256:5f5cb41f85396c478bee62f6154a3f31022a8f4b6bcde50f13e1a467ac4a8a59`
- Orch image manifest: `sha256:3140615f936d25301c8e68010b334b29bc808d2c4d859a82a4510b46f73290b0`

The image is stored in orch's controller image store, not published on Docker
Hub. The `docker.io/library/yeet-orch` name in `orch.pkl` is a logical image name;
workers obtain its digest from the controller mirror. A fresh cluster requires
re-importing the CI artifact (or rebuilding it); Git alone does not contain the
image. GitHub's artifact retention is seven days, not a long-term image backup.

## Manual deployment

Use orch v0.1.12 or newer and explicitly select the production target:

```sh
orch validate -f infrastructure/orch.pkl
orch deploy -f infrastructure/orch.pkl --target torsten-cloud --wait
orch app status yeet --target torsten-cloud
```

The six `secretEnv` settings must already exist in orch for application `yeet`.
They were transferred directly from the source into encrypted orch secrets,
without printing values or writing them to local files. Deployments and image
builds do not automatically change BunnyCDN or stop the source service.

## BunnyCDN cutover

The user will update BunnyCDN after the staged origin passes checks:

1. Change the pull zone's origin to `http://95.216.118.49` (port 80).
2. Preserve the original request Host header, including dynamic `*.yeet.page`
   names. Do not force it to the IP, a pull-zone hostname or only `yeet.page`.
3. Keep existing edge HTTPS, wildcard hostnames and other caching settings.
4. Check apex and an existing published subdomain through BunnyCDN. Until
   verified, revert the origin to its previous setting if needed.

The temporary migration origin is plaintext HTTP; BunnyCDN terminates public
HTTPS. It is not end-to-end TLS to the origin. Do not enable an HTTPS origin
against the IP without the correct certificate/routing configuration. The
separate domain-routing work must remove the catch-all: the raw IP and unrelated
hostnames should not serve Yeet. Host routing is not a Bunny-only access-control
boundary; a caller can still send an allowed Host header directly.

Keep the source running until the new origin is tested and Bunny's origin
setting has been switched and verified. Do not change unrelated services on
the source server. Record the final immutable image digest and routing settings
here when staging succeeds.
