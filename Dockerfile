# OpenCoach Dockerfile
# Using Bun with built-in SQLite (no native modules needed)

FROM oven/bun:1 AS builder

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install

# Build
COPY . .
RUN bun run build

# ===== Production =====
FROM oven/bun:1-slim

WORKDIR /app

# Copy everything we need
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data
ENV DATABASE_PATH=/app/data/opencoach.db
ENV ENABLE_CRON=true

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["sh", "-c", "bun scripts/migrate.ts && bun build/index.js"]
