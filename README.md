# yeet

A fast static site hosting platform with subdomain-based routing.

## Project Structure

This project uses a workspace structure with the following packages:

- **`packages/server`** - The main hosting server that serves static files from subdomains
- **`packages/cli`** - Command-line interface for managing deployments

## Installation

Install dependencies for all workspaces:

```bash
bun install
```

## Development

### Server

To run the server in development mode:

```bash
cd packages/server
bun run dev
```

The server will start and listen for requests. Static files are served based on subdomain routing from the `data/` directory.

### CLI

To run the CLI in development mode:

```bash
cd packages/cli
bun run dev [command]
```

## Building

### Server

```bash
cd packages/server
bun run build
```

### CLI

```bash
cd packages/cli
bun run build
```

## How it works

1. **Server**: Serves static files from the `data/` directory based on subdomain routing
   - `example.localhost` serves files from `data/example/`
   - Supports index.html fallback and SPA routing with 200.html

2. **CLI**: Manages deployments to the data directory
   - Deploy sites to subdomains
   - List, remove, and get info about deployed sites

## Data Directory

Static files are stored in the `data/` directory at the project root:

```
data/
├── example.com/
│   ├── index.html
│   └── assets/
└── another-site/
    ├── index.html
    └── 200.html
```

This project was created using `bun init` and uses [Bun](https://bun.sh) as the JavaScript runtime.