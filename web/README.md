# OpenCoach Web App

The main SvelteKit web application for OpenCoach.

## Development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
```

## Docker

Build is handled by the root `docker-compose.yml`:

```bash
# From project root
docker compose build opencoach
```

## Structure

```
web/
├── src/
│   ├── lib/
│   │   ├── server/           # Server-side logic
│   │   │   ├── garmin.ts     # Garmin Connect API
│   │   │   ├── coach.ts      # AI coaching (OpenRouter)
│   │   │   ├── cron.ts       # Background jobs
│   │   │   ├── db.ts         # Database helpers
│   │   │   ├── sqlite.ts     # SQLite wrapper
│   │   │   ├── notifications.ts
│   │   │   └── reminders.ts
│   │   ├── components/       # Svelte components
│   │   └── utils.ts
│   ├── routes/               # SvelteKit pages + API
│   └── hooks.server.ts       # Server hooks
├── migrations/               # SQLite schema migrations
├── scripts/migrate.ts        # Database migration runner
├── static/                   # Static assets
├── Dockerfile
└── package.json
```

