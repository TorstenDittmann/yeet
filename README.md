# yeet

A fast static site hosting platform with subdomain-based routing.

Live product: [yeet.page](https://yeet.page) · CLI: [`@dittmann/yeet`](https://www.npmjs.com/package/@dittmann/yeet)

## Project Structure

This project uses a monorepo with the following packages:

- **`packages/server`** — Hosting server: accepts uploads, stores files in S3, serves sites on `*.{ORIGIN}` subdomains
- **`packages/cli`** — Command-line tool that uploads a folder and prints a preview URL

## Installation

```bash
# From each package directory, or install deps where you work:
cd packages/server && bun install
cd packages/cli && bun install
```

## Development

### Server

```bash
cd packages/server
bun run dev
```

Requires S3 env vars (`S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_ACCESS_KEY_SECRET`, `S3_BUCKET`) and `ORIGIN` (e.g. `yeet.page` or `localhost`).

### CLI

```bash
cd packages/cli
bun run dev [directory]
```

By default the CLI publishes to `https://yeet.page`. Override with `--server` or `YEET_SERVER_URL`.

## Building

```bash
cd packages/server && bun run build
cd packages/cli && bun run build
```

## How it works

1. **CLI** — Scans a directory and uploads every file as `multipart/form-data` to `POST /publish`
2. **Server** — Stores files under a random `{adjective}-{noun}-{hex}/` prefix in S3 and returns `https://{subdomain}.{ORIGIN}`
3. **Serving** — Requests to `{subdomain}.{ORIGIN}` resolve files from S3, with clean `.html` URLs, `index.html` fallback, and optional `200.html` for SPA client routing

Each `yeet` creates a **new** random subdomain. There is no account system or deploy listing yet.

## Deploy limits

- Max **50MB per file**
- No accounts required
