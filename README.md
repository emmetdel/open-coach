# OpenCoach

> Mental Health over Metrics. Every run counts.

OpenCoach is a self-hosted running application that automates the coaching loop: ingesting run data from Garmin, analyzing it with AI for empathetic feedback, and helping you stay consistent.

## Features

- **Garmin Sync**: Automatically syncs your running activities from Garmin Connect
- **AI Coach**: Get personalized, empathetic feedback on every run (powered by OpenRouter - choose your model!)
- **Model Selection**: Pick from Claude, GPT-4, Gemini, Llama, and more via OpenRouter
- **Consistency Tracking**: Focus on showing up, not speed or distance
- **Push Notifications**: Get instant browser notifications when runs sync
- **Beautiful Dashboard**: Dark mode UI with real-time stats and run history

## Tech Stack

- **Framework**: SvelteKit (TypeScript)
- **Deployment**: Docker (self-hosted on Unraid, NAS, or any server)
- **Database**: SQLite (via better-sqlite3)
- **Styling**: Tailwind CSS v4 + Custom Components
- **AI**: OpenRouter (access to Claude, GPT-4, Gemini, Llama, DeepSeek, and more)
- **Garmin**: Garth OAuth2 tokens
- **Notifications**: Web Push API

## Quick Start with Docker

The Docker setup includes **two containers**:
1. **opencoach** - The main SvelteKit web application
2. **garmin-auth** - Python server for Garmin authentication with MFA support

### Using Docker Compose (Recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/open-coach.git
   cd open-coach
   ```

2. Create your environment file:
   ```bash
   cp env.example .env
   ```

3. Edit `.env` with your Garmin credentials:
   ```bash
   GARMIN_EMAIL=your-email@example.com
   GARMIN_PASSWORD=your-garmin-password
   ```

4. Start both containers:
   ```bash
   docker compose up -d
   ```

5. Open http://localhost:3000 and complete the setup wizard

### Garmin Authentication Flow

The auth server handles Garmin's MFA (2-factor authentication):

1. When you first sync or tokens expire, OpenCoach calls the auth server
2. If MFA is required, a popup appears in the web UI asking for your code
3. Enter the code from your authenticator app
4. Tokens are saved and shared between containers

**Auth Server Endpoints** (http://localhost:5050):
- `GET /health` - Health check
- `GET /auth/status` - Check if authenticated
- `POST /auth/auto-login` - Login with env credentials
- `POST /auth/mfa` - Submit MFA code
- `POST /auth/export` - Export current tokens

### Unraid Deployment

For Unraid, you'll need to add both containers:

**Container 1: opencoach**
- **Container Port**: 3000
- **Host Path for /app/data**: `/mnt/user/appdata/opencoach`
- **Host Path for /root/.garth**: `/mnt/user/appdata/opencoach/garth`

**Container 2: garmin-auth**
- **Container Port**: 5050
- **Host Path for /root/.garth**: `/mnt/user/appdata/opencoach/garth` (same as above)
- **Environment Variables**: `GARMIN_EMAIL`, `GARMIN_PASSWORD`

### Manual Authentication (Alternative)

If you prefer to authenticate manually without the auth server:

1. Run the Python auth script locally:
   ```bash
   cd scripts
   python garmin-auth.py
   ```

2. Copy the generated `garmin-tokens.json` to the container:
   ```bash
   docker cp garmin-tokens.json opencoach:/app/data/
   ```

3. Import tokens via the API:
   ```bash
   curl -X POST http://localhost:3000/api/garmin/tokens \
     -H "Content-Type: application/json" \
     -d @garmin-tokens.json
   ```

## Local Development

1. Install dependencies:
   ```bash
   cd web
   npm install
   ```

2. Run database migrations:
   ```bash
   npm run db:migrate
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:5173 and complete the setup wizard

## Building for Production

```bash
cd web
npm run build
npm start
```

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
├── web/                          # SvelteKit web application
│   ├── src/
│   │   ├── lib/server/           # Server logic (Garmin, AI, DB)
│   │   ├── routes/               # Pages and API endpoints
│   │   └── hooks.server.ts       # DB injection, cron startup
│   ├── migrations/               # SQLite schema migrations
│   ├── scripts/migrate.ts        # Database migration script
│   ├── static/                   # Static assets
│   ├── Dockerfile
│   └── package.json
│
├── auth-server/                  # Garmin Auth Service (Python)
│   ├── server.py                 # Flask server with MFA support
│   ├── pyproject.toml            # Python dependencies
│   └── Dockerfile
│
├── scripts/                      # Dev utilities (not deployed)
│   ├── garmin-auth.py            # Manual Garmin auth CLI
│   └── garmin-sync.py            # Manual activity sync
│
├── docker-compose.yml            # Orchestrates both services
├── env.example                   # Environment template
└── README.md
```

## Scheduled Jobs

OpenCoach uses node-cron for background tasks:

| Schedule | Job | Description |
|----------|-----|-------------|
| Every 30 min | Token Refresh | Proactively refreshes Garmin OAuth tokens |
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
| `OPENROUTER_API_KEY` | - | OpenRouter API key (optional, can set in UI) |
| `OPENROUTER_MODEL` | anthropic/claude-3.5-haiku | Default AI model |

## Security

- SQLite database is stored in a persistent volume
- Garmin OAuth tokens are stored in the database
- OpenRouter API key can be set via environment variable or UI
- VAPID keys for push notifications are auto-generated
- Cron endpoints can be secured with `CRON_SECRET` header

## License

MIT
