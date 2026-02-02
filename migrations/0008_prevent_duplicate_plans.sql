-- Migration: Prevent duplicate training plan entries
-- This migration adds a unique constraint to ensure no duplicate runs
-- can be scheduled for the same user on the same date with the same type

-- Create unique index to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_training_plan_unique 
ON training_plan(user_id, scheduled_date, type);
