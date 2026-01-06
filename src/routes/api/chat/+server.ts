import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSetting, SETTING_KEYS, getRecentRuns, getUpcomingPlans } from '$lib/server/db';
import { getHealthSnapshot } from '$lib/server/garmin';

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
}

// POST: Send a message to the AI coach
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const { message, history = [] } = await request.json();

	if (!message || typeof message !== 'string') {
		throw error(400, 'Message is required');
	}

	// Get OpenRouter API key
	const apiKey = process.env.OPENROUTER_API_KEY || (await getSetting(db, SETTING_KEYS.OPENROUTER_KEY));
	if (!apiKey) {
		return json({
			success: false,
			error: 'OpenRouter API key not configured. Add OPENROUTER_API_KEY to your environment.'
		});
	}

	try {
		// Gather context about the user's training and health
		const [recentRuns, upcomingPlans, targetDate, currentFitness, todayHealth] = await Promise.all([
			getRecentRuns(db, 10),
			getUpcomingPlans(db),
			getSetting(db, SETTING_KEYS.TARGET_DATE),
			getSetting(db, SETTING_KEYS.CURRENT_FITNESS),
			getHealthSnapshot(db)
		]);

		// Build context summary
		const contextParts: string[] = [];

		if (targetDate) {
			contextParts.push(`Goal: Target date is ${targetDate}`);
		}

		if (currentFitness) {
			contextParts.push(`Fitness level: ${currentFitness}`);
		}

		// Today's health data (very important for training recommendations)
		if (todayHealth) {
			const healthParts: string[] = [];
			
			if (todayHealth.sleep) {
				healthParts.push(`Sleep: ${todayHealth.sleep.durationHours}hrs (${todayHealth.sleep.quality})`);
				if (todayHealth.sleep.deepSleepMinutes) {
					healthParts.push(`Deep sleep: ${todayHealth.sleep.deepSleepMinutes}min`);
				}
			}
			
			if (todayHealth.hrv) {
				healthParts.push(`HRV: ${todayHealth.hrv.avg}ms (${todayHealth.hrv.status})`);
			}
			
			if (todayHealth.bodyBattery) {
				healthParts.push(`Body Battery: ${todayHealth.bodyBattery.morning}/100 (${todayHealth.bodyBattery.change >= 0 ? '+' : ''}${todayHealth.bodyBattery.change} overnight)`);
			}
			
			if (todayHealth.restingHR) {
				healthParts.push(`Resting HR: ${todayHealth.restingHR}bpm`);
			}
			
			if (todayHealth.steps) {
				healthParts.push(`Steps today: ${todayHealth.steps.toLocaleString()}`);
			}
			
			if (healthParts.length > 0) {
				contextParts.push(`Today's health data:\n${healthParts.map(h => `- ${h}`).join('\n')}`);
			}
		}

		if (recentRuns.length > 0) {
			const runsSummary = recentRuns.map((r) => {
				const km = (r.distance_meters / 1000).toFixed(1);
				const mins = Math.round(r.duration_seconds / 60);
				const date = r.date.split('T')[0];
				const hr = r.avg_hr ? ` @ ${r.avg_hr}bpm` : '';
				return `- ${date}: ${km}km in ${mins}min${hr}`;
			});
			contextParts.push(`Recent runs:\n${runsSummary.join('\n')}`);
		}

		if (upcomingPlans.length > 0) {
			const planSummary = upcomingPlans.map((p) => {
				const dist = p.target_distance_km ? `${p.target_distance_km}km` : '';
				const dur = p.target_duration_minutes ? `${p.target_duration_minutes}min` : '';
				return `- ${p.scheduled_date}: ${p.type} ${dist || dur}`;
			});
			contextParts.push(`Upcoming workouts:\n${planSummary.join('\n')}`);
		}

		const context = contextParts.join('\n\n');

		// Build messages array
		const systemPrompt = `You are a friendly, supportive running coach assistant for OpenCoach. 
You help users understand their training, answer questions about their runs, and provide encouragement.

${context ? `Here's what you know about this user:\n${context}` : 'No training data available yet.'}

Guidelines:
- Be concise but helpful (2-3 sentences unless more detail is needed)
- Focus on encouragement and practical advice
- Use health data to personalize recommendations:
  - Low HRV or poor sleep → suggest easier workout or extra rest
  - Low Body Battery (<30) → recommend recovery day
  - Elevated resting HR (+5bpm above normal) → sign of stress/overtraining
  - Good recovery metrics → encourage pushing a bit harder
- If asked to modify the plan, explain what they can do (go to /setup to change days, regenerate plan)
- Use a conversational, supportive tone
- You can use emoji sparingly for encouragement 🏃‍♂️`;

		const messages = [
			{ role: 'system', content: systemPrompt },
			...history.map((h: ChatMessage) => ({ role: h.role, content: h.content })),
			{ role: 'user', content: message }
		];

		// Call OpenRouter
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://opencoach.local',
				'X-Title': 'OpenCoach'
			},
			body: JSON.stringify({
				model: 'anthropic/claude-3.5-haiku',
				messages,
				max_tokens: 500,
				temperature: 0.7
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('OpenRouter error:', errorText);
			throw new Error(`AI request failed: ${response.status}`);
		}

		const data = await response.json();
		const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";

		return json({
			success: true,
			reply
		});
	} catch (err) {
		console.error('Chat error:', err);
		return json({
			success: false,
			error: err instanceof Error ? err.message : 'Failed to get response'
		});
	}
};

