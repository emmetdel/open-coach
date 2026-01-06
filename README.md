# OpenCoach

> Mental Health over Metrics. Every run counts.

OpenCoach is a self-hosted running application that automates the coaching loop: ingesting run data from Garmin, analyzing it with AI for empathetic feedback, and helping you stay consistent.

## Features

- **Garmin Sync**: Automatically syncs your running activities from Garmin Connect
- **AI Coach**: Get personalized, empathetic feedback on every run (powered by OpenRouter)
- **Model Selection**: Pick from Claude, GPT-4, Gemini, Llama, and more via OpenRouter
- **Consistency Tracking**: Focus on showing up, not speed or distance
- **Push Notifications**: Get instant browser notifications when runs sync
- **Beautiful Dashboard**: Dark mode UI with real-time stats and run history

## Tech Stack

- **Framework**: SvelteKit (TypeScript)
- **Deployment**: Docker or standalone Node.js
- **Database**: SQLite (via better-sqlite3)
- **Styling**: Tailwind CSS v4 + Custom Components
- **AI**: OpenRouter (access to Claude, GPT-4, Gemini, Llama, DeepSeek, and more)
- **Garmin**: garmin-connect npm package (native TypeScript)
- **Notifications**: Web Push API

## Quick Start

### Option 1: Local Development (Recommended for getting started)

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/open-coach.git
   cd open-coach
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the dev server (migrations run automatically):
   ```bash
   npm run dev
   ```

4. Open http://localhost:5173 and complete the setup wizard

### Option 2: Docker

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/open-coach.git
   cd open-coach
   ```

2. Create your environment file:
   ```bash
   cp env.example .env
   ```

3. Edit `.env` with your credentials (optional - can also set in the UI):
   ```bash
   GARMIN_EMAIL=your-email@example.com
   GARMIN_PASSWORD=your-garmin-password
   OPENROUTER_API_KEY=your-api-key
   ```

4. Start the container:
   ```bash
   docker compose up -d
   ```

5. Open http://localhost:3000 and complete the setup wizard

## Building for Production

```bash
npm run build
npm start
```

Or with Docker:

```bash
docker compose up -d --build
```

## Garmin Authentication

OpenCoach uses the `garmin-connect` npm package for direct Garmin Connect API authentication:

1. **No 2FA accounts only**: Works best with Garmin accounts that have 2FA disabled
2. **Enter credentials in the UI**: The setup wizard prompts for your Garmin email/password
3. **Automatic token refresh**: Tokens are refreshed automatically via cron job

**Note**: If you have 2FA enabled on your Garmin account, you'll need to disable it or create a secondary account without 2FA.

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
│   ├── lib/server/           # Server logic (Garmin, AI, DB)
│   ├── routes/               # Pages and API endpoints
│   └── hooks.server.ts       # DB injection, cron startup
├── migrations/               # SQLite schema migrations
├── scripts/migrate.ts        # Database migration script
├── static/                   # Static assets
├── docker-compose.yml        # Docker orchestration
├── Dockerfile
├── package.json
├── env.example               # Environment template
└── README.md
```

## Scheduled Jobs

OpenCoach uses node-cron for background tasks:

| Schedule | Job | Description |
|----------|-----|-------------|
| Every 30 min | Token Refresh | Refreshes Garmin session |
| Every 4 hours | Sync Loop | Polls Garmin for new activities |
| Daily 7 AM | Morning Reminder | Sends run reminders for today |
| Daily 8 PM | Evening Reminder | Sends preparation reminders for tomorrow |
| Sunday 8 PM | Weekly Planner | Generates next week's training plan |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HOST` | 0.0.0.0 | Server host |
| `DATA_DIR` | ./data | Directory for SQLite database |
| `DATABASE_PATH` | ./data/opencoach.db | Full path to database file |
| `ENABLE_CRON` | true | Enable scheduled jobs |
| `BASE_URL` | http://localhost:3000 | Base URL for cron callbacks |
| `CRON_SECRET` | - | Secret for securing cron endpoints |
| `GARMIN_EMAIL` | - | Garmin email (optional, can set in UI) |
| `GARMIN_PASSWORD` | - | Garmin password (optional, can set in UI) |
| `OPENROUTER_API_KEY` | - | OpenRouter API key (optional, can set in UI) |
| `OPENROUTER_MODEL` | anthropic/claude-3.5-haiku | Default AI model |

## Security

- SQLite database is stored in a persistent volume
- Garmin session tokens are stored in the database
- OpenRouter API key can be set via environment variable or UI
- VAPID keys for push notifications are auto-generated
- Cron endpoints can be secured with `CRON_SECRET` header

## License

MIT
