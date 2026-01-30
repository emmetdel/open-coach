-- Add multi-user support with accounts and per-user data ownership

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed a legacy owner for existing single-user data
INSERT OR IGNORE INTO users (id, email, name, password_hash, password_salt)
VALUES ('legacy', 'legacy@open-coach.local', 'Owner', NULL, NULL);

-- Rebuild user_settings with user ownership
CREATE TABLE IF NOT EXISTS user_settings_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (user_id, key)
);

INSERT INTO user_settings_new (user_id, key, value)
SELECT 'legacy', key, value FROM user_settings;

DROP TABLE user_settings;
ALTER TABLE user_settings_new RENAME TO user_settings;

-- Rebuild plan_metadata with user ownership
CREATE TABLE IF NOT EXISTS plan_metadata_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (user_id, key)
);

INSERT INTO plan_metadata_new (user_id, key, value)
SELECT 'legacy', key, value FROM plan_metadata;

DROP TABLE plan_metadata;
ALTER TABLE plan_metadata_new RENAME TO plan_metadata;

-- Rebuild runs with user ownership
CREATE TABLE IF NOT EXISTS runs_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  garmin_activity_id TEXT NOT NULL,
  date DATETIME,
  distance_meters INTEGER,
  duration_seconds INTEGER,
  avg_hr INTEGER,
  max_hr INTEGER,
  stress_score INTEGER,
  ai_feedback TEXT,
  map_polyline TEXT,
  synced_to_calendar BOOLEAN DEFAULT 0,
  PRIMARY KEY (user_id, garmin_activity_id)
);

INSERT INTO runs_new (
  user_id,
  garmin_activity_id,
  date,
  distance_meters,
  duration_seconds,
  avg_hr,
  max_hr,
  stress_score,
  ai_feedback,
  map_polyline,
  synced_to_calendar
)
SELECT
  'legacy',
  garmin_activity_id,
  date,
  distance_meters,
  duration_seconds,
  avg_hr,
  max_hr,
  stress_score,
  ai_feedback,
  map_polyline,
  synced_to_calendar
FROM runs;

DROP TABLE runs;
ALTER TABLE runs_new RENAME TO runs;

-- Rebuild push_subscriptions with user ownership
CREATE TABLE IF NOT EXISTS push_subscriptions_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, endpoint)
);

INSERT INTO push_subscriptions_new (id, user_id, endpoint, p256dh, auth, created_at)
SELECT id, 'legacy', endpoint, p256dh, auth, created_at FROM push_subscriptions;

DROP TABLE push_subscriptions;
ALTER TABLE push_subscriptions_new RENAME TO push_subscriptions;

-- Add user_id to remaining tables
ALTER TABLE training_plan ADD COLUMN user_id TEXT REFERENCES users(id);
UPDATE training_plan SET user_id = 'legacy' WHERE user_id IS NULL;

ALTER TABLE training_goals ADD COLUMN user_id TEXT REFERENCES users(id);
UPDATE training_goals SET user_id = 'legacy' WHERE user_id IS NULL;

ALTER TABLE chat_messages ADD COLUMN user_id TEXT REFERENCES users(id);
UPDATE chat_messages SET user_id = 'legacy' WHERE user_id IS NULL;

ALTER TABLE coach_actions ADD COLUMN user_id TEXT REFERENCES users(id);
UPDATE coach_actions SET user_id = 'legacy' WHERE user_id IS NULL;

-- Indexes for per-user lookups
CREATE INDEX IF NOT EXISTS idx_runs_user_date ON runs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_training_plan_user_date ON training_plan(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_training_plan_user_status ON training_plan(user_id, status);
CREATE INDEX IF NOT EXISTS idx_training_goals_user ON training_goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
