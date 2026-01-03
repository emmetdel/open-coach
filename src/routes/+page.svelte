<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { RefreshCw, Activity, TrendingUp, Calendar, MessageCircle, Zap, Plus, X, Key, Settings, Flame, Trophy, Lightbulb, Target } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let syncing = $state(false);
	let syncMessage = $state('');

	// Manual run entry
	let showAddRun = $state(false);
	let addingRun = $state(false);
	let runDate = $state(new Date().toISOString().split('T')[0]);
	let runDistance = $state('');
	let runDuration = $state('');
	let runHr = $state('');

	// Token import
	let showImportTokens = $state(false);
	let tokenJson = $state('');
	let importingTokens = $state(false);

	// Plan generation
	let generatingPlan = $state(false);

	async function syncNow() {
		syncing = true;
		syncMessage = '';

		try {
			const res = await fetch('/api/sync', { method: 'POST' });
			const result: { success: boolean; message?: string; newRuns?: number } = await res.json();

			if (result.success) {
				syncMessage = result.message || 'Synced!';
				if (result.newRuns && result.newRuns > 0) {
					// Reload page to show new runs
					window.location.reload();
				}
			} else {
				syncMessage = result.message || 'Sync failed';
			}
		} catch {
			syncMessage = 'Network error';
		} finally {
			syncing = false;
		}
	}

	async function addManualRun() {
		if (!runDistance || !runDuration) {
			syncMessage = 'Please enter distance and duration';
			return;
		}

		addingRun = true;
		syncMessage = '';

		try {
			const res = await fetch('/api/runs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: runDate + 'T12:00:00',
					distance_km: parseFloat(runDistance),
					duration_minutes: parseFloat(runDuration),
					avg_hr: runHr ? parseInt(runHr) : undefined
				})
			});

			const result: { success: boolean } = await res.json();

			if (result.success) {
				syncMessage = 'Run added! Getting AI feedback...';
				showAddRun = false;
				runDistance = '';
				runDuration = '';
				runHr = '';
				// Reload to show new run with AI feedback
				setTimeout(() => window.location.reload(), 1500);
			} else {
				syncMessage = 'Failed to add run';
			}
		} catch {
			syncMessage = 'Network error';
		} finally {
			addingRun = false;
		}
	}

	async function importTokens() {
		if (!tokenJson.trim()) {
			syncMessage = 'Please paste the token JSON';
			return;
		}

		importingTokens = true;
		syncMessage = '';

		try {
			const tokens = JSON.parse(tokenJson);

			const res = await fetch('/api/garmin/tokens', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(tokens)
			});

			const result: { success: boolean } = await res.json();

			if (result.success) {
				syncMessage = 'Garmin tokens imported! Try syncing now.';
				showImportTokens = false;
				tokenJson = '';
			} else {
				syncMessage = 'Failed to import tokens';
			}
		} catch {
			syncMessage = 'Invalid JSON format';
		} finally {
			importingTokens = false;
		}
	}

	async function generatePlan() {
		generatingPlan = true;
		syncMessage = '';

		try {
			const res = await fetch('/api/plan', { method: 'POST' });
			const result: { success: boolean; message?: string } = await res.json();

			if (result.success) {
				syncMessage = result.message || 'Plan generated!';
				// Reload to show new plan
				window.location.reload();
			} else {
				syncMessage = result.message || 'Failed to generate plan';
			}
		} catch {
			syncMessage = 'Network error';
		} finally {
			generatingPlan = false;
		}
	}

	// Generate consistency bars for visualization
	// Match SQLite's strftime('%Y-%W') format: YYYY-WW where WW is 00-53
	function getWeekKey(date: Date): string {
		const year = date.getFullYear();
		const startOfYear = new Date(year, 0, 1);
		const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
		const weekNum = Math.floor((dayOfYear + startOfYear.getDay()) / 7);
		return `${year}-${String(weekNum).padStart(2, '0')}`;
	}

	function getConsistencyBars() {
		const weeks = [];
		for (let i = 7; i >= 0; i--) {
			const date = new Date();
			date.setDate(date.getDate() - i * 7);
			const weekKey = getWeekKey(date);
			const stat = data.weeklyStats.find((w) => w.week === weekKey);
			weeks.push({
				week: weekKey,
				count: stat?.count || 0
			});
		}
		return weeks;
	}

	const consistencyBars = $derived(getConsistencyBars());
	const maxCount = $derived(Math.max(...consistencyBars.map((b) => b.count), 3));
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-925 via-slate-900 to-slate-925">
	<!-- Import Tokens Modal -->
	{#if showImportTokens}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div class="mx-4 w-full max-w-lg rounded-2xl border border-slate-700/50 bg-slate-850 p-6 shadow-2xl">
				<div class="mb-6 flex items-center justify-between">
					<h2 class="font-display text-xl font-bold text-white">Import Garmin Tokens</h2>
					<button onclick={() => (showImportTokens = false)} class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
						<X class="h-5 w-5" />
					</button>
				</div>

				<div class="mb-4 rounded-lg bg-slate-800/50 p-4 text-sm text-slate-300">
					<p class="mb-2"><strong>To get tokens:</strong></p>
					<ol class="list-inside list-decimal space-y-1 text-slate-400">
						<li>Install Python: <code class="rounded bg-slate-700 px-1">pip install garth</code></li>
						<li>Run: <code class="rounded bg-slate-700 px-1">python scripts/garmin-auth.py</code></li>
						<li>Complete login in browser (MFA supported)</li>
						<li>Paste the JSON output below</li>
					</ol>
				</div>

				<form onsubmit={(e) => { e.preventDefault(); importTokens(); }} class="space-y-4">
					<div class="space-y-2">
						<Label for="token-json">Token JSON</Label>
						<textarea
							id="token-json"
							bind:value={tokenJson}
							placeholder={'{"oauth1": {...}, "oauth2": {...}}'}
							rows="6"
							class="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/20"
						></textarea>
					</div>

					<div class="flex gap-3 pt-2">
						<Button type="button" variant="outline" onclick={() => (showImportTokens = false)} class="flex-1">
							Cancel
						</Button>
						<Button type="submit" class="flex-1" disabled={importingTokens}>
							{importingTokens ? 'Importing...' : 'Import Tokens'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Add Run Modal -->
	{#if showAddRun}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div class="mx-4 w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-850 p-6 shadow-2xl">
				<div class="mb-6 flex items-center justify-between">
					<h2 class="font-display text-xl font-bold text-white">Add Run Manually</h2>
					<button onclick={() => (showAddRun = false)} class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
						<X class="h-5 w-5" />
					</button>
				</div>

				<form onsubmit={(e) => { e.preventDefault(); addManualRun(); }} class="space-y-4">
					<div class="space-y-2">
						<Label for="run-date">Date</Label>
						<Input id="run-date" type="date" bind:value={runDate} />
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-2">
							<Label for="run-distance">Distance (km)</Label>
							<Input id="run-distance" type="number" step="0.1" placeholder="5.0" bind:value={runDistance} />
						</div>
						<div class="space-y-2">
							<Label for="run-duration">Duration (min)</Label>
							<Input id="run-duration" type="number" step="1" placeholder="30" bind:value={runDuration} />
						</div>
					</div>

					<div class="space-y-2">
						<Label for="run-hr">Avg Heart Rate (optional)</Label>
						<Input id="run-hr" type="number" placeholder="145" bind:value={runHr} />
					</div>

					<div class="flex gap-3 pt-4">
						<Button type="button" variant="outline" onclick={() => (showAddRun = false)} class="flex-1">
							Cancel
						</Button>
						<Button type="submit" class="flex-1" disabled={addingRun}>
							{addingRun ? 'Adding...' : 'Add Run'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Background effects -->
	<div class="pointer-events-none fixed inset-0">
		<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-forest-900/10 via-transparent to-transparent"></div>
		<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-coral-900/5 via-transparent to-transparent"></div>
	</div>

	<div class="relative z-10">
		<!-- Header -->
		<header class="border-b border-slate-800/50 bg-slate-925/80 backdrop-blur-xl">
			<div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-forest-500 to-forest-600 shadow-lg shadow-forest-900/30">
						<Zap class="h-5 w-5 text-white" />
					</div>
					<span class="font-display text-xl font-bold text-white">OpenCoach</span>
				</div>
				<div class="flex items-center gap-2">
					<a href="/plan">
						<Button variant="secondary" size="sm">
							<Calendar class="h-4 w-4" />
							View Plan
						</Button>
					</a>
					<Button onclick={() => (showAddRun = true)} variant="ghost" size="sm" title="Add manual run">
						<Plus class="h-4 w-4" />
					</Button>
					<Button onclick={() => (showImportTokens = true)} variant="ghost" size="sm" title="Import Garmin tokens">
						<Key class="h-4 w-4" />
					</Button>
					<Button onclick={syncNow} variant="outline" size="sm" disabled={syncing}>
						<RefreshCw class={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
						{syncing ? 'Syncing...' : 'Sync'}
					</Button>
					<a href="/setup">
						<Button variant="ghost" size="sm" title="Settings & Goals">
							<Settings class="h-4 w-4" />
						</Button>
					</a>
				</div>
			</div>
		</header>

		<main class="mx-auto max-w-6xl px-6 py-8">
			{#if syncMessage}
				<div class="mb-6 rounded-xl bg-forest-500/10 px-4 py-3 text-sm text-forest-400">
					{syncMessage}
				</div>
			{/if}

			<!-- Next Run Hero -->
			{#if data.nextRun}
				<Card class="mb-8 border-forest-500/30 bg-gradient-to-br from-forest-900/20 to-slate-900">
					<CardContent class="p-6">
						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium uppercase tracking-wider text-forest-400">Next Run</p>
								<h2 class="mt-1 font-display text-2xl font-bold text-white">{data.nextRun.dateFormatted}</h2>
								<div class="mt-2 flex items-center gap-3">
									<span class="rounded-lg bg-forest-500/20 px-3 py-1 text-sm font-medium text-forest-300">
										{data.nextRun.type}
									</span>
									<span class="text-lg font-semibold text-slate-200">{data.nextRun.distance}</span>
								</div>
								<p class="mt-2 text-sm text-slate-400">{data.nextRun.description}</p>
							</div>
							<div class="hidden sm:block">
								<div class="flex h-20 w-20 items-center justify-center rounded-2xl bg-forest-500/20">
									<Calendar class="h-10 w-10 text-forest-400" />
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			{:else}
				<!-- No plan - prompt to generate -->
				<Card class="mb-8 border-slate-700/50 bg-gradient-to-br from-slate-850 to-slate-900">
					<CardContent class="p-6 text-center">
						<Calendar class="mx-auto h-12 w-12 text-slate-500" />
						<h2 class="mt-4 font-display text-xl font-bold text-white">No Runs Planned</h2>
						<p class="mt-2 text-sm text-slate-400">
							Generate a training plan based on your goals and availability.
						</p>
						<Button onclick={generatePlan} class="mt-4" disabled={generatingPlan}>
							{#if generatingPlan}
								<RefreshCw class="h-4 w-4 animate-spin" />
								Generating...
							{:else}
								<Zap class="h-4 w-4" />
								Generate Plan
							{/if}
						</Button>
					</CardContent>
				</Card>
			{/if}

			<!-- Upcoming Runs -->
			{#if data.upcomingPlans.length > 0}
				<Card class="mb-8 border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900">
					<CardHeader class="flex flex-row items-center justify-between">
						<CardTitle class="flex items-center gap-2 text-lg">
							<div class="h-2 w-2 rounded-full bg-coral-500"></div>
							Upcoming Runs
						</CardTitle>
						<Button onclick={generatePlan} variant="ghost" size="sm" disabled={generatingPlan}>
							<RefreshCw class={`h-4 w-4 ${generatingPlan ? 'animate-spin' : ''}`} />
							Regenerate
						</Button>
					</CardHeader>
					<CardContent>
						<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{#each data.upcomingPlans as plan}
								<div class="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
									<div class="flex items-center justify-between">
										<span class="text-sm font-medium text-slate-300">{plan.dayName}</span>
										<span class="rounded-lg bg-slate-700/50 px-2 py-0.5 text-xs font-medium text-slate-400">
											{plan.type}
										</span>
									</div>
									<p class="mt-1 font-display text-lg font-bold text-white">{plan.distance}</p>
									<p class="mt-1 text-xs text-slate-500">{plan.dateFormatted}</p>
								</div>
							{/each}
						</div>
					</CardContent>
				</Card>
			{/if}

			<!-- Stats Grid -->
			<div class="mb-8 grid gap-4 sm:grid-cols-3">
				<Card class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900">
					<CardContent class="p-6">
						<div class="flex items-center gap-4">
							<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-forest-500/20">
								<Activity class="h-6 w-6 text-forest-400" />
							</div>
							<div>
								<p class="text-sm text-slate-400">Total Runs</p>
								<p class="font-display text-2xl font-bold text-white">{data.stats.totalRuns}</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900">
					<CardContent class="p-6">
						<div class="flex items-center gap-4">
							<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-coral-500/20">
								<TrendingUp class="h-6 w-6 text-coral-400" />
							</div>
							<div>
								<p class="text-sm text-slate-400">Total Distance</p>
								<p class="font-display text-2xl font-bold text-white">{data.stats.totalDistance}</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900">
					<CardContent class="p-6">
						<div class="flex items-center gap-4">
							<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20">
								<Calendar class="h-6 w-6 text-purple-400" />
							</div>
							<div>
								<p class="text-sm text-slate-400">Avg Runs/Week</p>
								<p class="font-display text-2xl font-bold text-white">{data.stats.avgWeeklyRuns}</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<!-- Streak & Motivation Row -->
			<div class="mb-8 grid gap-4 sm:grid-cols-2">
				<!-- Streak Card -->
				<Card class="border-amber-500/20 bg-gradient-to-br from-amber-900/10 to-slate-900">
					<CardContent class="p-6">
						<div class="flex items-center justify-between">
							<div>
								<div class="flex items-center gap-2">
									<Flame class="h-5 w-5 text-amber-400" />
									<p class="text-sm font-medium text-amber-400">Current Streak</p>
								</div>
								<p class="mt-2 font-display text-4xl font-bold text-white">
									{data.streak.current}
									<span class="text-lg font-normal text-slate-400">runs</span>
								</p>
								{#if data.streak.longest > data.streak.current}
									<p class="mt-1 text-sm text-slate-500">
										Best: {data.streak.longest} runs
									</p>
								{/if}
							</div>
							<div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20">
								<Trophy class="h-8 w-8 text-amber-400" />
							</div>
						</div>
						{#if data.streak.current >= 3}
							<p class="mt-4 text-sm text-amber-300/80">
								🔥 Don't break the chain! You're on fire!
							</p>
						{:else if data.streak.current === 0}
							<p class="mt-4 text-sm text-slate-400">
								Complete your next scheduled run to start a streak!
							</p>
						{/if}
					</CardContent>
				</Card>

				<!-- Tips Card -->
				<Card class="border-sky-500/20 bg-gradient-to-br from-sky-900/10 to-slate-900">
					<CardContent class="p-6">
						<div class="flex items-center gap-2 mb-3">
							<Lightbulb class="h-5 w-5 text-sky-400" />
							<p class="text-sm font-medium text-sky-400">Coach's Tip</p>
						</div>
						<p class="text-slate-200 leading-relaxed">
							{data.tips[Math.floor(Math.random() * data.tips.length)]}
						</p>
						{#if data.nextRun}
							<p class="mt-4 text-xs text-slate-500">
								Tip for your next {data.nextRun.type} run
							</p>
						{/if}
					</CardContent>
				</Card>
			</div>

			<!-- Progress Card (if user has runs) -->
			{#if data.progress.totalRuns > 0}
				<Card class="mb-8 border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900">
					<CardHeader>
						<CardTitle class="flex items-center gap-2 text-lg">
							<Target class="h-5 w-5 text-forest-400" />
							Your Progress
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
							<div>
								<p class="text-sm text-slate-400">Total Distance</p>
								<p class="font-display text-2xl font-bold text-white">{data.progress.totalDistance} km</p>
							</div>
							<div>
								<p class="text-sm text-slate-400">Total Time</p>
								<p class="font-display text-2xl font-bold text-white">{data.progress.totalDuration} min</p>
							</div>
							<div>
								<p class="text-sm text-slate-400">Runs Completed</p>
								<p class="font-display text-2xl font-bold text-white">{data.progress.totalRuns}</p>
							</div>
							{#if data.progress.paceImprovement}
								<div>
									<p class="text-sm text-slate-400">Pace Improvement</p>
									<p class="font-display text-2xl font-bold text-forest-400">+{data.progress.paceImprovement}</p>
								</div>
							{/if}
						</div>

						{#if data.progress.firstRun && data.progress.latestRun && data.progress.totalRuns > 1}
							<div class="mt-6 rounded-xl bg-slate-800/50 p-4">
								<p class="text-sm font-medium text-slate-300 mb-3">Your Journey</p>
								<div class="flex items-center gap-4">
									<div class="flex-1 rounded-lg bg-slate-700/50 p-3">
										<p class="text-xs text-slate-500">First Run</p>
										<p class="font-medium text-slate-200">{data.progress.firstRun.distance.toFixed(1)} km</p>
										<p class="text-xs text-slate-500">{new Date(data.progress.firstRun.date).toLocaleDateString()}</p>
									</div>
									<div class="text-forest-400">→</div>
									<div class="flex-1 rounded-lg bg-forest-500/20 p-3">
										<p class="text-xs text-forest-400">Latest Run</p>
										<p class="font-medium text-forest-200">{data.progress.latestRun.distance.toFixed(1)} km</p>
										<p class="text-xs text-forest-400">{new Date(data.progress.latestRun.date).toLocaleDateString()}</p>
									</div>
								</div>
							</div>
						{/if}
					</CardContent>
				</Card>
			{/if}

			<!-- Consistency Chart -->
			<Card class="mb-8 border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900">
				<CardHeader>
					<CardTitle class="flex items-center gap-2 text-lg">
						<div class="h-2 w-2 rounded-full bg-forest-500"></div>
						Consistency
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="grid grid-cols-8 items-end gap-2" style="height: 100px;">
						{#each consistencyBars as bar, i}
							{@const barHeight = bar.count > 0 ? Math.round((bar.count / maxCount) * 100) : 8}
							<div
								class="w-full rounded-t-lg transition-all duration-500 {bar.count > 0 ? 'bg-gradient-to-t from-forest-600 to-forest-400' : 'bg-slate-700/50'}"
								style="height: {barHeight}px;"
								style:animation-delay="{i * 50}ms"
							></div>
						{/each}
					</div>
					<div class="mt-2 grid grid-cols-8 gap-2">
						{#each consistencyBars as _, i}
							<span class="text-center text-xs text-slate-500">W{i + 1}</span>
						{/each}
					</div>
					<p class="mt-4 text-center text-sm text-slate-400">
						Last 8 weeks • {consistencyBars.filter((b) => b.count > 0).length} active weeks
					</p>
				</CardContent>
			</Card>

			<!-- Recent Runs -->
			<Card class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900">
				<CardHeader>
					<CardTitle class="text-lg">Recent Runs</CardTitle>
				</CardHeader>
				<CardContent>
					{#if data.runs.length === 0}
						<div class="py-12 text-center">
							<Activity class="mx-auto mb-4 h-12 w-12 text-slate-600" />
							<p class="text-slate-400">No runs yet.</p>
							<p class="mt-1 text-sm text-slate-500">
								Add a run manually or sync from Garmin.
							</p>
							<Button onclick={() => (showAddRun = true)} class="mt-4">
								<Plus class="h-4 w-4" />
								Add Your First Run
							</Button>
						</div>
					{:else}
						<div class="space-y-4">
							{#each data.runs as run}
								<div class="rounded-xl border border-slate-800/50 bg-slate-900/50 p-4 transition-colors hover:border-slate-700/50">
									<div class="flex items-start justify-between">
										<div>
											<p class="font-medium text-slate-200">{run.dateFormatted}</p>
											<div class="mt-1 flex items-center gap-4 text-sm text-slate-400">
												<span>{run.distance}</span>
												<span class="text-slate-600">•</span>
												<span>{run.duration}</span>
												<span class="text-slate-600">•</span>
												<span>{run.pace}</span>
												{#if run.avg_hr}
													<span class="text-slate-600">•</span>
													<span class="text-coral-400">{run.avg_hr} bpm</span>
												{/if}
											</div>
										</div>
									</div>

									{#if run.ai_feedback}
										<div class="mt-4 flex gap-3">
											<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-500/20">
												<MessageCircle class="h-4 w-4 text-forest-400" />
											</div>
											<div class="rounded-2xl rounded-tl-sm bg-slate-800/80 px-4 py-3 text-sm text-slate-300">
												{run.ai_feedback}
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</CardContent>
			</Card>
		</main>

		<!-- Footer -->
		<footer class="border-t border-slate-800/50 py-8 text-center text-sm text-slate-500">
			<p>Mental health over metrics. Every run counts.</p>
		</footer>
	</div>
</div>
