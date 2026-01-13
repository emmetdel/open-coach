// Cron endpoint: Check for missed runs
// Runs daily to detect workouts that weren't completed

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { detectMissedRuns, checkConsistency } from "$lib/server/intelligence";
import { sendPushNotification } from "$lib/server/notifications";

export const POST: RequestHandler = async ({ request, locals }) => {
  const db = locals.db;
  if (!db) {
    return json({ error: "Database not available" }, { status: 500 });
  }

  // Verify cron secret
  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET || "local-dev";

  if (cronSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Detect missed runs from yesterday
    const missedResult = await detectMissedRuns(db);

    // Check overall consistency
    const consistency = await checkConsistency(db);

    // Send encouragement if user needs it (hasn't run in 5+ days)
    if (consistency.needsEncouragement && consistency.lastRunDaysAgo >= 5) {
      try {
        await sendPushNotification(db, {
          title: `It's been ${consistency.lastRunDaysAgo} days... 🏃`,
          body: `No pressure! Just checking in. Ready to get back out there?`,
          tag: "encouragement",
          data: { url: "/" },
        });
      } catch (err) {
        console.warn("Failed to send encouragement notification:", err);
      }
    }

    return json({
      success: true,
      missedRuns: missedResult.missedRuns.length,
      notificationsSent: missedResult.notificationsSent,
      streak: consistency.streak,
      lastRunDaysAgo: consistency.lastRunDaysAgo,
      encouragementSent:
        consistency.needsEncouragement && consistency.lastRunDaysAgo >= 5,
    });
  } catch (error: any) {
    console.error("Check missed runs error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};
