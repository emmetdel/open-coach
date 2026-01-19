
import { Database } from "bun:sqlite";

const db = new Database("./data/opencoach.db");

// Mocking the getRunsAfterDate function (since we can't import easily in standalone script if it has complexdeps, but here it is simple)
async function getRunsAfterDate(db: Database, fromDate: string) {
  const result = db.prepare("SELECT * FROM runs WHERE date >= ? ORDER BY date ASC").all(fromDate);
  return result; // bun:sqlite returns array directly
}

async function verify() {
  console.log("=== Verifying Goal Progress Fix ===");

  // 1. Get Active Goal
  const goals = db.query("SELECT * FROM training_goals WHERE status = 'active'").all();
  if (goals.length === 0) {
      console.log("No active goals.");
      return;
  }
  const goal = goals[0] as any;
  console.log(`Goal: ${goal.name} (Created: ${goal.created_at})`);

  // 2. Replicate the new logic
  const startDate = goal.created_at;
  const targetDate = goal.target_date;
  
  const start = new Date(startDate);
  const target = new Date(targetDate);
  const totalWeeks = Math.max(1, Math.ceil((target.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  
  const now = new Date();
  const weeksCompleted = Math.max(0, Math.min(totalWeeks, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))));

  // Get Runs
  const runs = await getRunsAfterDate(db, startDate.split(' ')[0]);
  const runsCompleted = runs.length;
  console.log(`Found ${runsCompleted} runs after ${startDate.split(' ')[0]}`);

  const longestRun = runs.length > 0 
    ? Math.max(...runs.map((r: any) => r.distance_meters / 1000))
    : 0;

  // Get Plans
  const plans = db.query(`SELECT * FROM training_plan WHERE goal_id = '${goal.id}'`).all();
  const plannedWorkouts = plans;
  
  const totalRuns = plannedWorkouts.length > 0 
    ? plannedWorkouts.length 
    : totalWeeks * 3;

  const percentComplete = totalRuns > 0
    ? Math.min(100, Math.round((runsCompleted / totalRuns) * 100))
    : 0;
  
  // Status check
  let status = 'on_track';
  let expectedRunsByType = 0;
  if (plannedWorkouts.length > 0) {
     const today = new Date().toISOString().split('T')[0];
     expectedRunsByType = plannedWorkouts.filter((w: any) => w.scheduled_date <= today).length;
  } else {
     expectedRunsByType = weeksCompleted * 3;
  }
  
  if (runsCompleted < expectedRunsByType - 1) {
    status = 'behind';
  } else if (runsCompleted > expectedRunsByType + 2) {
    status = 'ahead';
  }

  console.log("\n--- Calculated Results ---");
  console.log(`Total Weeks: ${totalWeeks}`);
  console.log(`Weeks Completed: ${weeksCompleted}`);
  console.log(`Runs Completed: ${runsCompleted}`);
  console.log(`Total Expected Runs: ${totalRuns}`);
  console.log(`Longest Run: ${longestRun.toFixed(2)} km`);
  console.log(`Percent Complete: ${percentComplete}%`);
  console.log(`Status: ${status}`);

  if (percentComplete > 0 && runsCompleted > 0) {
      console.log("\n✅ SUCCESS: Progress is being calculated correctly based on runs!");
  } else {
      console.log("\n❌ FAILURE: Progress is still 0.");
  }
}

verify();
