# Multi-stage build for optimized production image
FROM oven/bun:1 AS base

# Install security updates
RUN apk update && apk upgrade && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# ================================
# Dependencies stage
# ================================
FROM base AS deps

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies with optimizations
RUN bun install --frozen-lockfile --production && \
    bun pm cache rm

# ================================
# Build stage
# ================================
FROM base AS builder

# Copy package files and install all dependencies (including dev)
COPY package.json bun.lock* tsconfig.json ./
RUN bun install --frozen-lockfile

# Copy source code
COPY index.ts ./

# Build the application
RUN bun run build && \
    bun pm cache rm

# ================================
# Production stage
# ================================
FROM base AS runner

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Copy static files
COPY index.html ./

# Expose port
EXPOSE $PORT

# Start the application
CMD ["bun", "run", "start"]