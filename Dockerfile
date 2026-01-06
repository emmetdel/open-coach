# OpenCoach Dockerfile
# Using Bun with built-in SQLite (no native modules)

FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install

# Build app
COPY . .
RUN bun run build

# Prune dev dependencies
RUN rm -rf node_modules && bun install --frozen-lockfile --production

# ===== Production =====
FROM oven/bun:1-alpine

WORKDIR /app

# Copy only what's needed
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./

# Create data directory
RUN mkdir -p /app/data

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data \
    DATABASE_PATH=/app/data/opencoach.db \
    ENABLE_CRON=true

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["sh", "-c", "bun scripts/migrate.ts && bun build/index.js"]
