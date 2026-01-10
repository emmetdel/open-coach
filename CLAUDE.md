# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCoach is a self-hosted running application that automates the coaching loop: syncing run data from Garmin, analyzing it with AI for empathetic feedback, and helping users stay consistent. The philosophy is "Consistency over intensity. Every run counts."

**Unfair Advantage:** Most running apps optimize for PRs and metrics. OpenCoach optimizes for habit formation and showing up.

**Target Users:** Beginner runners and busy professionals who struggle with consistency.

**Strategic Direction:** See TODO.md for the 3-phase roadmap. Phase 1 focus is improving AI coaching quality (actionable chat, pattern detection, better prompts) and consistency analytics.

## Development Commands

```bash
# Development
npm run dev              # Start dev server (runs on http://localhost:5173)
npm run build            # Build for production (includes git SHA injection)
npm start                # Run production build (requires build first)

# Database
npm run db:migrate       # Run database migrations (creates/updates SQLite schema)

# Type checking
npm run check            # Run svelte-check for type errors
npm run check:watch      # Watch mode for type checking

# Testing
npm run prepare          # Sync SvelteKit types (auto-runs after npm install)
```

## Tech Stack & Runtime

- **Runtime**: Bun (not Node.js) - uses native `bun:sqlite` for database
- **Framework**: SvelteKit with Svelte 5 (uses runes: `$state`, `$derived`, `$effect`)
- **Adapter**: `svelte-adapter-bun` (not Node adapter)
- **Database**: SQLite via `bun:sqlite` (NOT better-sqlite3 or other Node drivers)
- **Styling**: Tailwind CSS v4 with `@tailwindcss/vite` plugin
- **AI**: OpenRouter API (supports Claude, GPT-4, Gemini, Llama, etc.)
- **Garmin**: `garmin-connect` npm package for authentication and API access

## Architecture

### Database Layer (`src/lib/server/sqlite.ts` & `src/lib/server/db.ts`)

- `sqlite.ts`: Low-level Bun SQLite wrapper with connection management
- `db.ts`: High-level database helpers and type definitions
- Database injected into `event.locals.db` via `hooks.server.ts`
- All server routes/endpoints access DB via `locals.db`
- Migrations in `migrations/*.sql` applied via `scripts/migrate.ts`

### Core Services (`src/lib/server/`)

- `garmin.ts`: Garmin Connect OAuth authentication, activity fetching, token refresh
  - Stores OAuth1 and OAuth2 tokens in user_settings table
  - Uses `getGarminClient()` to restore authenticated session from tokens
- `coach.ts`: OpenRouter API integration for AI feedback generation
  - Calls `/chat/completions` with configurable model selection
  - Prompts defined in `src/lib/prompts.ts`
- `notifications.ts`: Web Push API for browser notifications (VAPID keys stored in DB)
- `reminders.ts`: Push notification logic for morning/evening reminders
- `cron.ts`: Scheduled task orchestration using `node-cron`

### Cron Jobs (Started in `hooks.server.ts`)

When server starts, `startCronJobs()` schedules:
- **Every 30 min**: Garmin token refresh (`/api/cron/refresh-tokens`)
- **Every 4 hours**: Garmin activity sync (`/api/cron/sync`)
- **7 AM daily**: Morning reminder (`/api/cron/reminders`)
- **8 PM daily**: Evening reminder (`/api/cron/reminders`)
- **Sunday 8 PM**: Weekly training plan generation (`/api/plan`)

Cron jobs call internal API endpoints with `X-Cron-Secret` header (configurable via `CRON_SECRET` env var).

### Routes Structure

- `src/routes/+page.svelte`: Main dashboard (run history, stats, calendar)
- `src/routes/+page.server.ts`: Loads runs, settings, and stats for dashboard
- `src/routes/setup/`: First-time setup wizard (Garmin + OpenRouter credentials)
- `src/routes/settings/`: User settings page (credentials, model selection, notifications)
- `src/routes/plan/`: Training plan view and generation
- `src/routes/runs/`: Individual run detail pages
- `src/routes/analytics/`: Analytics dashboard with charts
- `src/routes/api/`: All API endpoints (sync, chat, settings, cron, etc.)

### Database Schema

**Core tables:**
- `runs`: Garmin activity data (distance, duration, heart rate, AI feedback, map polyline)
- `training_plan`: Weekly running schedule (type, distance, status, calendar integration)
- `user_settings`: Key-value store for configuration (Garmin tokens, OpenRouter key, VAPID keys, etc.)
- `push_subscriptions`: Web Push endpoints for notifications
- `_migrations`: Migration tracking

### Component Architecture

- UI components in `src/lib/components/ui/`: Reusable components from bits-ui + custom styling
- Custom components: `GarminAuthModal.svelte`, `RunMap.svelte` (Leaflet integration)
- Uses Tailwind CSS v4 with custom design system in `src/app.css`

## Key Implementation Details

### Garmin Authentication Flow

1. User enters email/password in UI
2. Backend calls `GarminConnect.login()` from `garmin-connect` package
3. On success, OAuth1 and OAuth2 tokens are serialized and stored in `user_settings`
4. For subsequent requests, tokens are deserialized via `getGarminClient()`
5. Token refresh happens automatically every 30 min via cron

**Note**: Garmin accounts with 2FA enabled are not supported by the `garmin-connect` package.

### AI Feedback Generation

1. New run synced from Garmin → stored in `runs` table with `ai_feedback = NULL`
2. Dashboard or sync endpoint triggers `generateAIFeedback()` in `coach.ts`
3. Prompts constructed from `src/lib/prompts.ts` using run data + recent history
4. OpenRouter API called with selected model (default: `anthropic/claude-3.5-haiku`)
5. Response stored in `runs.ai_feedback` column

### Database Access Patterns

- **DO**: Use `event.locals.db` in all `+page.server.ts` and API routes
- **DON'T**: Create new database connections in routes
- **DO**: Use prepared statements with `.bind()` for parameters
- **DON'T**: Use string interpolation in SQL queries (SQL injection risk)

Example:
```typescript
export async function load({ locals }) {
  const runs = await locals.db
    .prepare('SELECT * FROM runs WHERE date > ? ORDER BY date DESC')
    .bind(startDate)
    .all();
  return { runs };
}
```

### Environment Variables

Set in `.env` or Docker environment:
- `DATA_DIR`: Directory for SQLite database (default: `./data`)
- `DATABASE_PATH`: Full path to DB file (default: `./data/opencoach.db`)
- `ENABLE_CRON`: Enable scheduled tasks (default: `true`)
- `BASE_URL`: Base URL for cron callbacks (default: `http://localhost:3000`)
- `CRON_SECRET`: Secret for securing cron endpoints
- `GARMIN_EMAIL`, `GARMIN_PASSWORD`: Optional, can be set via UI
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`: Optional, can be set via UI

## Common Patterns

### Adding a New API Endpoint

1. Create `src/routes/api/[endpoint]/+server.ts`
2. Export `GET` or `POST` handler
3. Access DB via `event.locals.db`
4. Return JSON via `json()` helper from `@sveltejs/kit`

### Adding a New Database Table

1. Create migration file: `migrations/XXXX_description.sql`
2. Write SQL for table creation
3. Run `npm run db:migrate` to apply

### Adding a New Cron Job

1. Add schedule to `src/lib/server/cron.ts` in `startCronJobs()`
2. Create corresponding API endpoint in `src/routes/api/cron/`
3. Endpoint should verify `X-Cron-Secret` header matches `CRON_SECRET` env var

### Working with Svelte 5 Runes

This project uses Svelte 5's new reactivity system:
- `$state()` for reactive state
- `$derived()` for computed values
- `$effect()` for side effects
- Avoid legacy `$:` reactive statements

## Build & Deployment

### Local Production Build

```bash
npm run build   # Outputs to build/ directory
npm start       # Runs build/index.js with Bun
```

The build process:
- Injects git commit SHA via `VITE_GIT_SHA` environment variable
- Uses `svelte-adapter-bun` to generate Bun-compatible output
- Precompresses assets (gzip/brotli)

### Docker Deployment

```bash
docker compose up -d --build
```

Docker setup:
- Multi-stage build (build + runtime)
- Persistent volume for `/app/data` (SQLite database)
- Exposes port 3000
- Runs migrations on startup
- Starts cron jobs automatically

## Important Files

- `src/hooks.server.ts`: Request handling, DB injection, cron startup
- `src/app.d.ts`: TypeScript types for `event.locals.db`
- `src/lib/server/sqlite.ts`: Database connection management
- `src/lib/server/db.ts`: Database schema types and helpers
- `src/lib/prompts.ts`: AI coach prompts (empathetic, mental-health-focused tone)
- `vite.config.ts`: Git SHA injection for version tracking
- `svelte.config.js`: SvelteKit config with Bun adapter

## Testing & Debugging

- No formal test suite currently
- Check server logs for cron job execution
- Verify cron endpoints with: `curl -H "X-Cron-Secret: local-dev" http://localhost:5173/api/cron/sync`
- Database inspection: `bun run scripts/db-inspect.ts` (create if needed) or use SQLite CLI
- Type checking catches most errors: `npm run check`
