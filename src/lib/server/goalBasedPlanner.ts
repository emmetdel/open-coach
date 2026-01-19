import type { Database, Run, TrainingPlan } from "./db";

export interface PlanGenerationInput {
  goalId: string;
  goalDate: string;
  goalDistance: number;
  currentFitness: string;
  availableDays: string[];
  recentRuns: Run[];
}

export interface WeekPlan {
  weekNumber: number;
  weekStart: string;
  focus: "base_building" | "volume" | "peak" | "taper";
  targetVolume: number;
  workouts: WorkoutTemplate[];
  milestones?: string;
}

export interface WorkoutTemplate {
  id: string;
  scheduled_date: string;
  type: string;
  target_distance_km: number;
  target_duration_minutes: number;
  description: string;
  status: string;
  goal_id: string;
  google_event_id: string | null;
  garmin_workout_id: string | null;
}

export interface PlanGenerationResult {
  weeks: WeekPlan[];
  totalWeeks: number;
  planName: string;
}

/**
 * Main function to generate a goal-based training plan
 */
export async function generateGoalBasedPlan(
  db: Database,
  input: PlanGenerationInput,
): Promise<PlanGenerationResult> {
  // 1. Calculate Training Timeline
  const today = new Date();
  const planStart = getNextMonday(today);
  const goalDate = new Date(input.goalDate);
  const weeksAvailable = Math.floor(
    (goalDate.getTime() - planStart.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );

  const minWeeks = 8;
  const maxWeeks = 20;
  const totalWeeks = Math.min(Math.max(weeksAvailable, minWeeks), maxWeeks);

  // 2. Assess Current Fitness Level
  const recentVolume = calculateAverageWeeklyVolume(input.recentRuns);
  const longestRun = findLongestRun(input.recentRuns);
  const currentCapacity = {
    weeklyVolume: recentVolume || 10, // Default 10km/week if no data
    longestDistance: longestRun || 3, // Default 3km if no data
  };

  // 3. Calculate Required Progression
  const targetWeeklyVolume = input.goalDistance * 2; // 2x goal distance per week at peak
  const volumeProgression =
    (targetWeeklyVolume - currentCapacity.weeklyVolume) / totalWeeks;

  // Build-up should be max 10% per week (safe progression)
  const safeProgression = Math.max(1, currentCapacity.weeklyVolume * 0.1);
  const weeklyIncrease = Math.min(volumeProgression, safeProgression);

  // 4. Structure Plan into Phases
  const phases = {
    base: Math.floor(totalWeeks * 0.4), // 40% - Build aerobic base
    volume: Math.floor(totalWeeks * 0.35), // 35% - Increase distance
    peak: Math.floor(totalWeeks * 0.15), // 15% - Peak training
    taper: Math.floor(totalWeeks * 0.1), // 10% - Taper for race
  };

  // Adjust phases to ensure they sum to totalWeeks
  const phaseSum = phases.base + phases.volume + phases.peak + phases.taper;
  if (phaseSum < totalWeeks) {
    phases.base += totalWeeks - phaseSum;
  }

  // 5. Generate Week-by-Week Plan
  const weekPlans: WeekPlan[] = [];
  let currentVolume = currentCapacity.weeklyVolume;
  let currentLongRun = currentCapacity.longestDistance;

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = determinePhase(week, phases);
    const targetVolume = calculateWeekVolume(
      week,
      currentCapacity,
      currentVolume,
      weeklyIncrease,
      phase,
      phases,
    );
    const weekStart = getWeekStartDate(planStart, week);
    const workouts = distributeVolumeAcrossDays(
      targetVolume,
      currentLongRun,
      input.availableDays,
      phase,
      weekStart,
      week,
      input.goalId,
    );
    const weekLongRun = Math.max(
      ...workouts.map((w) => (w.type === "Long" ? w.target_distance_km : 0)),
    );

    weekPlans.push({
      weekNumber: week,
      weekStart: weekStart.toISOString().split("T")[0],
      focus: phase,
      targetVolume,
      workouts,
      milestones: getMilestoneForWeek(
        week,
        phase,
        totalWeeks,
        input.goalDistance,
      ),
    });

    currentVolume = targetVolume;
    currentLongRun = Math.max(currentLongRun, weekLongRun || currentLongRun);
  }

  return {
    weeks: weekPlans,
    totalWeeks,
    planName: `${input.goalDistance}km Training Plan`,
  };
}

/**
 * Calculate average weekly volume from recent runs
 */
function calculateAverageWeeklyVolume(runs: Run[]): number {
  if (runs.length === 0) return 0;

  const totalDistance = runs.reduce(
    (sum, run) => sum + run.distance_meters / 1000,
    0,
  );
  // Get date range of runs
  const dates = runs.map((r) => new Date(r.date));
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  const weeks = Math.max(
    1,
    (maxDate.getTime() - minDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );

  return totalDistance / weeks;
}

/**
 * Find the longest run in recent history
 */
function findLongestRun(runs: Run[]): number {
  if (runs.length === 0) return 0;
  return Math.max(...runs.map((r) => r.distance_meters / 1000));
}

/**
 * Determine which training phase a given week falls into
 */
function determinePhase(
  week: number,
  phases: { base: number; volume: number; peak: number; taper: number },
): "base_building" | "volume" | "peak" | "taper" {
  if (week <= phases.base) return "base_building";
  if (week <= phases.base + phases.volume) return "volume";
  if (week <= phases.base + phases.volume + phases.peak) return "peak";
  return "taper";
}

/**
 * Calculate target volume for a specific week
 */
function calculateWeekVolume(
  week: number,
  currentCapacity: { weeklyVolume: number; longestDistance: number },
  currentWeeklyVolume: number,
  weeklyIncrease: number,
  phase: "base_building" | "volume" | "peak" | "taper",
  phases: { base: number; volume: number; peak: number; taper: number },
): number {
  const volumePhaseEndWeek = phases.base + phases.volume;
  const peakVolume =
    currentCapacity.weeklyVolume + (volumePhaseEndWeek - 1) * weeklyIncrease;

  let volume = 0;

  // Adjust based on phase
  switch (phase) {
    case "base_building":
    case "volume":
      volume = currentCapacity.weeklyVolume + (week - 1) * weeklyIncrease;
      break;
    case "peak":
      volume = peakVolume;
      break;
    case "taper": {
      // Reduce volume by 15% each week relative to peak
      const weeksIntoTaper = week - (phases.base + phases.volume + phases.peak);
      volume = peakVolume * Math.pow(0.85, weeksIntoTaper);
      break;
    }
  }

  const maxIncrease = Math.max(1, currentWeeklyVolume * 0.1);
  const capped = Math.min(volume, currentWeeklyVolume + maxIncrease);
  return Math.max(capped, 10); // Minimum 10km per week
}

/**
 * Distribute weekly volume across available training days
 */
function distributeVolumeAcrossDays(
  targetVolume: number,
  lastLongRun: number,
  availableDays: string[],
  phase: "base_building" | "volume" | "peak" | "taper",
  weekStart: Date,
  weekNumber: number,
  goalId: string,
): WorkoutTemplate[] {
  const workouts: WorkoutTemplate[] = [];
  const daysPerWeek = availableDays.length;

  if (daysPerWeek === 0) return workouts;

  // Calculate distances for each workout
  const longRunFraction =
    daysPerWeek <= 2 ? 0.5 : daysPerWeek === 3 ? 0.4 : 0.35;
  const maxLongRun = Math.max(lastLongRun * 1.1, lastLongRun + 0.5);
  let longRunDistance = Math.min(targetVolume * longRunFraction, maxLongRun);
  longRunDistance = Math.max(longRunDistance, Math.min(targetVolume, 2));
  if (daysPerWeek === 1) {
    longRunDistance = targetVolume;
  }

  const remainingVolume = Math.max(0, targetVolume - longRunDistance);
  const easyRunDistance =
    daysPerWeek > 1 ? remainingVolume / (daysPerWeek - 1) : 0;

  // Map day names to offsets from week start (Monday)
  const dayOffsets: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4,
    Saturday: 5,
    Sunday: 6,
  };

  const normalizedDays = availableDays
    .map((day) => normalizeDayName(day))
    .filter((day): day is string => !!day);

  // Sort available days by their offset
  const sortedDays = [...normalizedDays].sort(
    (a, b) => dayOffsets[a] - dayOffsets[b],
  );

  // Last day is long run day
  const longRunDay = sortedDays[sortedDays.length - 1];
  const intervalDay =
    phase === "peak" && daysPerWeek >= 3 ? sortedDays[1] : null;

  sortedDays.forEach((day, index) => {
    const isLongRun = day === longRunDay;
    const isIntervalDay = intervalDay === day;
    const distance = isLongRun ? longRunDistance : easyRunDistance;
    const duration = Math.round(distance * 6); // ~6 min/km pace

    let type: string;
    let description: string;

    if (isLongRun) {
      type = "Long";
      description = getLongRunDescription(phase, distance);
    } else if (isIntervalDay) {
      type = "Interval";
      description = "Interval session - controlled effort with full recoveries";
    } else if (index === 0) {
      type = "Easy";
      description = "Easy recovery run - focus on form";
    } else {
      type = "Easy";
      description = "Easy run - conversational pace";
    }

    const scheduledDate = new Date(weekStart);
    const dayOffset = dayOffsets[day];
    if (dayOffset === undefined) {
      return;
    }
    scheduledDate.setDate(scheduledDate.getDate() + dayOffset);

    workouts.push({
      id: crypto.randomUUID(),
      scheduled_date: scheduledDate.toISOString().split("T")[0],
      type,
      target_distance_km: Math.round(distance * 10) / 10,
      target_duration_minutes: duration,
      description,
      status: "Pending",
      goal_id: goalId,
      google_event_id: null,
      garmin_workout_id: null,
    });
  });

  return workouts;
}

/**
 * Get description for long run based on phase
 */
function getLongRunDescription(
  phase: "base_building" | "volume" | "peak" | "taper",
  distance: number,
): string {
  switch (phase) {
    case "base_building":
      return `Long run - build endurance (${distance.toFixed(1)}km)`;
    case "volume":
      return `Long run - increase distance (${distance.toFixed(1)}km)`;
    case "peak":
      return `Peak long run - race simulation (${distance.toFixed(1)}km)`;
    case "taper":
      return `Taper run - stay fresh (${distance.toFixed(1)}km)`;
  }
}

/**
 * Get milestone for a specific week
 */
function getMilestoneForWeek(
  week: number,
  phase: "base_building" | "volume" | "peak" | "taper",
  totalWeeks: number,
  goalDistance: number,
): string | undefined {
  const milestones: { [key: number]: string } = {};

  if (goalDistance >= 5) {
    milestones[4] = "First continuous 5km run";
  } else {
    milestones[4] = `Comfortable ${goalDistance / 2}km run`;
  }

  milestones[8] = `Half-way to ${goalDistance}km`;

  // Add dynamic milestones
  const peakWeek = Math.floor(totalWeeks * 0.7);
  milestones[peakWeek] = "Peak week - longest training run";
  milestones[totalWeeks] = "Race week - taper complete!";

  return milestones[week];
}

/**
 * Get the start date for a specific week
 */
function getWeekStartDate(startDate: Date, weekNumber: number): Date {
  const weekStart = new Date(startDate);
  const day = weekStart.getDay();
  const diff = day === 0 ? 6 : day - 1; // Days since Monday (0-6)
  weekStart.setDate(weekStart.getDate() - diff + (weekNumber - 1) * 7);
  return weekStart;
}

function getNextMonday(date: Date): Date {
  const day = date.getDay();
  const daysUntilMonday = day === 0 ? 1 : (8 - day) % 7 || 7;
  const nextMonday = new Date(date);
  nextMonday.setDate(date.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday;
}

function normalizeDayName(day: string): string | null {
  const trimmed = day.trim();
  const short = trimmed.slice(0, 3);
  const upperShort = short[0]?.toUpperCase() + short.slice(1).toLowerCase();
  const valid = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  if (valid.includes(upperShort)) {
    return upperShort;
  }
  const full = trimmed[0]?.toUpperCase() + trimmed.slice(1).toLowerCase();
  if (["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].includes(full)) {
    return full;
  }
  return null;
}
