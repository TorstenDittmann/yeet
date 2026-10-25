# orch deployment

Application infrastructure belongs in this repository; shared server
installation remains in `TorstenDittmann/torsten.cloud`.

## Deployment and migration

- Source: `157.180.79.15`, Dokploy service `yeetpage-web-w6i5sl`, port 3000.
- Destination: orch v0.1.12 on `95.216.118.49`, worker `storage-01`.
- Source checkout: `f265823e4260ce005b0e79b5b6ffd9e4469330aa`.
- The source image is ARM64; the destination is AMD64. The
  `Build orch image` CI workflow builds the existing server Dockerfile for AMD64
  on relevant pushes to main (or manual dispatch), records the source commit,
  and exports an image archive with checksums. No local Docker is required. It does not
  deploy or receive application secrets. The base tag remains the existing
  Dockerfile's `oven/bun:1`, so this is a rebuild, not a byte-identical image.
- The service has no local persistent mounts. Published sites remain in the
  existing S3 bucket at RustFS; no object copy is required for this move.
- S3 credentials must be transferred directly into orch secrets, never Git,
  workflow inputs, build arguments or artifacts.
- BunnyCDN serves public HTTPS. Dynamic `*.yeet.page` hosting requires forwarding
  the original Host header to the origin. Orch v0.1.12 disallows wildcard domain
  declarations, but its single public plaintext catch-all can serve Bunny's
  origin requests without an additional proxy container.

## Pinned image

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

This origin is plaintext HTTP, as required by orch's public catch-all. BunnyCDN
terminates public HTTPS. It is not end-to-end TLS to the origin; do not enable
an HTTPS origin against the IP, since no matching wildcard origin certificate
is configured. The listener is public (not Bunny-IP-restricted).

Keep the source running until the new origin is tested and Bunny's origin
setting has been switched and verified. Do not change unrelated services on
the source server. Record the final immutable image digest and routing settings
here when staging succeeds.
