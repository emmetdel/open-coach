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
You help users manage their training through natural conversation and can take actions on their behalf.

${context ? `Here's what you know about this user:\n${context}` : "No training data available yet."}

Available Actions (use tools to help the user):
- See upcoming workouts: Use get_upcoming_workouts to view scheduled runs (helps before rescheduling!)
- Sync runs from Garmin: Use sync_garmin_runs when they ask to check for new runs or sync data
- Mark workouts complete/pending: Use toggle_workout_status when they confirm they finished a run
- Move individual workouts: Use update_workout (with new_date parameter) to reschedule specific runs
- Move workout to today: Use move_workout_to_today for same-day changes
- Move multiple workouts: Call update_workout multiple times (once per workout) with specific dates
- Delete workouts: Use delete_workout for injuries or schedule conflicts (ALWAYS ask confirmation first!)
- Add single workout: Use add_workout to insert one new run
- Rebuild entire plan: Use regenerate_week ONLY when they want to completely start over (rarely needed)
- Sync to watch: Use push_to_garmin_watch to send workouts to their Garmin device

IMPORTANT: When moving "this week's runs", you MUST:
1. FIRST call get_upcoming_workouts to see what's scheduled
2. Then call update_workout separately for EACH run with its current date and new_date
3. Do NOT use regenerate_week for rescheduling - that deletes everything and starts over!

Confirmation Pattern for Destructive Actions:
IMPORTANT: Before calling delete_workout or regenerate_week, you MUST ask for confirmation first.
Respond with: "Are you sure you want to [action]? This will [consequence]. Reply 'yes' to confirm."
Then wait for the user to explicitly confirm before executing the tool.

General Guidelines:
- Be concise but helpful (2-3 sentences unless more detail is needed)
- Focus on encouragement and practical advice
- Use health data to personalize recommendations:
  - Low HRV or poor sleep → suggest easier workout or extra rest
  - Low Body Battery (<30) → recommend recovery day
  - Elevated resting HR (+5bpm above normal) → sign of stress/overtraining
  - Good recovery metrics → encourage pushing a bit harder
- Use a conversational, supportive tone
- Use emoji sparingly for encouragement 🏃‍♂️
- Chain tools intelligently (e.g., sync runs → mark matching workouts complete → celebrate)
- Remember: Mental health over metrics. Every run counts.`;
}

// ============================================================
// RUN FEEDBACK PROMPTS
// ============================================================

/**
 * System prompt for analyzing a completed run
 * @param milestoneContext - Special context for milestone runs (1st, 5th, 10th, etc.)
 */
export function getRunFeedbackSystemPrompt(
  milestoneContext: string = "",
): string {
  return `${COACHING_PHILOSOPHY}

You are analyzing a completed run. Your job is to provide SPECIFIC, DATA-DRIVEN feedback that feels personal and meaningful.

IMPORTANT RULES:
1. NEVER use generic phrases like "great job" or "keep it up" without specifics
2. ALWAYS reference actual numbers from the run (pace, HR, distance)
3. ALWAYS compare to their history when available
4. Be conversational and warm, but SPECIFIC

What to analyze:
- Pace trends: Is this faster/slower than their usual? By how much?
- Heart rate zones: Was the effort appropriate for the type of run?
- Distance progression: Are they building endurance?
- Recovery indicators: Do they need rest or can they push harder?

BAD example (too generic):
"Great run today! You're doing awesome. Keep up the good work and you'll reach your goals!"

GOOD examples (specific and data-driven):
"6:12/km on this 5k - that's 8% faster than your last three runs at this distance! Your Zone 2 HR (142 bpm) shows you kept it easy, which is perfect for building your aerobic base."

"This 3km felt tough at 6:45/km pace, and your HR tells the story - averaging 168 bpm (Zone 4) is pretty high for an easy run. Try slowing down to 7:15-7:30/km next time to keep it in Zone 2-3."

"Solid consistency - this is your 4th run in 8 days! That 5.2km at 6:20/km is right in your sweet spot. Your body's adapting well, maybe add 500m to your next long run?"

Structure (3-4 sentences):
1. Specific celebration referencing actual data
2. Performance insight with numbers and comparison
3. One actionable tip for next time

${milestoneContext}`;
}

/**
 * User prompt for run feedback
 * @param distance - Formatted distance (e.g., "5.2 km")
 * @param duration - Formatted duration (e.g., "32:15")
 * @param pace - Formatted pace (e.g., "6:12/km")
 * @param hrContext - Heart rate context string
 * @param comparisonContext - Comparison to recent runs
 */
export function getRunFeedbackUserPrompt(
  distance: string,
  duration: string,
  pace: string,
  hrContext: string = "",
  comparisonContext: string = "",
): string {
  return `Analyze this completed run. Use SPECIFIC data points in your response.

📊 Today's Run Data:
- Distance: ${distance}
- Duration: ${duration}
- Pace: ${pace}
${hrContext}

${comparisonContext}

Write 3-4 sentences that:
1. Celebrate with specific numbers (e.g., "Your 6:12/km pace..." not "Great pace!")
2. Analyze what the data means (e.g., "That HR of 142 bpm kept you in Zone 2..." not "Good effort!")
3. Give ONE specific actionable tip (e.g., "Try adding 500m next time" not "Keep going!")

Remember: Be warm and encouraging, but ALWAYS cite actual numbers from the data above.`;
}

/**
 * Milestone celebration prefixes
 */
export function getMilestoneCelebration(runNumber: number): string {
  const milestones: Record<number, string> = {
    1: "🎉 YOUR FIRST RUN! ",
    5: "🔥 5 runs complete! ",
    10: "🏆 Double digits - 10 runs! ",
    25: "⭐ 25 runs! Amazing dedication! ",
    50: "🚀 50 RUNS! Incredible milestone! ",
    100: "💯 ONE HUNDRED RUNS! Legend status! ",
  };

  return milestones[runNumber] || "";
}

/**
 * Milestone context for the AI
 */
export function getMilestoneContext(runNumber: number): string {
  if (runNumber === 1) {
    return "THIS IS THEIR FIRST EVER RUN! Make this extra special and celebratory!";
  } else if (runNumber === 5) {
    return "This is their 5th run! They are building a real habit now.";
  } else if (runNumber === 10) {
    return "This is their 10th run! A major milestone.";
  } else if (runNumber % 10 === 0) {
    return `This is run #${runNumber}! Celebrate this milestone.`;
  }
  return "";
}

/**
 * Default feedback messages when AI is unavailable
 */
export const DEFAULT_FEEDBACK_MESSAGES = [
  "Great job getting out there today! Keep up the consistency.",
  "Another run in the books! You showed up, and that matters.",
  "You did it! Every step is building your running foundation.",
  "Way to go! Consistency is the key to becoming a runner.",
  "Excellent work today! You're building a habit that will change your life.",
];

// ============================================================
// PLAN GENERATION PROMPTS
// ============================================================

/**
 * Get workout type descriptions for plan generation
 */
export const WORKOUT_TYPES = {
  Easy: {
    name: "Easy Run",
    description: "Conversational pace - you should be able to talk easily",
    emoji: "🚶",
  },
  "Walk-Run": {
    name: "Walk-Run",
    description: "Alternate between walking and running to build endurance",
    emoji: "🚶‍♂️🏃",
  },
  Long: {
    name: "Long Run",
    description: "Slow and steady - building your aerobic base",
    emoji: "🏃‍♂️",
  },
  Interval: {
    name: "Intervals",
    description: "Speed work with recovery periods",
    emoji: "⚡",
  },
  Rest: {
    name: "Rest Day",
    description: "Recovery is when your body adapts and gets stronger",
    emoji: "😴",
  },
};

/**
 * Week focus descriptions for different phases
 */
export const WEEK_FOCUS = {
  building_base: "Building your aerobic base with easy running",
  adding_volume: "Gradually increasing your running volume",
  adding_speed: "Introducing some faster-paced running",
  peak_training: "Peak training - you're at your strongest",
  taper: "Tapering - reducing volume before your goal event",
  recovery: "Recovery week - letting your body adapt",
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
  sleepQuality?: string,
): { type: "low" | "moderate" | "good"; message: string; suggestion: string } {
  const reasons: string[] = [];

  const isLowBattery = bodyBattery !== undefined && bodyBattery < 40;
  const isPoorSleep = sleepHours !== undefined && sleepHours < 5;
  const isModerateBattery =
    bodyBattery !== undefined && bodyBattery >= 40 && bodyBattery < 60;
  const isFairSleep = sleepQuality === "fair" || sleepQuality === "poor";

  if (isLowBattery) reasons.push(`Body Battery at ${bodyBattery}%`);
  if (isPoorSleep) reasons.push(`only ${sleepHours?.toFixed(1)}h sleep`);

  if (isLowBattery || isPoorSleep) {
    return {
      type: "low",
      message: `Your recovery is low today (${reasons.join(", ")}). Pushing through may lead to burnout.`,
      suggestion:
        "Consider moving today's run to tomorrow, or converting it to an easy walk.",
    };
  }

  if (isModerateBattery || isFairSleep) {
    return {
      type: "moderate",
      message:
        "Recovery is moderate today. Consider an easier effort or shorter distance.",
      suggestion:
        "You can still run, but listen to your body and don't push too hard.",
    };
  }

  return {
    type: "good",
    message: "Your recovery looks good! You're ready to train.",
    suggestion: "Go for it! Your body is primed for a quality session.",
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
    "Walk-Run": [
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
    ],
  };

  const typeMessages = messages[workoutType] || messages["Easy"];
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
  "🚪 Step outside - the hardest part is done!",
];

// ============================================================
// MOTIVATIONAL QUOTES
// ============================================================

export const MOTIVATIONAL_QUOTES = [
  "The hardest part is getting out the door.",
  "You don't have to be great to start, but you have to start to be great.",
  "Every run is a gift you give yourself.",
  "Slow progress is still progress.",
  "The body achieves what the mind believes.",
  "You are stronger than you think.",
  "Rest days are training days too.",
  "Consistency beats intensity every time.",
  "A bad run is still better than no run.",
  "You're lapping everyone on the couch.",
];

/**
 * Get a random motivational quote
 */
export function getRandomQuote(): string {
  return MOTIVATIONAL_QUOTES[
    Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)
  ];
}
