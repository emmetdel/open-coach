import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { fetchRecentRuns } from "$lib/server/garmin";
import { updateRunPolyline } from "$lib/server/db";

export const POST: RequestHandler = async ({ locals }) => {
  const db = locals.db;

  if (!db || !locals.user) {
    return json(
      { success: false, error: "Database not available" },
      { status: 500 },
    );
  }
  const userId = locals.user.id;

  try {
    // Fetch recent runs from Garmin (this will include polylines with our new code)
    const runs = await fetchRecentRuns(db, userId, 20);

    // Update polylines for runs that have them
    let updated = 0;
    for (const run of runs) {
      if (run.map_polyline) {
        console.log(`Polyline typeof:`, typeof run.map_polyline);
        console.log(
          `Polyline preview:`,
          JSON.stringify(run.map_polyline).substring(0, 100),
        );

        // Convert to string if it's not already
        const polylineStr =
          typeof run.map_polyline === "string"
            ? run.map_polyline
            : JSON.stringify(run.map_polyline);

        console.log(
          `Updating ${run.garmin_activity_id} with polyline string (${polylineStr.length} chars)`,
        );
        await updateRunPolyline(
          db,
          userId,
          run.garmin_activity_id,
          polylineStr,
        );
        updated++;
      } else {
        console.log(`Run ${run.garmin_activity_id} has no polyline`);
      }
    }

    return json({
      success: true,
      message: `Updated ${updated} run polylines`,
      updated,
    });
  } catch (err) {
    console.error("Backfill polylines error:", err);
    return json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
};
