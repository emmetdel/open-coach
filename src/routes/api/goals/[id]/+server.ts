import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGoalById, updateGoal, deleteGoal } from '$lib/server/db';

// GET /api/goals/[id] - Get a specific goal
export const GET: RequestHandler = async ({ locals, params }) => {
  const db = locals.db;
  if (!db || !locals.user) {
    throw error(500, 'Database not available');
  }
  const userId = locals.user.id;

  try {
    const goal = await getGoalById(db, userId, params.id);

    if (!goal) {
      throw error(404, 'Goal not found');
    }

    return json({ goal });
  } catch (err) {
    console.error('Failed to fetch goal:', err);
    if (err instanceof Error && err.message.includes('not found')) {
      throw err;
    }
    throw error(500, 'Failed to fetch goal');
  }
};

// PATCH /api/goals/[id] - Update a goal
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const db = locals.db;
  if (!db || !locals.user) {
    throw error(500, 'Database not available');
  }
  const userId = locals.user.id;

  try {
    // Check if goal exists
    const existingGoal = await getGoalById(db, userId, params.id);
    if (!existingGoal) {
      throw error(404, 'Goal not found');
    }

    const updates = await request.json();

    // Validate target date if provided
    if (updates.target_date) {
      const targetDate = new Date(updates.target_date);
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 56); // 8 weeks

      if (targetDate < minDate) {
        return json(
          { success: false, error: 'Target date must be at least 8 weeks in the future' },
          { status: 400 }
        );
      }
    }

    // Validate target distance if provided
    if (updates.target_distance_km !== undefined) {
      if (updates.target_distance_km < 1 || updates.target_distance_km > 42.2) {
        return json(
          { success: false, error: 'Target distance must be between 1 and 42.2 km' },
          { status: 400 }
        );
      }
    }

    await updateGoal(db, userId, params.id, updates);

    return json({
      success: true,
      message: 'Goal updated successfully'
    });
  } catch (err) {
    console.error('Failed to update goal:', err);
    if (err instanceof Error && err.message.includes('not found')) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json(
      { success: false, error: message },
      { status: 500 }
    );
  }
};

// DELETE /api/goals/[id] - Delete a goal
export const DELETE: RequestHandler = async ({ locals, params }) => {
  const db = locals.db;
  if (!db || !locals.user) {
    throw error(500, 'Database not available');
  }
  const userId = locals.user.id;

  try {
    // Check if goal exists
    const existingGoal = await getGoalById(db, userId, params.id);
    if (!existingGoal) {
      throw error(404, 'Goal not found');
    }

    await deleteGoal(db, userId, params.id);

    return json({
      success: true,
      message: 'Goal deleted successfully'
    });
  } catch (err) {
    console.error('Failed to delete goal:', err);
    if (err instanceof Error && err.message.includes('not found')) {
      throw err;
    }
    throw error(500, 'Failed to delete goal');
  }
};
