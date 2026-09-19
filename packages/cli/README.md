# Yeet CLI

Publish static sites instantly with a single command.

## Installation

Requires **Node.js 20+** (the published CLI runs on Node).

```bash
npm install -g @dittmann/yeet
```

Or from this repo (needs [Bun](https://bun.sh) to install/build):

```bash
bun install
bun run build
```

## Usage

```bash
# Publish current directory (uploads every file in it)
yeet

# Prefer pointing at your build output, not a full project root
yeet ./out
yeet ./build
yeet ./dist

# Publish with custom server
yeet ./my-website --server https://my-yeet-server.com
```

### Configuration

Set the server URL via environment variables or a `.env` file in the current working directory:

```bash
# .env
YEET_SERVER_URL=http://localhost:3000

# Alternative (YEET_SERVER_URL takes precedence)
SERVER_URL=http://localhost:3000
```

Copy `.env.example` for a starting point:

```bash
cp .env.example .env
```

Default when unset: `https://yeet.page`

### Examples

```bash
# Deploy a React build
yeet ./build

# Deploy a Next.js export
yeet ./out

# Deploy any static files
yeet ./public

# Use a different server
yeet ./dist --server https://yeet.mycompany.com
```

## Features

- Instant deployment — upload and get a preview URL in seconds
- Upload as-is — everything in the target directory is published
- Terminal progress — spinner + YEET ASCII art
- Random domains — unique subdomain per deployment
- Zero configuration — works out of the box against yeet.page
- Flexible setup — configure via `.env`, env vars, or `--server`

## Development

```bash
bun run dev
bun run dev ./test-site
bun run type-check
bun run build
node dist/index.js
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `YEET_SERVER_URL` | Primary server URL for publishing | `https://yeet.page` |
| `SERVER_URL` | Alternative server URL (lower priority) | `https://yeet.page` |

## CLI Options

```
USAGE yeet [OPTIONS] [DIRECTORY]

ARGUMENTS
  DIRECTORY    Directory to publish (defaults to current directory)

OPTIONS
  -s, --server    Server URL to publish to (can be set via YEET_SERVER_URL env var)
  -h, --help      Show help
  -v, --version   Show version
```

## Server Integration

This CLI works with the Yeet server. The server accepts `POST /publish` with `multipart/form-data` field `files`.

Successful response (`201`):

```json
{
  "domain": "fast-dog-16c8.yeet.page",
  "url": "https://fast-dog-16c8.yeet.page",
  "total_files": 5
}
```

Error response (`400` / `500`):

```json
{
  "error": "File example.bin exceeds 50MB limit"
}
```

Per-file upload limit on the server: **50MB**.

## Troubleshooting

### Server Connection Issues

1. Make sure the Yeet server is running (for self-hosted)
2. Check `YEET_SERVER_URL` / `.env` / `--server`
3. Verify the server is reachable

```bash
curl https://yeet.page
```

### File Upload Issues

1. Check file permissions in the source directory
2. Ensure no single file exceeds 50MB
3. Point `yeet` at the folder you actually want published (e.g. `./out`, not the project root)

### Environment Variables Not Loading

Put `.env` in the directory you run `yeet` from (usually your project root):

```bash
YEET_SERVER_URL=http://localhost:3000
```

No spaces around `=`.

## License

MIT
