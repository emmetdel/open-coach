# Product Requirements Document (PRD): OpenCoach

## 1. Executive Summary

**OpenCoach** is a self-hosted or serverless running application built for busy individuals. It automates the entire coaching loop: ingesting run data, analyzing it for mental health/physical stress, and dynamically scheduling future runs into the user's Google Calendar and Garmin Watch.

**Core Philosophy:** "Mental Health over Metrics." The app prioritizes consistency and flexibility (rescheduling missed runs) over rigid performance goals.

## 2. Technical Stack

* **Framework:** SvelteKit (TypeScript)
* **Deployment:** Cloudflare Workers (via `@sveltejs/adapter-cloudflare`)
* **Database:** Cloudflare D1 (Serverless SQLite)
* **Styling:** Tailwind CSS + `shadcn-svelte` (for UI components)
* **AI Engine:** OpenAI API (`gpt-4o-mini`)
* **Integrations:**
* **Garmin:** `garmin-connect` (unofficial npm package)
* **Calendar:** Google Calendar API (v3) via `googleapis`



## 3. System Architecture

The application runs as a single SvelteKit instance on the Edge. It handles both the UI (Dashboard) and the Background Jobs (Cron Triggers).

### 3.1 The "Loops" (Cron Jobs)

Since webhooks are unavailable, the system relies on scheduled triggers defined in `wrangler.toml`:

1. **The Sync Loop (Every 4 hours):** Polls Garmin for completed activities.
2. **The Rescheduler (Daily 07:00 AM):** Checks for missed runs yesterday and moves them.
3. **The Planner (Weekly, Sunday 20:00):** Generates next week's workouts and pushes to Watch/Calendar.

## 4. Database Schema (Cloudflare D1)

```sql
-- 1. Profile & Settings
CREATE TABLE user_settings (
    key TEXT PRIMARY KEY, 
    value TEXT
    -- Keys: 'garmin_email', 'garmin_password', 'openai_key', 'target_date', 'available_days'
);

-- 2. Raw Activity Data (Ingested from Garmin)
CREATE TABLE runs (
    garmin_activity_id TEXT PRIMARY KEY,
    date DATETIME,
    distance_meters INTEGER,
    duration_seconds INTEGER,
    avg_hr INTEGER,
    max_hr INTEGER,
    stress_score INTEGER, -- Derived from HRV or Body Battery if available
    ai_feedback TEXT, -- The "Coach's" comment
    synced_to_calendar BOOLEAN DEFAULT 0
);

-- 3. The Future Plan
CREATE TABLE training_plan (
    id TEXT PRIMARY KEY, -- UUID
    scheduled_date DATE,
    type TEXT, -- 'Easy', 'Interval', 'Long', 'Rest'
    target_distance_km REAL,
    description TEXT, -- 'Run 5k at Zone 2'
    status TEXT, -- 'Pending', 'Completed', 'Missed', 'Rescheduled'
    google_event_id TEXT, -- To update the calendar later
    garmin_workout_id TEXT -- To delete/move on watch if needed
);

```

## 5. Functional Specifications

### 5.1 Service: Garmin Integration (`src/lib/server/garmin.ts`)

* **Authentication:** Must handle session persistence (store cookies/tokens in D1 or memory to avoid logging in on every request).
* **Ingest:** Fetch last 5 activities. Compare IDs against DB to find new ones.
* **Push:** Use `uploadWorkout` to send JSON-structured workouts to the device.

### 5.2 Service: Calendar Integration (`src/lib/server/calendar.ts`)

* **Auth:** Service Account (JSON key stored in Cloudflare Secrets).
* **Logic:**
* *Create:* Add event with Color ID 11 (Red).
* *Update:* Change to Color ID 10 (Green) upon completion.
* *Move:* Patch event with new `start.dateTime` if rescheduled.



### 5.3 Service: The AI Coach (`src/lib/server/coach.ts`)

* **Prompt (Planning):**
> "Context: User is 35M, limited to 2 runs/week (Tue/Thu). Goal: 10k on May 3rd.
> History: Missed last run.
> Task: Generate next week's plan. Keep intensity low to rebuild habit."


* **Prompt (Analysis):**
> "Data: 5km run, 160bpm avg HR (high), Pace 7:00/km.
> Task: Give empathetic feedback. Focus on effort, not speed."



### 5.4 Logic: The "Rescheduler"

* **Trigger:** Daily Morning Cron.
* **Algorithm:**
1. Check `training_plan` for yesterday.
2. If `status == 'Pending'` AND no matching run in `runs` table:
3. Mark as `Missed`.
4. Find next valid day (e.g., move Tuesday run to Thursday).
5. **Update Google Calendar:** Move the event visual.
6. **Update Garmin:** Delete old workout, add new one for Thursday.



## 6. UI/UX Specifications (SvelteKit)

### 6.1 Onboarding Flow (`/setup`)

* **Step 1:** Form inputs for Garmin Credentials & OpenAI Key.
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

### 6.3 Calendar View (`/schedule`)

* **Visual:** Monthly grid.
* **Interaction:** Drag-and-drop.
* *Frontend:* Optimistic UI update.
* *Backend:* API call to update D1 and Google Calendar.



## 7. Implementation Roadmap for LLM

**Phase 1: Skeleton & Auth**

1. Initialize SvelteKit + Tailwind + Shadcn.
2. Set up D1 Database bindings.
3. Create the `garmin.ts` service and prove login works via a test endpoint.

**Phase 2: The Data Layer**

1. Build the "Ingest" cron job.
2. Prove we can fetch a `.fit` file summary and save it to SQLite.
3. Connect OpenAI to generate a comment on that run.

**Phase 3: The Planner & Calendar**

1. Build the `coach.ts` logic to generate JSON plans.
2. Implement Google Calendar API to push these events.
3. Implement the Garmin `uploadWorkout` logic.

**Phase 4: The UI**

1. Build the Dashboard to visualize the data in D1.

## 8. Safety & Constraints

* **Hallucination Guard:** Code must validate AI output. If AI suggests distance > 15km for a beginner, default to 5km.
* **Rate Limits:** Garmin polling max 1x per hour.
* **Secrets:** All passwords/keys must be loaded from `env` (Cloudflare Secrets), never hardcoded.

## 9. Configuration (`wrangler.toml`)

```toml
name = "opencoach"
compatibility_date = "2024-01-01"
compatibility_flags = [ "nodejs_compat" ]

[d1_databases]
binding = "DB"
database_name = "opencoach-db"
database_id = "YOUR_ID_HERE"

[triggers]
crons = [
    "0 */4 * * *",  # Sync loop (Every 4 hours)
    "0 7 * * *",    # Rescheduler (7 AM)
    "0 20 * * 0"    # Planner (Sunday 8 PM)
]

```