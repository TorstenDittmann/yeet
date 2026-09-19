# Yeet CLI

Publish static sites instantly with a single command.

## Installation

```bash
npm install -g @dittmann/yeet
```

Or from this repo:

```bash
bun install
bun run build
```

## Usage

```bash
# Publish current directory
yeet

# Publish a specific directory
yeet ./my-website

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
- Smart file detection — excludes common build artifacts and secrets
- Terminal progress — spinner + YEET ASCII art
- Random domains — unique subdomain per deployment
- Zero configuration — works out of the box against yeet.page
- Flexible setup — configure via `.env`, env vars, or `--server`

## File Filtering

The CLI automatically excludes common files and directories that shouldn't be deployed:

**Excluded directories:**
- `.git`
- `node_modules`
- `.next`
- `dist` (when nested inside the publish root — `yeet ./dist` still works)
- `build` (when nested inside the publish root — `yeet ./build` still works)
- `.vercel`
- `.netlify`
- `.DS_Store`

**Excluded files:** `.DS_Store`, `.gitignore`, `.env*`, `Thumbs.db`

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
3. Verify files aren't filtered out (see File Filtering)

### Environment Variables Not Loading

Put `.env` in the directory you run `yeet` from (usually your project root):

```bash
YEET_SERVER_URL=http://localhost:3000
```

No spaces around `=`.

## License

MIT
