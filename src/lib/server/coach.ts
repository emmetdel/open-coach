// AI Coach service using OpenRouter
import { getSetting, getSettings, SETTING_KEYS, DEFAULT_MODEL } from './db';
import type { Run } from './db';
import { formatDistance, formatDuration, calculatePace } from './garmin';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

interface OpenRouterResponse {
	choices: {
		message: {
			content: string;
		};
	}[];
}

// Call OpenRouter API
async function callOpenRouter(
	apiKey: string,
	model: string,
	messages: ChatMessage[],
	maxTokens = 200
): Promise<string> {
	const response = await fetch(OPENROUTER_API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': 'https://opencoach.run',
			'X-Title': 'OpenCoach'
		},
		body: JSON.stringify({
			model,
			messages,
			max_tokens: maxTokens,
			temperature: 0.7
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
	}

	const data = (await response.json()) as OpenRouterResponse;
	return data.choices[0]?.message?.content ?? 'Great effort today!';
}

// Get configured model or default
async function getModel(db: D1Database): Promise<string> {
	const model = await getSetting(db, SETTING_KEYS.OPENROUTER_MODEL);
	return model || DEFAULT_MODEL;
}

// Analyze a completed run and provide empathetic feedback
export async function analyzeRun(
	db: D1Database,
	run: Omit<Run, 'ai_feedback' | 'synced_to_calendar'>
): Promise<string> {
	const settings = await getSettings(db, [
		SETTING_KEYS.OPENROUTER_KEY,
		SETTING_KEYS.OPENROUTER_MODEL
	]);

	const apiKey = settings[SETTING_KEYS.OPENROUTER_KEY];
	const model = settings[SETTING_KEYS.OPENROUTER_MODEL] || DEFAULT_MODEL;

	if (!apiKey) {
		return 'Great job getting out there today! Keep up the consistency.';
	}

	const distance = formatDistance(run.distance_meters);
	const duration = formatDuration(run.duration_seconds);
	const pace = calculatePace(run.distance_meters, run.duration_seconds);

	// Build context about the run
	let hrContext = '';
	if (run.avg_hr) {
		if (run.avg_hr > 170) {
			hrContext = `Average HR was ${run.avg_hr}bpm (high effort).`;
		} else if (run.avg_hr > 150) {
			hrContext = `Average HR was ${run.avg_hr}bpm (moderate effort).`;
		} else {
			hrContext = `Average HR was ${run.avg_hr}bpm (easy effort).`;
		}
	}

	const systemPrompt = `You are a supportive running coach who prioritizes mental health over metrics. 
Your philosophy: "Consistency over intensity. Every run counts."
Keep responses brief (2-3 sentences), warm, and encouraging.
Focus on effort and showing up, not speed or distance.
If someone is struggling or ran slow, celebrate that they got out there.
Never be critical or suggest they should have done more.`;

	const userPrompt = `My runner just completed a run. Please give them brief, empathetic feedback.

Run data:
- Distance: ${distance}
- Duration: ${duration}  
- Pace: ${pace}
${hrContext}

Focus on celebrating the effort, not the metrics. Keep it warm and personal.`;

	try {
		const feedback = await callOpenRouter(apiKey, model, [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt }
		]);
		return feedback;
	} catch (error) {
		console.error('Failed to get AI feedback:', error);
		return 'Amazing work showing up today! Every run is a victory.';
	}
}

// Validate OpenRouter API key by making a test request
export async function validateApiKey(apiKey: string, model?: string): Promise<boolean> {
	try {
		await callOpenRouter(
			apiKey,
			model || DEFAULT_MODEL,
			[{ role: 'user', content: 'Say "OK" if this works.' }],
			10
		);
		return true;
	} catch {
		return false;
	}
}

// Safety check: validate AI-suggested distance (max 15km for beginners)
export function validateSuggestedDistance(distanceKm: number, isExperienced: boolean): number {
	const maxDistance = isExperienced ? 25 : 15;
	const minDistance = 1;

	if (distanceKm > maxDistance) {
		console.warn(`AI suggested ${distanceKm}km, capping at ${maxDistance}km`);
		return maxDistance;
	}
	if (distanceKm < minDistance) {
		return minDistance;
	}
	return distanceKm;
}
