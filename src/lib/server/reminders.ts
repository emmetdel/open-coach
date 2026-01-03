import { getUpcomingPlans, getSettings, SETTING_KEYS, type TrainingPlan } from './db';
import { sendPushNotification, sendEmailNotification } from './notifications';

// Check for runs scheduled tomorrow and send reminders
export async function sendRunReminders(
	db: D1Database,
	type: 'evening' | 'morning'
): Promise<{ sent: number }> {
	// Get notification preferences
	const settings = await getSettings(db, [
		SETTING_KEYS.PUSH_ENABLED,
		SETTING_KEYS.EMAIL_ENABLED,
		SETTING_KEYS.NOTIFICATION_EMAIL
	]);

	const pushEnabled = settings[SETTING_KEYS.PUSH_ENABLED] === 'true';
	const emailEnabled = settings[SETTING_KEYS.EMAIL_ENABLED] === 'true';
	const notificationEmail = settings[SETTING_KEYS.NOTIFICATION_EMAIL];

	if (!pushEnabled && !emailEnabled) {
		return { sent: 0 };
	}

	// Get tomorrow's date
	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);
	const tomorrowStr = tomorrow.toISOString().split('T')[0];

	// Get today's date for morning reminders
	const today = new Date().toISOString().split('T')[0];

	// Get upcoming plans
	const plans = await getUpcomingPlans(db, 7);
	const targetDate = type === 'evening' ? tomorrowStr : today;
	const runsForDate = plans.filter((p) => p.scheduled_date === targetDate);

	if (runsForDate.length === 0) {
		return { sent: 0 };
	}

	let sent = 0;

	for (const run of runsForDate) {
		const title =
			type === 'evening'
				? `🏃 Tomorrow: ${run.type} Run`
				: `☀️ Today's Run: ${run.type}`;

		const body = formatReminderBody(run, type);

		if (pushEnabled) {
			try {
				await sendPushNotification(db, title, body);
				sent++;
			} catch (e) {
				console.error('Push notification failed:', e);
			}
		}

		if (emailEnabled && notificationEmail) {
			try {
				await sendEmailNotification(
					db,
					notificationEmail,
					title,
					body,
					undefined
				);
				sent++;
			} catch (e) {
				console.error('Email notification failed:', e);
			}
		}
	}

	return { sent };
}

function formatReminderBody(run: TrainingPlan, type: 'evening' | 'morning'): string {
	const duration = run.target_duration_minutes
		? `${run.target_duration_minutes} minutes`
		: `${run.target_distance_km}km`;

	if (type === 'evening') {
		return `Get your gear ready for tomorrow! ${run.description}\n\n💡 Tip: Lay out your running clothes tonight.`;
	}

	// Morning reminder with motivation
	const motivations = [
		"Every step counts. You've got this!",
		"Remember: consistency beats intensity.",
		"Future you will thank present you.",
		"The hardest part is putting on your shoes.",
		"You're building a habit that will change your life."
	];
	const motivation = motivations[Math.floor(Math.random() * motivations.length)];

	return `${run.description}\n\n${motivation}`;
}

// Get beginner tips based on workout type
export function getBeginnerTips(type: TrainingPlan['type']): string[] {
	const tips: Record<string, string[]> = {
		'Walk-Run': [
			"The walk breaks aren't cheating - they're science! They help your body adapt safely.",
			"During run intervals, you should be able to speak short sentences.",
			"If you're gasping for air, slow down or add more walk time.",
			"Focus on time, not distance. Speed comes later.",
			"Run tall: imagine a string pulling you up from your head."
		],
		'Easy': [
			"Easy pace = conversational pace. If you can't chat, slow down!",
			"Your easy runs build your aerobic base - the foundation of all running.",
			"Don't worry about your pace. Seriously. Just enjoy it.",
			"Nasal breathing is a good test - if you need to mouth-breathe, you're going too fast.",
			"80% of your running should feel 'too easy'. That's the secret."
		],
		'Long': [
			"The goal is to finish feeling like you could do more.",
			"Bring water if you'll be out longer than 45 minutes.",
			"Start slower than you think you need to.",
			"Walk breaks are fine! Many marathon runners use them.",
			"This run builds mental toughness as much as physical."
		],
		'Interval': [
			"Warm up properly before any speed work.",
			"Recovery between intervals should be complete - don't rush it.",
			"Focus on consistent effort, not fastest possible pace.",
			"These are harder - make sure you're well rested.",
			"Quality over quantity. Stop if form breaks down."
		],
		'Rest': [
			"Rest days are when your body gets stronger.",
			"Light walking or stretching is fine, but no running!",
			"Stay hydrated and get good sleep.",
			"Trust the process - rest is training too.",
			"Great time to do some foam rolling or yoga."
		]
	};

	return tips[type] || tips['Easy'];
}

// Calculate current streak
export async function calculateStreak(db: D1Database): Promise<{
	currentStreak: number;
	longestStreak: number;
	lastRunDate: string | null;
}> {
	// Get all completed runs ordered by date
	const result = await db
		.prepare(
			`SELECT date FROM runs 
			 ORDER BY date DESC`
		)
		.all<{ date: string }>();

	const runs = result.results;

	if (runs.length === 0) {
		return { currentStreak: 0, longestStreak: 0, lastRunDate: null };
	}

	// Calculate streaks based on scheduled runs completed
	const planResult = await db
		.prepare(
			`SELECT scheduled_date, status FROM training_plan 
			 WHERE scheduled_date <= date('now')
			 ORDER BY scheduled_date DESC`
		)
		.all<{ scheduled_date: string; status: string }>();

	const plans = planResult.results;

	let currentStreak = 0;
	let longestStreak = 0;
	let tempStreak = 0;
	let streakBroken = false;

	for (const plan of plans) {
		if (plan.status === 'Completed') {
			if (!streakBroken) {
				currentStreak++;
			}
			tempStreak++;
			longestStreak = Math.max(longestStreak, tempStreak);
		} else if (plan.status === 'Missed') {
			streakBroken = true;
			tempStreak = 0;
		}
	}

	return {
		currentStreak,
		longestStreak,
		lastRunDate: runs[0]?.date || null
	};
}

// Get progress stats for visualization
export async function getProgressStats(db: D1Database): Promise<{
	firstRun: { date: string; distance: number; duration: number } | null;
	latestRun: { date: string; distance: number; duration: number } | null;
	totalRuns: number;
	totalDistance: number;
	totalDuration: number;
	avgPaceImprovement: number | null;
	weeklyProgress: Array<{ week: string; distance: number; runs: number }>;
}> {
	// Get first and latest runs
	const firstRunResult = await db
		.prepare('SELECT * FROM runs ORDER BY date ASC LIMIT 1')
		.first<{ date: string; distance_meters: number; duration_seconds: number }>();

	const latestRunResult = await db
		.prepare('SELECT * FROM runs ORDER BY date DESC LIMIT 1')
		.first<{ date: string; distance_meters: number; duration_seconds: number }>();

	// Get totals
	const totalsResult = await db
		.prepare(
			`SELECT 
				COUNT(*) as total_runs,
				SUM(distance_meters) as total_distance,
				SUM(duration_seconds) as total_duration
			 FROM runs`
		)
		.first<{ total_runs: number; total_distance: number; total_duration: number }>();

	// Get weekly progress for last 8 weeks
	const weeklyResult = await db
		.prepare(
			`SELECT 
				strftime('%Y-%W', date) as week,
				SUM(distance_meters) as distance,
				COUNT(*) as runs
			 FROM runs
			 WHERE date >= date('now', '-8 weeks')
			 GROUP BY week
			 ORDER BY week ASC`
		)
		.all<{ week: string; distance: number; runs: number }>();

	// Calculate pace improvement
	let avgPaceImprovement: number | null = null;
	if (firstRunResult && latestRunResult) {
		const firstPace = firstRunResult.duration_seconds / (firstRunResult.distance_meters / 1000);
		const latestPace = latestRunResult.duration_seconds / (latestRunResult.distance_meters / 1000);
		if (firstPace > 0 && latestPace > 0) {
			avgPaceImprovement = ((firstPace - latestPace) / firstPace) * 100;
		}
	}

	return {
		firstRun: firstRunResult
			? {
					date: firstRunResult.date,
					distance: firstRunResult.distance_meters / 1000,
					duration: firstRunResult.duration_seconds / 60
				}
			: null,
		latestRun: latestRunResult
			? {
					date: latestRunResult.date,
					distance: latestRunResult.distance_meters / 1000,
					duration: latestRunResult.duration_seconds / 60
				}
			: null,
		totalRuns: totalsResult?.total_runs || 0,
		totalDistance: (totalsResult?.total_distance || 0) / 1000,
		totalDuration: (totalsResult?.total_duration || 0) / 60,
		avgPaceImprovement,
		weeklyProgress: weeklyResult.results
	};
}

// Generate celebration message after a run
export function generateCelebration(
	runNumber: number,
	streakCount: number,
	weeklyRuns: number
): string {
	const celebrations: string[] = [];

	// Run milestones
	if (runNumber === 1) {
		celebrations.push("🎉 Your first run! This is where it all begins. You're officially a runner!");
	} else if (runNumber === 5) {
		celebrations.push("🔥 5 runs complete! You're building a real habit now!");
	} else if (runNumber === 10) {
		celebrations.push("🏆 Double digits! 10 runs in the books. You're unstoppable!");
	} else if (runNumber === 25) {
		celebrations.push("⭐ 25 runs! A quarter century of runs. That's dedication!");
	} else if (runNumber === 50) {
		celebrations.push("🚀 50 RUNS! Half a hundred! You've transformed your life!");
	}

	// Streak celebrations
	if (streakCount === 3) {
		celebrations.push("🔥 3 scheduled runs in a row! The habit is forming!");
	} else if (streakCount === 5) {
		celebrations.push("💪 5-run streak! You're crushing it!");
	} else if (streakCount >= 10) {
		celebrations.push(`🌟 ${streakCount}-run streak! Incredible consistency!`);
	}

	// Weekly celebrations
	if (weeklyRuns >= 3) {
		celebrations.push("📅 Great week! You hit your running goals!");
	}

	// Default celebration
	if (celebrations.length === 0) {
		const defaults = [
			"Great run! Every step makes you stronger. 💪",
			"Done! That's another run in the bank. 🏦",
			"Crushed it! Rest up and get ready for the next one. 🌟",
			"You showed up. That's what matters most. ✅",
			"Another one done. Future you says thanks! 🙏"
		];
		celebrations.push(defaults[Math.floor(Math.random() * defaults.length)]);
	}

	return celebrations.join('\n\n');
}

