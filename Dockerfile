# Use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# Copy dependency files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Production image
FROM oven/bun:1 AS release
WORKDIR /app

# Copy built artifacts
COPY --from=base /app/build ./build

# Copy necessary files for runtime (migrations, scripts, package.json)
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/scripts ./scripts
COPY --from=base /app/migrations ./migrations
COPY --from=base /app/bun.lock ./bun.lock

# Install only production dependencies
RUN bun install --frozen-lockfile --production

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Define volume for data persistence
VOLUME ["/app/data"]

# Start the application
CMD ["bun", "run", "start"]
