-- Add week_number and duration to training_plan for multi-week plans like Runna

-- Add new columns (SQLite doesn't support IF NOT EXISTS for ALTER TABLE)
ALTER TABLE training_plan ADD COLUMN week_number INTEGER DEFAULT 1;
ALTER TABLE training_plan ADD COLUMN target_duration_minutes INTEGER;

-- Update type to allow 'Walk-Run' for beginners
-- (SQLite doesn't have ENUM, type is already TEXT so this is fine)

-- Add plan metadata table
CREATE TABLE IF NOT EXISTS plan_metadata (
    key TEXT PRIMARY KEY,
    value TEXT
    -- Keys: 'plan_name', 'total_weeks', 'start_date', 'current_week'
);

-- Index for week-based queries
CREATE INDEX IF NOT EXISTS idx_training_plan_week ON training_plan(week_number);

