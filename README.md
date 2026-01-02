# OpenCoach

> Mental Health over Metrics. Every run counts.

OpenCoach is a self-hosted running application that automates the coaching loop: ingesting run data from Garmin, analyzing it with AI for empathetic feedback, and helping you stay consistent.

## Features

- **Garmin Sync**: Automatically syncs your running activities from Garmin Connect
- **AI Coach**: Get personalized, empathetic feedback on every run (powered by OpenRouter - choose your model!)
- **Model Selection**: Pick from Claude, GPT-4, Gemini, Llama, and more via OpenRouter
- **Consistency Tracking**: Focus on showing up, not speed or distance
- **Push Notifications**: Get instant browser notifications when runs sync
- **Email Notifications**: Receive run summaries via Cloudflare Email Workers
- **Beautiful Dashboard**: Dark mode UI with real-time stats and run history

## Tech Stack

- **Framework**: SvelteKit (TypeScript)
- **Deployment**: Cloudflare Workers
- **Database**: Cloudflare D1 (Serverless SQLite)
- **Styling**: Tailwind CSS v4 + Custom Components
- **AI**: OpenRouter (access to Claude, GPT-4, Gemini, Llama, DeepSeek, and more)
- **Garmin**: garmin-connect npm package
- **Notifications**: Web Push API + Cloudflare Email Workers

## Getting Started

### Prerequisites

- Node.js 18+
- A Cloudflare account
- Garmin Connect credentials
- OpenRouter API key ([get one free](https://openrouter.ai/keys))

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a D1 database:
   ```bash
   npx wrangler d1 create opencoach-db
   ```

3. Update `wrangler.toml` with your database ID:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "opencoach-db"
   database_id = "YOUR_DATABASE_ID"
   ```

4. Run migrations:
   ```bash
   npx wrangler d1 execute opencoach-db --local --file=migrations/0001_initial.sql
   npx wrangler d1 execute opencoach-db --local --file=migrations/0002_notifications.sql
   ```

5. Start the dev server:
   ```bash
   npm run dev
   ```

6. Open http://localhost:5173 and complete the setup wizard

### Deployment

1. Run migrations on production:
   ```bash
   npx wrangler d1 execute opencoach-db --remote --file=migrations/0001_initial.sql
   npx wrangler d1 execute opencoach-db --remote --file=migrations/0002_notifications.sql
   ```

2. Deploy to Cloudflare Workers:
   ```bash
   npm run build
   npx wrangler deploy
   ```

### Email Notifications (Optional)

To enable email notifications:

1. Set up [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) on your domain
2. Uncomment the email binding in `wrangler.toml`:
   ```toml
   [[send_email]]
   name = "EMAIL"
   ```
3. Redeploy your worker

## Supported AI Models

OpenCoach uses OpenRouter, giving you access to multiple AI providers:

| Model | Provider | Best For |
|-------|----------|----------|
| Claude 3.5 Haiku | Anthropic | Fast, affordable (default) |
| Claude 3.5 Sonnet | Anthropic | High quality feedback |
| GPT-4o Mini | OpenAI | Balanced performance |
| GPT-4o | OpenAI | Premium responses |
| Gemini 2.0 Flash | Google | Fast responses |
| Llama 3.3 70B | Meta | Open source option |
| Mistral Small | Mistral | European option |
| DeepSeek Chat | DeepSeek | Budget-friendly |

## Project Structure

```
open-coach/
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   ├── garmin.ts         # Garmin Connect integration
│   │   │   ├── coach.ts          # OpenRouter AI coach
│   │   │   ├── notifications.ts  # Push & email notifications
│   │   │   └── db.ts             # D1 database helpers
│   │   ├── components/ui/        # UI components (Button, Card, Input, etc.)
│   │   └── utils.ts              # Utility functions
│   └── routes/
│       ├── +page.svelte          # Dashboard
│       ├── +page.server.ts       # Dashboard data loader
│       ├── setup/                # Onboarding wizard
│       └── api/
│           ├── sync/             # Manual sync endpoint
│           ├── settings/         # Settings CRUD
│           ├── push/             # Push subscription management
│           └── cron/sync/        # Scheduled sync (every 4 hours)
├── static/
│   └── sw.js                     # Service worker for push notifications
├── migrations/
│   ├── 0001_initial.sql          # Core database schema
│   └── 0002_notifications.sql    # Push subscriptions table
└── wrangler.toml                 # Cloudflare Workers config
```

## Cron Jobs

OpenCoach uses Cloudflare scheduled triggers for background tasks:

| Schedule | Job | Description |
|----------|-----|-------------|
| Every 4 hours | Sync Loop | Polls Garmin for new activities |
| Daily 7 AM | Rescheduler | Moves missed runs to next available day |
| Sunday 8 PM | Planner | Generates next week's training plan |

## Notifications

OpenCoach supports two notification channels:

### Web Push Notifications
- Instant browser notifications
- Works on desktop and mobile (Chrome, Firefox, Edge, Safari)
- No server needed - uses VAPID keys stored in D1

### Email Notifications (Cloudflare Email Workers)
- Requires Email Routing on your domain
- Beautiful HTML emails with run summaries
- Includes AI coach feedback

## Security

- Garmin credentials are stored in D1 (consider adding encryption)
- OpenRouter API key is stored in D1
- VAPID keys for push notifications are auto-generated and stored in D1
- All secrets should be moved to Cloudflare Secrets for production

## License

MIT
