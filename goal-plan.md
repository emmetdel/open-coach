# Implementation Plan: Goal-Based Training System

## Executive Summary

Transform OpenCoach from fixed 16-week plans to **goal-oriented adaptive training**. Users set goals (e.g., "Run 10km on May 3rd"), and the system:
- Works backwards from goal date to create a structured plan
- Adapts week-by-week based on actual performance vs expected progress
- Preserves ALL historical data (completed & missed runs)
- Automatically handles missed sessions by adding makeup runs

**Approach**: Hybrid structure - base plan with key milestones + AI-driven weekly adjustments

---

## Phase 1: Database & Core Infrastructure ✅ COMPLETED

### 1.1 Goals Database Schema ✅
**File**: `migrations/0006_goals_system.sql`
- Created `training_goals` table with goal types (distance, race, time_goal)
- Added `goal_id` column to `training_plan` table
- Added metadata fields to `plan_metadata` for goal-based generation
- **Status**: Migration applied successfully

### 1.2 Database Helpers ✅  
**File**: `src/lib/server/db.ts`
- Added `TrainingGoal` interface
- Created CRUD functions: `createGoal`, `getActiveGoals`, `getGoalById`, `updateGoal`, `deleteGoal`
- **Status**: All helpers implemented and tested

---

## Phase 2: Goal-Based Plan Generation Algorithm

### 2.1 New Plan Generation Module
**File**: `src/lib/server/goalBasedPlanner.ts` (NEW FILE)

Create dedicated module for goal-based planning:

```typescript
interface PlanGenerationInput {
  goalId: string;           // Primary goal to plan towards
  goalDate: string;         // Target date (e.g., "2026-05-03")
  goalDistance: number;     // Target distance in km (e.g., 10)
  currentFitness: string;   // User's fitness level
  availableDays: string[];  // Days available to train
  recentRuns: Run[];        // Last 4 weeks of actual runs
}

interface WeekPlan {
  weekNumber: number;
  weekStart: string;
  focus: string;           // "base_building" | "volume" | "peak" | "taper"
  targetVolume: number;    // Total km for the week
  workouts: WorkoutTemplate[];
  milestones?: string;     // Optional milestone (e.g., "First 5km continuous run")
}

// Main function
export async function generateGoalBasedPlan(
  db: Database,
  input: PlanGenerationInput
): Promise<{
  weeks: WeekPlan[];
  totalWeeks: number;
  planName: string;
}>;
```

**Algorithm Logic**:

1. **Calculate Training Timeline**:
   ```typescript
   const today = new Date();
   const weeksAvailable = Math.floor((goalDate - today) / (7 * 24 * 60 * 60 * 1000));
   const minWeeks = 8;  // Minimum safe training period
   const maxWeeks = 20; // Maximum plan length
   const totalWeeks = Math.min(Math.max(weeksAvailable, minWeeks), maxWeeks);
   ```

2. **Assess Current Fitness Level**:
   ```typescript
   // Analyze recent runs to determine baseline
   const recentVolume = calculateAverageWeeklyVolume(recentRuns);
   const longestRun = findLongestRun(recentRuns);
   const currentCapacity = {
     weeklyVolume: recentVolume || 10, // Default 10km/week if no data
     longestDistance: longestRun || 3,  // Default 3km if no data
   };
   ```

3. **Calculate Required Progression**:
   ```typescript
   const targetWeeklyVolume = goalDistance * 2;  // 2x goal distance per week at peak
   const volumeProgression = (targetWeeklyVolume - currentCapacity.weeklyVolume) / totalWeeks;
   
   // Build-up should be max 10% per week (safe progression)
   const safeProgression = currentCapacity.weeklyVolume * 0.10;
   const weeklyIncrease = Math.min(volumeProgression, safeProgression);
   ```

4. **Structure Plan into Phases**:
   ```typescript
   const phases = {
     base:   Math.floor(totalWeeks * 0.40),  // 40% - Build aerobic base
     volume: Math.floor(totalWeeks * 0.35),  // 35% - Increase distance
     peak:   Math.floor(totalWeeks * 0.15),  // 15% - Peak training
     taper:  Math.floor(totalWeeks * 0.10),  // 10% - Taper for race
   };
   ```

5. **Generate Week-by-Week Plan**:
   ```typescript
   for (let week = 1; week <= totalWeeks; week++) {
     const phase = determinePhase(week, phases);
     const targetVolume = calculateWeekVolume(week, currentCapacity, weeklyIncrease, phase);
     const workouts = distributeVolumeAcrossDays(targetVolume, availableDays, phase);
     
     weekPlans.push({
       weekNumber: week,
       focus: phase,
       targetVolume,
       workouts,
       milestones: getMilestoneForWeek(week, phase)
     });
   }
   ```

6. **Add Key Milestones**:
   - Week 4: "First continuous 5km run"
   - Week 8: "Half-way to goal distance"
   - Week 12: "Peak week - longest training run"
   - Final week: "Taper - race week!"

---

### 2.2 Update Existing Plan Generation Endpoint
**File**: `src/routes/api/plan/generate/+server.ts`

**Current Flow**:
```typescript
POST /api/plan/generate
  → deleteAllOpenCoachWorkouts()
  → deleteAllPlans()          // Deletes only pending
  → generateFullPlan()         // Fixed 16-week algorithm
```

**New Flow**:
```typescript
POST /api/plan/generate
  → Get active goals
  → If no goals: use legacy generateFullPlan()
  → If goals exist:
      → deleteAllOpenCoachWorkouts()
      → deleteOnlyFuturePlans()     // NEW: Only delete workouts after today
      → generateGoalBasedPlan()      // NEW: Goal-based algorithm
      → Insert weeks into training_plan with goal_id
      → Update plan_metadata with primary_goal_id
```

**New Helper**: `deleteOnlyFuturePlans()`
```typescript
// Delete only workouts scheduled for future dates
export async function deleteOnlyFuturePlans(db: Database): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await db.prepare(
    "DELETE FROM training_plan WHERE scheduled_date > ? AND status = 'Pending'"
  ).bind(today).run();
}
```

---

### 2.3 Smart Weekly Adjustment Logic
**File**: `src/lib/server/adaptivePlanner.ts` (NEW FILE)

**Purpose**: Analyze actual performance vs plan and make weekly micro-adjustments

```typescript
interface WeeklyAnalysis {
  weekNumber: number;
  planned: {
    runs: number;
    volume: number;
  };
  actual: {
    runs: number;
    volume: number;
  };
  variance: {
    runs: number;        // -1 if missed a run
    volume: number;      // -5km if 5km short
  };
  recommendation: 'on_track' | 'add_makeup' | 'reduce_volume' | 'extend_timeline';
}

export async function analyzeWeeklyProgress(
  db: Database,
  goalId: string
): Promise<WeeklyAnalysis>;

export async function adjustNextWeek(
  db: Database,
  goalId: string,
  analysis: WeeklyAnalysis
): Promise<void> {
  // If user missed runs this week
  if (analysis.variance.runs < 0) {
    // Add 1 extra easy run next week (makeup run)
    await addMakeupRun(db, goalId, analysis.weekNumber + 1);
  }
  
  // If user is consistently ahead
  if (analysis.variance.volume > 5 && consistentlyAhead) {
    // Slightly reduce next week's volume to prevent overtraining
    await reduceNextWeekVolume(db, goalId, 0.9); // 10% reduction
  }
}
```

**Trigger**: Run this analysis every **Sunday evening** (via cron job)

---

## Phase 3: Goals Management UI

### 3.1 Create Goals Page
**File**: `src/routes/goals/+page.svelte` (NEW FILE)
**File**: `src/routes/goals/+page.server.ts` (NEW FILE)

**Layout**:
```
┌─────────────────────────────────────────┐
│ My Training Goals                       │
├─────────────────────────────────────────┤
│ [+ New Goal] button                     │
│                                          │
│ ┌────────────────────────────────────┐ │
│ │ Run 10km - May 3, 2026             │ │
│ │ Progress: 67% (8 weeks done)       │ │
│ │ Status: On Track ✓                 │ │
│ │ [Edit] [Delete] [View Plan]        │ │
│ └────────────────────────────────────┘ │
│                                          │
│ ┌────────────────────────────────────┐ │
│ │ Complete 5km in under 25 min       │ │
│ │ Target: June 15, 2026              │ │
│ │ Status: Active                     │ │
│ │ [Edit] [Delete] [View Plan]        │ │
│ └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Server Load** (`+page.server.ts`):
```typescript
export const load: PageServerLoad = async ({ locals }) => {
  const goals = await getActiveGoals(locals.db);
  
  // For each goal, calculate progress
  const goalsWithProgress = await Promise.all(
    goals.map(async (goal) => {
      const progress = await calculateGoalProgress(locals.db, goal.id);
      return { ...goal, progress };
    })
  );
  
  return { goals: goalsWithProgress };
};
```

---

### 3.2 Goal Creation Modal
**Component**: `src/lib/components/GoalModal.svelte` (NEW FILE)

**Props**:
```typescript
interface Props {
  open: boolean;
  goal?: TrainingGoal | null;  // For editing existing goal
  onClose: () => void;
  onSuccess: () => void;
}
```

**Form Fields**:
1. **Goal Name** (text input)
   - Placeholder: "e.g., Run my first 10km"
   
2. **Goal Type** (radio buttons)
   - Distance Goal (run X km)
   - Race Event (complete a race)
   - Time Goal (run X km in Y minutes)

3. **Target Date** (date picker)
   - Min: 8 weeks from today
   - Max: 1 year from today

4. **Target Distance** (number input)
   - Label: "Distance (km)"
   - Range: 1-42.2 km

5. **Target Time** (optional, for time goals)
   - Hours/Minutes inputs

6. **Description** (textarea, optional)
   - Placeholder: "Why is this goal important to you?"

**Validation**:
- Goal name: Required, max 100 chars
- Target date: Must be future, at least 8 weeks away
- Target distance: Required for distance/race goals
- No overlapping goals (warn if goals are within 2 weeks of each other)

---

### 3.3 Goal Progress Card
**Component**: `src/lib/components/GoalProgressCard.svelte` (NEW FILE)

**Display**:
```
┌────────────────────────────────────────┐
│ 🎯 Run 10km - May 3, 2026             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 67%    │
│                                        │
│ 📊 Progress:                          │
│   • 8 of 12 weeks completed           │
│   • 24 of 36 runs completed           │
│   • Longest run: 7.2km (target: 10km)│
│   • On track to meet goal ✓          │
│                                        │
│ 📅 Next Milestone:                    │
│   • Week 9: First 8km continuous run  │
│                                        │
│ [View Full Plan] [Edit Goal]          │
└────────────────────────────────────────┘
```

---

### 3.4 Update Navigation
**File**: `src/routes/+layout.svelte`

Add "Goals" link to main navigation:
```svelte
<a href="/goals" class:active={$page.url.pathname === '/goals'}>
  🎯 Goals
</a>
```

---

## Phase 4: Plan Regeneration with Historical Preservation

### 4.1 Enhanced Delete Logic
**File**: `src/lib/server/db.ts`

**Update**: `deleteOnlyFuturePlans()` (already described above)

**Add**: `getHistoricalWorkouts()` 
```typescript
// Get all completed/missed workouts for display
export async function getHistoricalWorkouts(
  db: Database,
  goalId?: string
): Promise<TrainingPlan[]> {
  const query = goalId
    ? "SELECT * FROM training_plan WHERE goal_id = ? AND status IN ('Completed', 'Missed') ORDER BY scheduled_date"
    : "SELECT * FROM training_plan WHERE status IN ('Completed', 'Missed') ORDER BY scheduled_date";
    
  return await db.prepare(query).bind(goalId).all<TrainingPlan>();
}
```

---

### 4.2 Regenerate with Preservation
**File**: `src/routes/api/plan/generate/+server.ts`

**Updated Logic**:
```typescript
export const POST: RequestHandler = async ({ locals, request }) => {
  const { goalId } = await request.json(); // Optional: specific goal to regenerate
  
  // 1. Get active goals
  const goals = await getActiveGoals(db);
  if (goals.length === 0) {
    // Fallback to legacy generation
    return await generateLegacyPlan(db);
  }
  
  const primaryGoal = goalId 
    ? await getGoalById(db, goalId)
    : goals[0]; // Use first goal as primary
  
  // 2. Delete ONLY future pending workouts (preserve history)
  await deleteOnlyFuturePlans(db);
  
  // 3. Delete old Garmin workouts (only for future dates)
  await deleteAllOpenCoachWorkouts(db);
  
  // 4. Generate new goal-based plan
  const plan = await generateGoalBasedPlan(db, {
    goalId: primaryGoal.id,
    goalDate: primaryGoal.target_date,
    goalDistance: primaryGoal.target_distance_km,
    currentFitness: await getSetting(db, 'CURRENT_FITNESS'),
    availableDays: JSON.parse(await getSetting(db, 'AVAILABLE_DAYS')),
    recentRuns: await getRecentRuns(db, 28), // Last 4 weeks
  });
  
  // 5. Insert new workouts
  for (const week of plan.weeks) {
    for (const workout of week.workouts) {
      await insertPlan(db, {
        ...workout,
        goal_id: primaryGoal.id,
        week_number: week.weekNumber,
        status: 'Pending',
      });
    }
  }
  
  // 6. Update metadata
  await setPlanMetadata(db, 'primary_goal_id', primaryGoal.id);
  await setPlanMetadata(db, 'generation_strategy', 'goal_based');
  await setPlanMetadata(db, 'total_weeks', plan.totalWeeks);
  
  return json({
    success: true,
    weeksGenerated: plan.totalWeeks,
    goalName: primaryGoal.name,
  });
};
```

---

## Phase 5: Smart Weekly Adjustments

### 5.1 Weekly Analysis Cron Job
**File**: `src/routes/api/cron/weekly-adjustment/+server.ts` (NEW FILE)

**Purpose**: Run every **Sunday at 8 PM** to analyze the week and adjust next week

```typescript
export const POST: RequestHandler = async ({ request, locals }) => {
  // Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const db = locals.db;
  
  // Get all active goals
  const goals = await getActiveGoals(db);
  
  for (const goal of goals) {
    // Analyze this week's performance
    const analysis = await analyzeWeeklyProgress(db, goal.id);
    
    console.log(`Goal: ${goal.name}, Status: ${analysis.recommendation}`);
    
    // Adjust next week based on performance
    await adjustNextWeek(db, goal.id, analysis);
    
    // Send notification if needed
    if (analysis.recommendation === 'add_makeup') {
      await sendPushNotification(db, {
        title: 'Plan Adjusted',
        body: `Added 1 extra easy run next week to stay on track for ${goal.name}`,
        tag: `weekly-adjustment-${goal.id}`,
        data: { url: '/goals' }
      });
    }
  }
  
  return json({ success: true, goalsAdjusted: goals.length });
};
```

**Add to cron.ts**:
```typescript
// Weekly plan adjustment - Sunday 8 PM
cron.schedule('0 20 * * 0', () => {
  callCronEndpoint('/api/cron/weekly-adjustment', 'Weekly Plan Adjustment');
});
```

---

### 5.2 Makeup Run Logic
**File**: `src/lib/server/adaptivePlanner.ts`

```typescript
export async function addMakeupRun(
  db: Database,
  goalId: string,
  weekNumber: number
): Promise<void> {
  // Find an available day next week that doesn't have a workout
  const nextWeekWorkouts = await getWorkoutsForWeek(db, weekNumber, goalId);
  const usedDays = nextWeekWorkouts.map(w => getDayOfWeek(w.scheduled_date));
  
  const availableDays = JSON.parse(await getSetting(db, 'AVAILABLE_DAYS'));
  const openDay = availableDays.find(day => !usedDays.includes(day));
  
  if (!openDay) {
    console.warn('No open days for makeup run, skipping');
    return;
  }
  
  // Add an easy recovery run
  const nextWeekStart = getWeekStartDate(weekNumber);
  const makeupDate = getDateForDay(nextWeekStart, openDay);
  
  await insertPlan(db, {
    id: crypto.randomUUID(),
    scheduled_date: makeupDate,
    week_number: weekNumber,
    type: 'Easy',
    target_distance_km: 3,  // Short 3km recovery run
    target_duration_minutes: 18, // ~6 min/km
    description: '🔄 Makeup Run: Easy 3km recovery',
    status: 'Pending',
    goal_id: goalId,
    google_event_id: null,
    garmin_workout_id: null,
  });
}
```

---

## Phase 6: Dashboard Integration

### 6.1 Show Active Goal on Dashboard
**File**: `src/routes/+page.svelte`

**Add Goal Card** (above training plan):
```svelte
{#if primaryGoal}
  <Card class="mb-8 border-forest-800/50 bg-linear-to-br from-forest-900 to-slate-900">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        🎯 <span>{primaryGoal.name}</span>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div class="mb-4">
        <div class="mb-1 flex justify-between text-sm">
          <span>Progress to Goal</span>
          <span>{progressPercent}%</span>
        </div>
        <div class="h-2 w-full rounded-full bg-slate-700">
          <div 
            class="h-full rounded-full bg-forest-500"
            style="width: {progressPercent}%"
          ></div>
        </div>
      </div>
      
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div class="text-slate-400">Target Date</div>
          <div class="font-semibold">{formatDate(primaryGoal.target_date)}</div>
        </div>
        <div>
          <div class="text-slate-400">Weeks Remaining</div>
          <div class="font-semibold">{weeksRemaining}</div>
        </div>
      </div>
      
      <a href="/goals" class="mt-4 inline-block text-forest-400 hover:underline">
        View all goals →
      </a>
    </CardContent>
  </Card>
{/if}
```

---

### 6.2 Update Consistency Chart
**File**: `src/routes/+page.svelte`

**Already Fixed**: Consistency chart now uses Monday-based weeks and counts from `data.runs` directly

**Enhancement**: Link consistency to goal timeline
```typescript
// Show consistency relative to goal start, not just last 8 weeks
function getConsistencyBars() {
  if (!primaryGoal) {
    // Use current logic (last 8 weeks)
    return getLastEightWeeks();
  }
  
  // Show consistency since goal was set
  const goalStartDate = new Date(primaryGoal.created_at);
  const weeksSinceStart = Math.floor((today - goalStartDate) / (7 * 24 * 60 * 60 * 1000));
  const weeksToShow = Math.min(weeksSinceStart, 8);
  
  // Generate bars for goal timeline
  return generateBarsForGoal(weeksToShow);
}
```

---

## Phase 7: API Endpoints

### 7.1 Goals CRUD Endpoints
**Files**: `src/routes/api/goals/+server.ts` (NEW)
          `src/routes/api/goals/[id]/+server.ts` (NEW)

**GET /api/goals** - List all goals
```typescript
export const GET: RequestHandler = async ({ locals }) => {
  const goals = await getActiveGoals(locals.db);
  return json({ goals });
};
```

**POST /api/goals** - Create new goal
```typescript
export const POST: RequestHandler = async ({ locals, request }) => {
  const goalData = await request.json();
  
  // Validation
  if (!goalData.name || !goalData.target_date || !goalData.target_distance_km) {
    return json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }
  
  const goalId = await createGoal(locals.db, {
    name: goalData.name,
    goal_type: goalData.goal_type || 'distance',
    target_date: goalData.target_date,
    target_distance_km: goalData.target_distance_km,
    target_duration_minutes: goalData.target_duration_minutes || null,
    description: goalData.description || null,
    status: 'active',
  });
  
  return json({ success: true, goalId });
};
```

**PATCH /api/goals/[id]** - Update goal
**DELETE /api/goals/[id]** - Delete goal

---

## Critical Files to Modify

### New Files:
1. `src/lib/server/goalBasedPlanner.ts` - Core goal-based plan generation
2. `src/lib/server/adaptivePlanner.ts` - Weekly adjustment logic
3. `src/routes/goals/+page.svelte` - Goals management UI
4. `src/routes/goals/+page.server.ts` - Goals data loading
5. `src/lib/components/GoalModal.svelte` - Create/edit goal modal
6. `src/lib/components/GoalProgressCard.svelte` - Goal progress display
7. `src/routes/api/goals/+server.ts` - Goals CRUD endpoint
8. `src/routes/api/goals/[id]/+server.ts` - Single goal operations
9. `src/routes/api/cron/weekly-adjustment/+server.ts` - Weekly cron job

### Modified Files:
1. `src/lib/server/db.ts` - Add `deleteOnlyFuturePlans`, `getHistoricalWorkouts`
2. `src/routes/api/plan/generate/+server.ts` - Switch to goal-based generation
3. `src/routes/+page.svelte` - Add goal progress card to dashboard
4. `src/routes/+page.server.ts` - Load primary goal data
5. `src/lib/server/cron.ts` - Add weekly adjustment cron job
6. `src/routes/+layout.svelte` - Add Goals navigation link

---

## Testing & Verification Plan

### Phase-by-Phase Testing:

**Phase 2: Plan Generation**
1. Create a test goal: "Run 10km on May 3, 2026"
2. Trigger plan generation via API
3. Verify:
   - ✓ Plan has correct number of weeks (calculate from today to May 3)
   - ✓ Workouts include taper weeks before May 3
   - ✓ Volume progression is realistic (10% max increase per week)
   - ✓ Long runs build up to 10km+ before taper
   - ✓ `goal_id` is set on all workouts

**Phase 3: Goals UI**
1. Navigate to `/goals`
2. Click "New Goal" button
3. Fill form and submit
4. Verify:
   - ✓ Goal appears in list
   - ✓ Progress shows 0%
   - ✓ "View Plan" navigates to training calendar
   - ✓ Edit button opens modal with pre-filled data
   - ✓ Delete shows confirmation and removes goal

**Phase 4: Plan Regeneration**
1. Complete 2 runs from current plan
2. Mark 1 run as "Missed"
3. Click "Regenerate Plan"
4. Verify:
   - ✓ Completed runs still visible in calendar
   - ✓ Missed run still visible in calendar
   - ✓ Future workouts are replaced with new plan
   - ✓ No duplicate workouts for past dates

**Phase 5: Weekly Adjustments**
1. Miss 2 runs in a week
2. Wait until Sunday 8 PM (or manually trigger cron)
3. Verify:
   - ✓ Notification received about plan adjustment
   - ✓ Next week has 1 additional easy run
   - ✓ Added run is on an available day
   - ✓ Run is marked as "Makeup Run" in description

**Phase 6: Dashboard Integration**
1. Check dashboard with active goal
2. Verify:
   - ✓ Goal card shows at top
   - ✓ Progress bar reflects actual completion %
   - ✓ Weeks remaining calculated correctly
   - ✓ "View all goals" link works

**End-to-End Scenario**:
1. User creates goal: "Run 5km on March 15, 2026"
2. System generates 10-week plan
3. User completes weeks 1-3 successfully
4. User misses both runs in week 4
5. System adds makeup run to week 5
6. User regenerates plan with new goal date (March 22)
7. Verify:
   - ✓ Weeks 1-3 history preserved
   - ✓ Week 4 missed runs preserved
   - ✓ Weeks 5-11 regenerated for new date
   - ✓ Volume still progresses safely

---

## Migration Strategy

### Backwards Compatibility:

**For users without goals**:
- System falls back to legacy `generateFullPlan()`
- No changes to current experience
- Can continue using 16-week fixed plans

**For users with existing plans**:
- First regeneration will prompt: "Set a goal to get personalized training"
- If user declines, continue with legacy mode
- If user creates goal, future regenerations use goal-based logic

**Settings migration**:
- `TARGET_DATE` setting maps to first goal's `target_date`
- On first goal creation, auto-populate from existing settings

---

## Rollout Plan

### Week 1: Infrastructure
- ✅ Database migration (DONE)
- ✅ Database helpers (DONE)
- Implement goal-based planner core algorithm
- Add tests for progression calculations

### Week 2: Generation Logic
- Update plan generation endpoint
- Implement `deleteOnlyFuturePlans`
- Test plan generation with various goal dates
- Ensure taper weeks are correctly placed

### Week 3: UI Development
- Create Goals page + server loader
- Build GoalModal component
- Implement Goals CRUD API endpoints
- Add navigation link

### Week 4: Adaptive Features
- Implement weekly analysis logic
- Create weekly adjustment cron job
- Build makeup run insertion
- Test adjustment scenarios

### Week 5: Dashboard & Polish
- Add goal card to dashboard
- Update consistency chart for goal tracking
- Final testing & bug fixes
- Documentation updates

---

## Success Criteria

✅ **Functional**:
- Users can create multiple goals
- Plans work backwards from goal dates
- Historical data (completed/missed) is never deleted
- Missed sessions trigger makeup runs
- Taper weeks automatically included before goal date

✅ **Quality**:
- No regression in existing plan features
- Plan progression is safe (max 10% volume increase)
- UI is intuitive and matches existing design
- All CRUD operations work without errors

✅ **Performance**:
- Plan generation completes in < 3 seconds
- Weekly adjustment cron runs in < 5 seconds
- Goals page loads in < 1 second

✅ **User Experience**:
- Clear visual feedback for goal progress
- Helpful notifications when plan adjusts
- Easy to understand what changed and why
- Confidence that history is preserved

---

## Risks & Mitigation

**Risk 1**: Complex algorithm leads to unrealistic plans
- *Mitigation*: Cap weekly volume increase at 10%, validate against safe training principles
- *Fallback*: Admin override to switch user back to legacy mode

**Risk 2**: Users create conflicting goals (2 races 1 week apart)
- *Mitigation*: Warn users when goals overlap within 2 weeks
- *Future*: Allow goal priorities (primary vs secondary)

**Risk 3**: Missed runs accumulate, plan becomes impossible
- *Mitigation*: After 3 consecutive missed weeks, suggest goal date extension
- *Notification*: "You've missed 6 runs. Consider extending your goal by 2 weeks?"

**Risk 4**: Historical data grows unbounded
- *Mitigation*: Archive workouts older than 1 year (soft delete, keep in DB)
- *Future*: Export to CSV feature for personal records

---

## Future Enhancements (Out of Scope)

- Multiple simultaneous goals with priority ranking
- Goal templates (e.g., "Couch to 5K", "Sub-30 5K")
- Social features (share goals with friends)
- Goal streaks & achievements
- Integration with race calendars (auto-import races)
- AI-generated goal recommendations based on fitness

---

## Summary

This plan transforms OpenCoach into a **goal-driven adaptive training platform** while:
- ✅ Preserving all historical data
- ✅ Maintaining backwards compatibility  
- ✅ Using hybrid structure (base plan + adaptive adjustments)
- ✅ Following safe training progression principles
- ✅ Providing clear user feedback and control

The implementation is phased, testable, and can be deployed incrementally without breaking existing functionality.