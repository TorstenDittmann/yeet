# Yeet CLI

Publish static sites instantly with a single command! ⚡

## Installation

```bash
# Install dependencies
bun install

# Build the CLI (creates bundled JS file)
bun run build
```

## Usage

### Basic Usage

```bash
# Publish current directory
yeet

# Publish a specific directory
yeet ./my-website

# Publish with custom server
yeet ./my-website --server https://my-yeet-server.com
```

### Configuration

Create a `.env` file in the CLI directory to configure the default server:

```bash
# .env
YEET_SERVER_URL=http://localhost:3000

# Alternative variable name (YEET_SERVER_URL takes precedence)
SERVER_URL=http://localhost:3000
```

Copy `.env.example` to get started:

```bash
cp .env.example .env
```

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

- 🚀 **Instant deployment** - Upload and deploy in seconds
- 📦 **Smart file detection** - Automatically excludes common build artifacts
- 🎨 **Beautiful animations** - Satisfying terminal experience with progress indicators
- 🌐 **Random domains** - Get a unique subdomain for each deployment
- ⚡ **Zero configuration** - Works out of the box
- 🔧 **Flexible setup** - Configure via .env file or command line options

## File Filtering

The CLI automatically excludes common files and directories that shouldn't be deployed:

**Excluded directories:**
- `.git`
- `node_modules`
- `.next`
- `dist` (when not the target)
- `build` (when not the target)
- `.vercel`
- `.netlify`
- `.DS_Store`

**Excluded files:**
- `.DS_Store`
- `.gitignore`
- `.env*` files
- `Thumbs.db`

## Development

```bash
# Run in development mode
bun run dev

# Run with arguments
bun run dev ./test-site

# Type check
bun run type-check

# Build for production (creates dist/index.js)
bun run build

# Run the built version with Node.js
node dist/index.js
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `YEET_SERVER_URL` | Primary server URL for publishing | `http://localhost:3000` |
| `SERVER_URL` | Alternative server URL (lower priority) | `http://localhost:3000` |

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

This CLI works with the Yeet server package. Make sure you have a Yeet server running that accepts POST requests to `/publish` with `multipart/form-data` containing files.

The server should respond with:
```json
{
  "success": true,
  "domain": "generated-domain",
  "url": "https://generated-domain.yourdomain.com",
  "total_files": 5,
  "message": "Site successfully deployed"
}
```

## Troubleshooting

### Server Connection Issues

If you see connection errors:

1. Make sure the Yeet server is running
2. Check your `.env` file for the correct server URL
3. Verify the server is accessible from your network

```bash
# Test server connectivity
curl http://localhost:3000
```

### File Upload Issues

If files aren't uploading correctly:

1. Check file permissions in your source directory
2. Ensure you have enough disk space
3. Verify the files aren't being filtered out (see File Filtering section)

### Environment Variables Not Loading

Make sure your `.env` file is in the CLI package directory (`packages/cli/.env`) and follows the correct format:

```bash
# Correct
YEET_SERVER_URL=http://localhost:3000

# Incorrect (spaces around =)
YEET_SERVER_URL = http://localhost:3000
```

## License

MIT