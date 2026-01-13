-- Add goals table for goal-oriented training
CREATE TABLE IF NOT EXISTS training_goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal_type TEXT NOT NULL, -- 'distance', 'race', 'time_goal'
  target_date TEXT NOT NULL, -- Date of the goal event
  target_distance_km REAL, -- For distance/race goals
  target_duration_minutes INTEGER, -- For time-based goals (e.g., run 5k in 25 min)
  description TEXT,
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'abandoned'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

-- Add goal_id to training_plan to link workouts to specific goals
ALTER TABLE training_plan ADD COLUMN goal_id TEXT REFERENCES training_goals(id);

-- Add metadata about plan generation strategy
ALTER TABLE plan_metadata ADD COLUMN generation_strategy TEXT DEFAULT 'goal_based'; -- 'goal_based' or 'weekly'
ALTER TABLE plan_metadata ADD COLUMN primary_goal_id TEXT REFERENCES training_goals(id);

-- Index for faster goal lookups
CREATE INDEX IF NOT EXISTS idx_goals_target_date ON training_goals(target_date);
CREATE INDEX IF NOT EXISTS idx_plan_goal_id ON training_plan(goal_id);
