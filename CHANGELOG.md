# Changelog

## 2026-02-02

### Fixed
- **Training plan start date**: Plans now start from the current week's Monday instead of always starting next week
  - Previously, if you generated a plan on Monday, it would start the following Monday (8 days away)
  - Now, plans start from the current week's Monday (or next Monday if today is Sunday)
  - This fix applies to both goal-based and legacy plan generation
  - **Action required**: Regenerate your training plan to apply this fix to existing plans

### Database
- Added unique constraint to prevent duplicate training plan entries
- Cleaned up 22 duplicate entries from the database
- Created migration: `0008_prevent_duplicate_plans.sql`

### UI
- Consolidated dashboard cards for cleaner layout
- Fixed duplicate run display in training calendar
- Improved calendar cell layout with better visual hierarchy

### Fixed (Additional)
- **Goal progress tracking**: Fixed issue where training plan entries weren't associated with goals
  - All existing training plan entries now properly linked to the "Great Limerick" goal
  - Goal Spotlight on dashboard should now show correct progress (10% complete, 3/29 runs)
  - This was caused by missing goal_id values in the training_plan table
