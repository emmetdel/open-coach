/**
 * Centralized AI Prompts for OpenCoach
 * 
 * Edit these prompts to customize the AI's personality and responses.
 * All prompts sent to OpenRouter are defined here.
 */

// ============================================================
// CORE PHILOSOPHY
// ============================================================

export const COACHING_PHILOSOPHY = `You are a supportive running coach who prioritizes mental health over metrics.
Your philosophy: "Consistency over intensity. Every run counts."
Focus on effort and showing up, not speed or distance.
If someone is struggling or ran slow, celebrate that they got out there.
Never be critical or suggest they should have done more.`;

// ============================================================
// CHAT / ASSISTANT PROMPTS
// ============================================================

/**
 * System prompt for the chat assistant
 * @param context - Dynamic context about the user's training and health
 */
export function getChatSystemPrompt(context: string): string {
	return `You are a friendly, supportive running coach assistant for OpenCoach. 
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
}

// ============================================================
// RUN FEEDBACK PROMPTS
// ============================================================

/**
 * System prompt for analyzing a completed run
 * @param milestoneContext - Special context for milestone runs (1st, 5th, 10th, etc.)
 */
export function getRunFeedbackSystemPrompt(milestoneContext: string = ''): string {
	return `${COACHING_PHILOSOPHY}
Keep responses brief (2-3 sentences), warm, and encouraging.
${milestoneContext}`;
}

/**
 * User prompt for run feedback
 * @param distance - Formatted distance (e.g., "5.2 km")
 * @param duration - Formatted duration (e.g., "32:15")
 * @param pace - Formatted pace (e.g., "6:12/km")
 * @param hrContext - Heart rate context string
 */
export function getRunFeedbackUserPrompt(
	distance: string,
	duration: string,
	pace: string,
	hrContext: string = ''
): string {
	return `My runner just completed a run. Please give them brief, empathetic feedback.

Run data:
- Distance: ${distance}
- Duration: ${duration}  
- Pace: ${pace}
${hrContext}

Focus on celebrating the effort, not the metrics. Keep it warm and personal.`;
}

/**
 * Milestone celebration prefixes
 */
export function getMilestoneCelebration(runNumber: number): string {
	const milestones: Record<number, string> = {
		1: '🎉 YOUR FIRST RUN! ',
		5: '🔥 5 runs complete! ',
		10: '🏆 Double digits - 10 runs! ',
		25: '⭐ 25 runs! Amazing dedication! ',
		50: '🚀 50 RUNS! Incredible milestone! ',
		100: '💯 ONE HUNDRED RUNS! Legend status! '
	};

	return milestones[runNumber] || '';
}

/**
 * Milestone context for the AI
 */
export function getMilestoneContext(runNumber: number): string {
	if (runNumber === 1) {
		return 'THIS IS THEIR FIRST EVER RUN! Make this extra special and celebratory!';
	} else if (runNumber === 5) {
		return 'This is their 5th run! They are building a real habit now.';
	} else if (runNumber === 10) {
		return 'This is their 10th run! A major milestone.';
	} else if (runNumber % 10 === 0) {
		return `This is run #${runNumber}! Celebrate this milestone.`;
	}
	return '';
}

/**
 * Default feedback messages when AI is unavailable
 */
export const DEFAULT_FEEDBACK_MESSAGES = [
	'Great job getting out there today! Keep up the consistency.',
	'Another run in the books! You showed up, and that matters.',
	'You did it! Every step is building your running foundation.',
	'Way to go! Consistency is the key to becoming a runner.',
	"Excellent work today! You're building a habit that will change your life."
];

// ============================================================
// PLAN GENERATION PROMPTS  
// ============================================================

/**
 * Get workout type descriptions for plan generation
 */
export const WORKOUT_TYPES = {
	Easy: {
		name: 'Easy Run',
		description: 'Conversational pace - you should be able to talk easily',
		emoji: '🚶'
	},
	'Walk-Run': {
		name: 'Walk-Run',
		description: 'Alternate between walking and running to build endurance',
		emoji: '🚶‍♂️🏃'
	},
	Long: {
		name: 'Long Run',
		description: 'Slow and steady - building your aerobic base',
		emoji: '🏃‍♂️'
	},
	Interval: {
		name: 'Intervals',
		description: 'Speed work with recovery periods',
		emoji: '⚡'
	},
	Rest: {
		name: 'Rest Day',
		description: 'Recovery is when your body adapts and gets stronger',
		emoji: '😴'
	}
};

/**
 * Week focus descriptions for different phases
 */
export const WEEK_FOCUS = {
	building_base: 'Building your aerobic base with easy running',
	adding_volume: 'Gradually increasing your running volume',
	adding_speed: 'Introducing some faster-paced running',
	peak_training: 'Peak training - you\'re at your strongest',
	taper: 'Tapering - reducing volume before your goal event',
	recovery: 'Recovery week - letting your body adapt'
};

// ============================================================
// RECOVERY PROMPTS
// ============================================================

/**
 * Recovery alert messages based on metrics
 */
export function getRecoveryMessage(
	bodyBattery?: number,
	sleepHours?: number,
	sleepQuality?: string
): { type: 'low' | 'moderate' | 'good'; message: string; suggestion: string } {
	const reasons: string[] = [];

	const isLowBattery = bodyBattery !== undefined && bodyBattery < 40;
	const isPoorSleep = sleepHours !== undefined && sleepHours < 5;
	const isModerateBattery = bodyBattery !== undefined && bodyBattery >= 40 && bodyBattery < 60;
	const isFairSleep = sleepQuality === 'fair' || sleepQuality === 'poor';

	if (isLowBattery) reasons.push(`Body Battery at ${bodyBattery}%`);
	if (isPoorSleep) reasons.push(`only ${sleepHours?.toFixed(1)}h sleep`);

	if (isLowBattery || isPoorSleep) {
		return {
			type: 'low',
			message: `Your recovery is low today (${reasons.join(', ')}). Pushing through may lead to burnout.`,
			suggestion: 'Consider moving today\'s run to tomorrow, or converting it to an easy walk.'
		};
	}

	if (isModerateBattery || isFairSleep) {
		return {
			type: 'moderate',
			message: 'Recovery is moderate today. Consider an easier effort or shorter distance.',
			suggestion: 'You can still run, but listen to your body and don\'t push too hard.'
		};
	}

	return {
		type: 'good',
		message: 'Your recovery looks good! You\'re ready to train.',
		suggestion: 'Go for it! Your body is primed for a quality session.'
	};
}

// ============================================================
// PRE-RUN RITUAL PROMPTS
// ============================================================

/**
 * Get a pre-run motivational message based on workout type
 */
export function getPreRunMessage(workoutType: string): string {
	const messages: Record<string, string[]> = {
		Easy: [
			"Easy runs build your aerobic engine. Keep it conversational today! 🗣️",
			"Today's about the joy of movement. No pressure, just flow.",
			"Easy doesn't mean unimportant - this is where fitness is built.",
		],
		'Walk-Run': [
			"Walk-run is how every great runner started. You're on the path! 🚶‍♂️🏃",
			"The run portions will get longer naturally. Trust the process.",
			"Walking is not giving up - it's smart training.",
		],
		Long: [
			"Long runs are mental as much as physical. You've got this! 💪",
			"Start slower than you think. The first mile is always the hardest.",
			"This is where the magic happens. Embrace the journey.",
		],
		Interval: [
			"Speed work today! Push the hard parts, recover fully between. ⚡",
			"Intervals make you faster. Embrace the discomfort.",
			"Hard when it's hard, easy when it's easy. That's the key.",
		],
		Walk: [
			"Recovery walks are training too. Enjoy being outside! 🌳",
			"Movement without stress - exactly what your body needs today.",
			"Active recovery helps you come back stronger.",
		]
	};

	const typeMessages = messages[workoutType] || messages['Easy'];
	return typeMessages[Math.floor(Math.random() * typeMessages.length)];
}

/**
 * Get clothing suggestions based on temperature
 */
export function getClothingSuggestion(tempCelsius: number): string {
	if (tempCelsius < 5) {
		return "🧤 Cold! Long sleeves, tights, gloves, and a hat.";
	} else if (tempCelsius < 10) {
		return "🧥 Cool - long sleeves and tights. Maybe gloves.";
	} else if (tempCelsius < 15) {
		return "👕 Mild - t-shirt and shorts, maybe arm warmers.";
	} else if (tempCelsius < 20) {
		return "☀️ Perfect running weather! Shorts and t-shirt.";
	} else if (tempCelsius < 25) {
		return "🌡️ Warm - light clothing, consider a cap.";
	} else {
		return "🥵 Hot! Minimal clothing, bring water, go easy.";
	}
}

/**
 * Pre-run checklist items
 */
export const PRE_RUN_CHECKLIST = [
	"📱 Phone charged (for safety)",
	"👟 Lace up your shoes",
	"💧 Have water ready for after",
	"🎧 Queue up your playlist or podcast",
	"🚪 Step outside - the hardest part is done!"
];

// ============================================================
// MOTIVATIONAL QUOTES
// ============================================================

export const MOTIVATIONAL_QUOTES = [
	'The hardest part is getting out the door.',
	'You don\'t have to be great to start, but you have to start to be great.',
	'Every run is a gift you give yourself.',
	'Slow progress is still progress.',
	'The body achieves what the mind believes.',
	'You are stronger than you think.',
	'Rest days are training days too.',
	'Consistency beats intensity every time.',
	'A bad run is still better than no run.',
	'You\'re lapping everyone on the couch.'
];

/**
 * Get a random motivational quote
 */
export function getRandomQuote(): string {
	return MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
}

