// Cron service using node-cron for scheduled tasks

import cron from "node-cron";
import { getDb } from "./db";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Helper to call internal API endpoints
async function callCronEndpoint(
  path: string,
  name: string,
  method: "GET" | "POST" = "GET",
): Promise<void> {
  try {
    console.log(`[Cron] Running ${name}...`);
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "X-Cron-Secret": process.env.CRON_SECRET || "local-dev",
      },
    });

    if (!response.ok) {
      console.error(
        `[Cron] ${name} failed:`,
        response.status,
        await response.text(),
      );
    } else {
      const result = await response.json();
      console.log(`[Cron] ${name} completed:`, result);
    }
  } catch (error) {
    console.error(`[Cron] ${name} error:`, error);
  }
}

// Schedule all cron jobs
export function startCronJobs(): void {
  console.log("[Cron] Starting scheduled tasks...");

  // Token refresh - Every 30 minutes
  // "*/30 * * * *"
  cron.schedule("*/30 * * * *", () => {
    callCronEndpoint("/api/cron/refresh-tokens", "Token Refresh");
  });

  // Sync loop - Every 4 hours
  // "0 */4 * * *"
  cron.schedule("0 */4 * * *", () => {
    callCronEndpoint("/api/cron/sync", "Garmin Sync");
  });

  // Morning reminder + Rescheduler - 7 AM daily
  // "0 7 * * *"
  cron.schedule("0 7 * * *", () => {
    callCronEndpoint("/api/cron/reminders", "Morning Reminder");
  });

  // Evening reminder - 8 PM daily
  // "0 20 * * *"
  cron.schedule("0 20 * * *", () => {
    callCronEndpoint("/api/cron/reminders", "Evening Reminder");
  });

  // Planner - Sunday 8 PM
  // "0 20 * * 0"
  cron.schedule("0 20 * * 0", () => {
    callCronEndpoint("/api/plan", "Weekly Planner", "POST");
  });

  // Weekly adjustment - Sunday 8:30 PM (after planner)
  // "30 20 * * 0"
  cron.schedule("30 20 * * 0", () => {
    callCronEndpoint(
      "/api/cron/weekly-adjustment",
      "Weekly Plan Adjustment",
      "POST",
    );
  });

  // Check for missed runs - 9 AM daily
  // "0 9 * * *"
  cron.schedule("0 9 * * *", () => {
    callCronEndpoint("/api/cron/check-missed", "Missed Run Check", "POST");
  });

  console.log("[Cron] Scheduled tasks:");
  console.log("  - Token refresh: every 30 min");
  console.log("  - Garmin sync: every 4 hours");
  console.log("  - Morning reminder: 7 AM daily");
  console.log("  - Evening reminder: 8 PM daily");
  console.log("  - Weekly planner: Sunday 8 PM");
  console.log("  - Weekly adjustment: Sunday 8:30 PM");
  console.log("  - Missed run check: 9 AM daily");
}

// Stop all cron jobs (for graceful shutdown)
export function stopCronJobs(): void {
  console.log("[Cron] Stopping scheduled tasks...");
  cron.getTasks().forEach((task) => task.stop());
}
