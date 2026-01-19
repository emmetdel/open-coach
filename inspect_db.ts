
import { Database } from "bun:sqlite";

const db = new Database("./data/opencoach.db");

// 1. Get Active Goals
console.log("=== Active Goals ===");
const goals = db.query("SELECT * FROM training_goals WHERE status = 'active'").all();
console.table(goals);

if (goals.length > 0) {
    const goal = goals[0] as any;
    console.log(`\nChecking runs for Goal: ${goal.name} (Created: ${goal.created_at}, Target: ${goal.target_date})`);
    
    // 2. Get Runs since goal creation (or just all runs for visibility)
    console.log("\n=== Recent Runs ===");
    // Get runs from 30 days before goal creation to now
    const runs = db.query(`SELECT * FROM runs ORDER BY date DESC LIMIT 10`).all();
    console.table(runs);

    // 3. Get Training Plans for this goal
    console.log(`\n=== Training Plans for Goal ${goal.id} ===`);
    const plans = db.query(`SELECT id, scheduled_date, type, status FROM training_plan WHERE goal_id = '${goal.id}' ORDER BY scheduled_date LIMIT 10`).all();
    console.table(plans);

    // 4. Check for completed plans
    const completedPlans = plans.filter((p: any) => p.status === 'Completed');
    console.log(`\nCompleted Plans: ${completedPlans.length}`);
} else {
    console.log("No active goals found.");
}
