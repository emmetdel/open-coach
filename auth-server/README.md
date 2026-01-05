# OpenCoach Garmin Auth Server

A Flask server that handles Garmin OAuth authentication with MFA (2-factor) support.

## Why a Separate Service?

Garmin's authentication requires:
1. **Python** - The `garth` library handles Garmin's complex OAuth flow
2. **MFA Support** - Interactive MFA code entry when required
3. **Token Persistence** - Tokens stored and shared with the main app

## Quick Start

### With Docker (Recommended)

```bash
# From the main project root
docker compose up garmin-auth
```

### Local Development

```bash
# Install dependencies
pip install -e .

# Set credentials
export GARMIN_EMAIL="your@email.com"
export GARMIN_PASSWORD="your-password"

# Run server
python server.py
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/auth/status` | GET | Check if authenticated |
| `/auth/auto-login` | POST | Login with env credentials |
| `/auth/mfa` | POST | Submit MFA code |
| `/auth/export` | POST | Export tokens as JSON |

## Authentication Flow

1. **Auto-Login**: POST to `/auth/auto-login`
   - Returns `success: true` if no MFA needed
   - Returns `mfaRequired: true` if MFA is needed

2. **MFA (if required)**: POST to `/auth/mfa` with `{"code": "123456"}`
   - Returns tokens on success

3. **Tokens**: Automatically saved to:
   - `~/.garth/` (Garth's native format)
   - `/app/data/garmin-tokens.json` (for import to main app)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GARMIN_EMAIL` | - | Garmin Connect email |
| `GARMIN_PASSWORD` | - | Garmin Connect password |
| `AUTH_HOST` | 0.0.0.0 | Server bind address |
| `AUTH_PORT` | 5050 | Server port |
| `GARTH_DIR` | ~/.garth | Token storage directory |
| `TOKEN_FILE` | /app/data/garmin-tokens.json | Export file path |


