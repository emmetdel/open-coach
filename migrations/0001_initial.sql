-- 1. Profile & Settings
CREATE TABLE IF NOT EXISTS user_settings (
    key TEXT PRIMARY KEY, 
    value TEXT
    -- Keys: 'garmin_email', 'garmin_password', 'openai_key', 'target_date', 'available_days', 'current_fitness'
);

-- 2. Raw Activity Data (Ingested from Garmin)
CREATE TABLE IF NOT EXISTS runs (
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
CREATE TABLE IF NOT EXISTS training_plan (
    id TEXT PRIMARY KEY,
    scheduled_date DATE,
    type TEXT,
    target_distance_km REAL,
    description TEXT,
    status TEXT,
    google_event_id TEXT,
    garmin_workout_id TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_runs_date ON runs(date DESC);
CREATE INDEX IF NOT EXISTS idx_training_plan_date ON training_plan(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_training_plan_status ON training_plan(status);

