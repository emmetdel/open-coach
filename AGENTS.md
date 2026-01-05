# Product Requirements Document (PRD): OpenCoach

## 1. Executive Summary

**OpenCoach** is a self-hosted running application built for busy individuals. It automates the entire coaching loop: ingesting run data, analyzing it for mental health/physical stress, and dynamically scheduling future runs.

**Core Philosophy:** "Mental Health over Metrics." The app prioritizes consistency and flexibility (rescheduling missed runs) over rigid performance goals.

## 2. Technical Stack

* **Framework:** SvelteKit (TypeScript)
* **Deployment:** Docker (self-hosted on Unraid, NAS, or any server)
* **Database:** SQLite (via better-sqlite3)
* **Styling:** Tailwind CSS + `shadcn-svelte` (for UI components)
* **AI Engine:** OpenRouter API (Claude, GPT-4, Gemini, etc.)
* **Integrations:**
  * **Garmin:** Garth OAuth2 tokens + custom auth server
  * **Notifications:** Web Push API

## 3. System Architecture

The application runs as a Docker container with two services:
1. **opencoach** - SvelteKit web app with node-cron for background jobs
2. **garmin-auth** - Python Flask server for Garmin OAuth with MFA support

### 3.1 The "Loops" (Cron Jobs via node-cron)

1. **Token Refresh (Every 30 min):** Proactively refreshes Garmin OAuth tokens.
2. **The Sync Loop (Every 4 hours):** Polls Garmin for completed activities.
3. **Morning Reminder (Daily 7 AM):** Sends reminders for today's scheduled run.
4. **Evening Reminder (Daily 8 PM):** Sends preparation reminders for tomorrow.
5. **The Planner (Weekly, Sunday 20:00):** Generates next week's workouts.

## 4. Database Schema (SQLite)

```sql
-- 1. Profile & Settings
CREATE TABLE user_settings (
    key TEXT PRIMARY KEY, 
    value TEXT
    -- Keys: 'garmin_email', 'garmin_password', 'openrouter_key', 'target_date', 'available_days'
);

-- 2. Raw Activity Data (Ingested from Garmin)
CREATE TABLE runs (
    garmin_activity_id TEXT PRIMARY KEY,
    date DATETIME,
    distance_meters INTEGER,
    duration_seconds INTEGER,
    avg_hr INTEGER,
    max_hr INTEGER,
    stress_score INTEGER,
    ai_feedback TEXT,
    synced_to_calendar BOOLEAN DEFAULT 0
);

-- 3. The Future Plan
CREATE TABLE training_plan (
    id TEXT PRIMARY KEY,
    scheduled_date DATE,
    week_number INTEGER DEFAULT 1,
    type TEXT, -- 'Easy', 'Interval', 'Long', 'Rest', 'Walk-Run'
    target_distance_km REAL,
    target_duration_minutes INTEGER,
    description TEXT,
    status TEXT, -- 'Pending', 'Completed', 'Missed', 'Rescheduled'
    google_event_id TEXT,
    garmin_workout_id TEXT
);

-- 4. Push Notifications
CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Plan Metadata
CREATE TABLE plan_metadata (
    key TEXT PRIMARY KEY,
    value TEXT
    -- Keys: 'plan_name', 'total_weeks', 'start_date', 'current_week'
);
```

## 5. Functional Specifications

### 5.1 Service: Garmin Integration (`web/src/lib/server/garmin.ts`)

* **Authentication:** OAuth2 tokens managed by garmin-auth Python service with MFA support.
* **Ingest:** Fetch last 5-10 activities. Compare IDs against DB to find new ones.
* **Push:** Use Garmin Connect API to send structured workouts to the device.

### 5.2 Service: The AI Coach (`web/src/lib/server/coach.ts`)

* **Prompt (Planning):**
> "Context: User is 35M, limited to 2 runs/week (Tue/Thu). Goal: 10k on May 3rd.
> History: Missed last run.
> Task: Generate next week's plan. Keep intensity low to rebuild habit."

* **Prompt (Analysis):**
> "Data: 5km run, 160bpm avg HR (high), Pace 7:00/km.
> Task: Give empathetic feedback. Focus on effort, not speed."

### 5.3 Logic: The "Rescheduler"

* **Trigger:** Daily Morning Cron.
* **Algorithm:**
1. Check `training_plan` for yesterday.
2. If `status == 'Pending'` AND no matching run in `runs` table:
3. Mark as `Missed`.
4. Find next valid day (e.g., move Tuesday run to Thursday).

## 6. UI/UX Specifications (SvelteKit)

### 6.1 Onboarding Flow (`/setup`)

* **Step 1:** Garmin authentication via auth server.
* **Step 2:** "Goal Configuration":
  * Target Date (Date Picker)
  * Available Days (Multi-select: Mon, Tue, Wed...)
  * Current Fitness (Text Area: "I run 3k...")
* **Step 3:** "Generate First Week" button (Triggers the AI Planner).

### 6.2 Dashboard (`/`)

* **Hero:** "Next Run" Card (Date, Distance, Type).
* **Stats:** Graph of "Consistency" (Green bars vs Red bars), not speed.
* **Feed:** List of recent runs with the AI's chat-bubble feedback.
* **Action:** "Manual Sync" button (Force poll Garmin).

### 6.3 Plan View (`/plan`)

* **Visual:** Multi-week training plan overview.
* **Interaction:** Week-by-week progression with current week highlighted.

## 7. Safety & Constraints

* **Hallucination Guard:** Code must validate AI output. If AI suggests distance > 15km for a beginner, default to 5km.
* **Rate Limits:** Garmin polling max 1x per hour.
* **Secrets:** All passwords/keys must be loaded from environment variables, never hardcoded.

## 8. Project Structure

```
open-coach/
├── web/                          # SvelteKit web application
│   ├── src/
│   │   ├── lib/server/           # Server logic (Garmin, AI, DB, cron)
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
├── scripts/                      # Dev utilities (standalone, not deployed)
│
├── docker-compose.yml            # Orchestrates both services
├── env.example                   # Environment template
└── README.md
```

## 9. Configuration (Docker)

```yaml
# docker-compose.yml
services:
  opencoach:
    build: ./web
    ports:
      - "3000:3000"
    volumes:
      - opencoach-data:/app/data
      - garth-tokens:/root/.garth
    environment:
      - ENABLE_CRON=true
      - BASE_URL=http://localhost:3000

  garmin-auth:
    build: ./auth-server
    ports:
      - "5050:5050"
    volumes:
      - garth-tokens:/root/.garth
    environment:
      - GARMIN_EMAIL=${GARMIN_EMAIL}
      - GARMIN_PASSWORD=${GARMIN_PASSWORD}
```
