# OpenCoach Dockerfile
# Using Bun for faster builds

# ===== Build Stage =====
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 (native addon)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json bun.lock* ./

# Install all dependencies (including dev)
RUN bun install

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Prune dev dependencies for smaller production image
RUN rm -rf node_modules && bun install --production

# ===== Production Stage =====
FROM oven/bun:1-alpine AS production

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package.json for reference
COPY package.json ./

# Copy node_modules from builder (already pruned to production)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/build ./build
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts

# Create data directory for SQLite
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data
ENV DATABASE_PATH=/app/data/opencoach.db
ENV ENABLE_CRON=true

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Run migrations then start server
CMD ["sh", "-c", "bun scripts/migrate.ts && bun build/index.js"]
