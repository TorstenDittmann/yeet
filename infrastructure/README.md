# orch deployment

Application infrastructure belongs in this repository; shared server
installation remains in `TorstenDittmann/torsten.cloud`.

## Migration in progress

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

Keep the source running until the new origin is tested and Bunny's origin
setting has been switched and verified. Do not change unrelated services on
the source server. Record the final immutable image digest and routing settings
here when staging succeeds.
