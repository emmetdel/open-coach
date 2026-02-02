// Cron endpoint: Check for missed runs
// Runs daily to detect workouts that weren't completed

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { detectMissedRuns, checkConsistency } from "$lib/server/intelligence";
import { sendPushNotification } from "$lib/server/notifications";
import { listUsers } from "$lib/server/db";
import { isCronAuthorized } from "$lib/server/cronAuth";

export const POST: RequestHandler = async ({ request, locals }) => {
  const db = locals.db;
  if (!db) {
    return json({ error: "Database not available" }, { status: 500 });
  }

  // Verify cron secret
  if (!isCronAuthorized(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await listUsers(db);
    let missedTotal = 0;
    let notificationsSent = 0;
    let encouragementSent = 0;

    for (const user of users) {
      const missedResult = await detectMissedRuns(db, user.id);
      missedTotal += missedResult.missedRuns.length;
      notificationsSent += missedResult.notificationsSent;

      const consistency = await checkConsistency(db, user.id);
      if (consistency.needsEncouragement && consistency.lastRunDaysAgo >= 5) {
        try {
          await sendPushNotification(db, user.id, {
            title: `It's been ${consistency.lastRunDaysAgo} days... 🏃`,
            body: `No pressure! Just checking in. Ready to get back out there?`,
            tag: "encouragement",
            data: { url: "/" },
          });
          encouragementSent++;
        } catch (err) {
          console.warn("Failed to send encouragement notification:", err);
        }
      }
    }

    return json({
      success: true,
      missedRuns: missedTotal,
      notificationsSent,
      encouragementSent: encouragementSent > 0,
    });
  } catch (error: any) {
    console.error("Check missed runs error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};
