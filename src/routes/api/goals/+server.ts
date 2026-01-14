import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActiveGoals, createGoal } from '$lib/server/db';

// GET /api/goals - List all goals
export const GET: RequestHandler = async ({ locals }) => {
  const db = locals.db;
  if (!db) {
    throw error(500, 'Database not available');
  }

  try {
    const goals = await getActiveGoals(db);
    return json({ goals });
  } catch (err) {
    console.error('Failed to fetch goals:', err);
    throw error(500, 'Failed to fetch goals');
  }
};

// POST /api/goals - Create new goal
export const POST: RequestHandler = async ({ locals, request }) => {
  const db = locals.db;
  if (!db) {
    throw error(500, 'Database not available');
  }

  try {
    const goalData = await request.json();

    // Validation
    if (!goalData.name || !goalData.target_date || !goalData.target_distance_km) {
      return json(
        { success: false, error: 'Missing required fields: name, target_date, target_distance_km' },
        { status: 400 }
      );
    }

    // Validate target date is at least 8 weeks in the future
    const targetDate = new Date(goalData.target_date);
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 56); // 8 weeks

    if (targetDate < minDate) {
      return json(
        { success: false, error: 'Target date must be at least 8 weeks in the future' },
        { status: 400 }
      );
    }

    // Validate target distance
    if (goalData.target_distance_km < 1 || goalData.target_distance_km > 42.2) {
      return json(
        { success: false, error: 'Target distance must be between 1 and 42.2 km' },
        { status: 400 }
      );
    }

    const goalId = await createGoal(db, {
      name: goalData.name,
      goal_type: goalData.goal_type || 'distance',
      target_date: goalData.target_date,
      target_distance_km: goalData.target_distance_km,
      target_duration_minutes: goalData.target_duration_minutes || null,
      description: goalData.description || null,
      status: 'active',
    });

    return json({
      success: true,
      goalId,
      message: 'Goal created successfully'
    });
  } catch (err) {
    console.error('Failed to create goal:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json(
      { success: false, error: message },
      { status: 500 }
    );
  }
};
