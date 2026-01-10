# TODO - Strategic Roadmap

**Vision:** The AI Coach for Consistency - helping beginner runners build habits, not chase PRs.

**Target Users:** Beginner runners & busy professionals who struggle with consistency.

**Unfair Advantage:** AI coaching focused on habit formation and flexibility, not rigid performance metrics.

---

## Phase 1: Nail the Core Loop (Months 1-3)
*Goal: Make the AI coaching genuinely helpful and shareable*

### Priority: High-Impact AI Improvements
- [ ] **Actionable chat (#6)** - Chat can reschedule runs, adjust plan intensity
  - Parse user intents like "Move tomorrow's run to Thursday"
  - Update training_plan table via chat commands

- [ ] **AI pattern detection (#5)** - Weekly analysis of missed run patterns
  - Detect: "You always miss Monday runs - want to switch to Thursdays?"
  - Add cron job that analyzes habits and sends suggestions

- [ ] **Better AI feedback prompts** - Enhance src/lib/prompts.ts
  - Include more context: sleep patterns, stress, missed runs
  - Focus on habit formation feedback, not just performance metrics
  - Predictive encouragement: "Based on your consistency, you'll hit 5k by [date]"

### Priority: Better Analytics & Visualization (#3)
- [ ] **Consistency tracking charts**
  - Runs per week over time (trend line)
  - Weekly streak counter with visual calendar
  - "Habit health" score (green = consistent, yellow = slipping, red = need intervention)

- [ ] **Performance graphs** (secondary to consistency)
  - Pace trends over time
  - Heart rate zones distribution
  - Distance progression

### Priority: Onboarding & First-Run Experience
- [ ] **Demo mode** - Let users try without Garmin account
  - Pre-populated sample runs and feedback
  - Clear CTA to connect real Garmin account

- [ ] **Improved setup wizard**
  - Better error handling for Garmin auth failures
  - More guidance on choosing available days
  - Show example plan before generating

### Quick Wins (Technical Debt)
- [ ] **Deduplicate Garmin workouts (#12)** - Don't send identical workouts multiple times
- [ ] **Better workout naming (#13)** - Use format: W1/D2 - Interval Run

---

## Phase 2: Growth & Differentiation (Months 4-6)
*Goal: Features that make people tell their friends*

### Expand Context, Not Scope
- [ ] **Other workout types (#4)** - Show yoga/cycling/strength for context only
  - Display in dashboard for "rest day" detection
  - AI recognizes: "You did yoga yesterday, so today's easy run makes sense"
  - Don't try to coach these workouts, just acknowledge them

### Social & Accountability Features (Not Competition)
- [ ] **Shareable AI feedback** - Pre-formatted social media posts
  - "Share this run" button with pre-written tweet/story
  - Include coach feedback + stats in attractive format

- [ ] **Weekly recap emails** - Accountability notifications
  - "You ran 3/3 planned runs - 🔥 streak!"
  - Encouraging message if user missed runs
  - Preview next week's plan

### Garmin Integration Polish
- [ ] **Structured workout uploads** - Proper warm-up, intervals, cool-down phases
- [ ] **Workout sync status** - Show which workouts are on Garmin device
- [ ] **Better error handling** - Graceful failures for Garmin API issues

---

## Phase 3: Scale (Months 7+) - IF TRACTION
*Goal: Decide if this becomes a product or stays community-driven*

### If 50+ Active Users (Product Path)
- [ ] **Multi-user support (#7)** - Proper user authentication and data isolation
- [ ] **Premium tier** - Better AI models (Sonnet/GPT-4), advanced analytics
- [ ] **Mobile app wrapper** - React Native or Capacitor around web view
- [ ] **Payment integration** - Stripe for premium subscriptions

### If Staying OSS/Community (Community Path)
- [ ] **Pluggable integrations** - Strava, Apple Health, Whoop, COROS
- [ ] **Community prompt library** - User-customizable AI coach personalities
- [ ] **One-click deploys** - Railway, Fly.io, Vercel templates
- [ ] **Plugin system** - Community-contributed features

### Deferred Features (Maybe Never)
- [ ] ~~Competition features (#8)~~ - Leaderboards conflict with "consistency over intensity" philosophy
- [ ] ~~Sleep tracking (#9)~~ - Too much scope, use existing integrations instead
- [ ] ~~Nutrition tracking (#10)~~ - Too much scope, use existing integrations instead
- [ ] ~~Stress tracking (#11)~~ - Could revisit if Garmin provides this data

---

## Completed
- [x] UI is broken on mobile devices, overlapping elements.
- [x] Plans need to be more flexible, having a run now button maybe, and the ability to replan individual runs and their date.

---

## Future / Research
- Possible Garmin Connect IQ app for official API access and direct data sync
