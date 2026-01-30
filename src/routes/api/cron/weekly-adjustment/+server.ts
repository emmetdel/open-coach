import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActiveGoals, listUsers } from '$lib/server/db';
import { analyzeWeeklyProgress, adjustNextWeek } from '$lib/server/adaptivePlanner';
import { sendPushNotification } from '$lib/server/notifications';
import { isCronAuthorized } from '$lib/server/cronAuth';

// POST /api/cron/weekly-adjustment - Weekly plan adjustment cron job
export const POST: RequestHandler = async ({ request, locals }) => {
  // Verify cron secret
  if (!isCronAuthorized(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = locals.db;
  if (!db) {
    throw error(500, 'Database not available');
  }

  try {
    let goalsAdjusted = 0;

    const users = await listUsers(db);

    for (const user of users) {
      const goals = await getActiveGoals(db, user.id);

      for (const goal of goals) {
        const analysis = await analyzeWeeklyProgress(db, user.id, goal.id);

        console.log(`Goal: ${goal.name}, Status: ${analysis.recommendation}`);

        await adjustNextWeek(db, user.id, goal.id, analysis);

        if (analysis.recommendation === 'add_makeup') {
          await sendPushNotification(db, user.id, {
            title: 'Plan Adjusted',
            body: `Added 1 extra easy run next week to stay on track for ${goal.name}`,
            tag: `weekly-adjustment-${goal.id}`,
            data: { url: '/goals' }
          });
        } else if (analysis.recommendation === 'extend_timeline') {
          await sendPushNotification(db, user.id, {
            title: 'Goal Extended',
            body: `Your goal date for ${goal.name} has been extended by 1 week to help you stay on track`,
            tag: `goal-extended-${goal.id}`,
            data: { url: '/goals' }
          });
        }

        goalsAdjusted++;
      }
    }

    return json({
      success: true,
      goalsAdjusted,
      message: `Analyzed and adjusted ${goalsAdjusted} goal(s)`
    });
  } catch (err) {
    console.error('Weekly adjustment failed:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({
      success: false,
      error: message
    }, { status: 500 });
  }
};
