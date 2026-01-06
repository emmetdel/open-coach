<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import GarminAuthModal from '$lib/components/GarminAuthModal.svelte';
	import { RefreshCw, Activity, TrendingUp, Calendar, MessageCircle, Zap, Plus, X, Settings, Flame, Trophy, Lightbulb, Target, Palette, Sun, Moon, Heart, Battery, BedDouble, AlertTriangle, ArrowRight, Footprints, Play, Clock, CheckCircle2, Watch, Trash2, Pencil, MoreVertical } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	let syncing = $state(false);
	let syncMessage = $state('');

	// Theme picker
	let showThemePicker = $state(false);
	let currentTheme = $state('forest');
	let isDarkMode = $state(true);
	
	const themes = [
		{ id: 'forest', name: 'Forest', color: '#22c55e' },
		{ id: 'ocean', name: 'Ocean', color: '#3b82f6' },
		{ id: 'sunset', name: 'Sunset', color: '#f97316' },
		{ id: 'violet', name: 'Violet', color: '#a855f7' },
		{ id: 'rose', name: 'Rose', color: '#f43f5e' },
		{ id: 'amber', name: 'Amber', color: '#f59e0b' }
	];

	onMount(() => {
		const savedTheme = localStorage.getItem('opencoach-theme');
		const savedMode = localStorage.getItem('opencoach-mode');
		if (savedTheme) {
			currentTheme = savedTheme;
			document.documentElement.setAttribute('data-theme', savedTheme === 'forest' ? '' : savedTheme);
		}
		if (savedMode) {
			isDarkMode = savedMode === 'dark';
			document.documentElement.setAttribute('data-mode', savedMode);
		}
	});

	function setTheme(themeId: string) {
		currentTheme = themeId;
		localStorage.setItem('opencoach-theme', themeId);
		document.documentElement.setAttribute('data-theme', themeId === 'forest' ? '' : themeId);
	}

	function toggleDarkMode() {
		isDarkMode = !isDarkMode;
		const mode = isDarkMode ? 'dark' : 'light';
		localStorage.setItem('opencoach-mode', mode);
		document.documentElement.setAttribute('data-mode', mode);
	}

	// Manual run entry
	let showAddRun = $state(false);
	let addingRun = $state(false);
	let runDate = $state(new Date().toISOString().split('T')[0]);
	let runDistance = $state('');
	let runDuration = $state('');
	let runHr = $state('');

	// Garmin re-auth modal
	let showAuthModal = $state(false);
	let syncAttemptAfterAuth = $state(false); // Track if this is a retry after auth

	// Plan generation
	let generatingPlan = $state(false);

	// Recovery rescheduling
	let showRescheduleModal = $state(false);
	let rescheduling = $state(false);
	let rescheduleMessage = $state('');
	let alertDismissed = $state(false);

	// Pre-run "I'm going" ritual
	let showPreRunModal = $state(false);
	let preRunCountdown = $state<number | null>(null);
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	function startGetReadyTimer() {
		preRunCountdown = 10 * 60; // 10 minutes in seconds
		countdownInterval = setInterval(() => {
			if (preRunCountdown !== null && preRunCountdown > 0) {
				preRunCountdown--;
			} else if (countdownInterval) {
				clearInterval(countdownInterval);
				countdownInterval = null;
			}
		}, 1000);
	}

	function stopTimer() {
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
		preRunCountdown = null;
	}

	function formatCountdown(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Pre-run motivational messages (from prompts.ts concepts)
	const preRunMessages: Record<string, string[]> = {
		Easy: [
			"Easy runs build your aerobic engine. Keep it conversational! 🗣️",
			"Today's about joy. No pressure, just flow.",
		],
		'Walk-Run': [
			"Walk-run is how every great runner started. You're on the path! 🚶‍♂️🏃",
			"Walking is not giving up - it's smart training.",
		],
		Long: [
			"Long runs are mental as much as physical. You've got this! 💪",
			"Start slower than you think. The first mile is always hardest.",
		],
		Interval: [
			"Speed work today! Push hard, recover fully. ⚡",
			"Intervals make you faster. Embrace the discomfort.",
		]
	};

	function getPreRunMessage(type: string): string {
		const messages = preRunMessages[type] || preRunMessages['Easy'];
		return messages[Math.floor(Math.random() * messages.length)];
	}

	// Run edit/delete
	let showEditRunModal = $state(false);
	let showDeleteConfirm = $state(false);
	let selectedRunId = $state<string | null>(null);
	let selectedRun = $state<typeof data.runs[0] | null>(null);
	let editingRun = $state(false);
	let deletingRun = $state(false);
	let runActionMessage = $state('');

	// Edit form state
	let editDate = $state('');
	let editDistance = $state('');
	let editDuration = $state('');
	let editHr = $state('');

	function openEditModal(run: typeof data.runs[0]) {
		selectedRun = run;
		selectedRunId = run.garmin_activity_id;
		// Parse the existing values
		editDate = run.date.split('T')[0];
		// Parse distance from "5.2 km" format
		editDistance = run.distance.replace(/[^\d.]/g, '');
		// Parse duration from "32:15" format to minutes
		const [mins, secs] = run.duration.split(':').map(Number);
		editDuration = String(mins + (secs || 0) / 60);
		editHr = run.avg_hr ? String(run.avg_hr) : '';
		showEditRunModal = true;
	}

	function openDeleteConfirm(run: typeof data.runs[0]) {
		selectedRun = run;
		selectedRunId = run.garmin_activity_id;
		showDeleteConfirm = true;
	}

	async function saveRunEdit() {
		if (!selectedRunId) return;
		
		editingRun = true;
		runActionMessage = '';

		try {
			const res = await fetch(`/api/runs/${encodeURIComponent(selectedRunId)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: editDate + 'T12:00:00',
					distance_km: parseFloat(editDistance),
					duration_minutes: parseFloat(editDuration),
					avg_hr: editHr ? parseInt(editHr) : null
				})
			});

			const result = await res.json();

			if (result.success) {
				runActionMessage = 'Run updated!';
				showEditRunModal = false;
				setTimeout(() => window.location.reload(), 1000);
			} else {
				runActionMessage = result.error || 'Failed to update run';
			}
		} catch (err) {
			runActionMessage = 'Network error';
		} finally {
			editingRun = false;
		}
	}

	async function deleteRun() {
		if (!selectedRunId) return;
		
		deletingRun = true;
		runActionMessage = '';

		try {
			const res = await fetch(`/api/runs/${encodeURIComponent(selectedRunId)}`, {
				method: 'DELETE'
			});

			const result = await res.json();

			if (result.success) {
				runActionMessage = 'Run deleted';
				showDeleteConfirm = false;
				setTimeout(() => window.location.reload(), 1000);
			} else {
				runActionMessage = result.error || 'Failed to delete run';
			}
		} catch (err) {
			runActionMessage = 'Network error';
		} finally {
			deletingRun = false;
		}
	}

	async function handleReschedule(action: 'move_tomorrow' | 'swap_next' | 'convert_walk' | 'skip') {
		if (!data.recoveryAlert?.todaysRunId) return;
		
		rescheduling = true;
		rescheduleMessage = '';

		try {
			const res = await fetch('/api/plan/reschedule', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					planId: data.recoveryAlert.todaysRunId,
					action
				})
			});

			const result = await res.json();

			if (result.success) {
				rescheduleMessage = result.message;
				showRescheduleModal = false;
				alertDismissed = true;
				// Reload after a short delay to show the message
				setTimeout(() => window.location.reload(), 2000);
			} else {
				rescheduleMessage = result.error || 'Failed to reschedule';
			}
		} catch (err) {
			rescheduleMessage = 'Network error';
		} finally {
			rescheduling = false;
		}
	}

	// AI Coach Chat
	interface ChatMessage {
		role: 'user' | 'assistant';
		content: string;
	}
	let chatInput = $state('');
	let chatMessages = $state<ChatMessage[]>([]);
	let chatLoading = $state(false);
	let chatExpanded = $state(false);

	async function sendChatMessage() {
		if (!chatInput.trim() || chatLoading) return;

		const userMessage = chatInput.trim();
		chatInput = '';
		chatMessages = [...chatMessages, { role: 'user', content: userMessage }];
		chatLoading = true;
		chatExpanded = true;

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: userMessage,
					history: chatMessages.slice(-10) // Last 10 messages for context
				})
			});

			const result = await res.json();

			if (result.success) {
				chatMessages = [...chatMessages, { role: 'assistant', content: result.reply }];
			} else {
				chatMessages = [...chatMessages, { role: 'assistant', content: `Sorry, I had trouble responding: ${result.error}` }];
			}
		} catch (err) {
			chatMessages = [...chatMessages, { role: 'assistant', content: 'Network error. Please try again.' }];
		} finally {
			chatLoading = false;
		}
	}

	async function syncNow() {
		syncing = true;
		syncMessage = '';

		try {
			const res = await fetch('/api/sync', { method: 'POST' });
			const result: { success: boolean; message?: string; newRuns?: number; authRequired?: boolean } = await res.json();

			console.log('Sync result:', result);

			if (result.success) {
				syncMessage = result.message || 'Synced!';
				syncAttemptAfterAuth = false;
				if (result.newRuns && result.newRuns > 0) {
					// Reload page to show new runs
					window.location.reload();
				}
			} else if (result.authRequired) {
				// Show the re-auth modal only if this isn't already a retry after auth
				if (syncAttemptAfterAuth) {
					syncMessage = 'Still having trouble connecting. Please check your credentials.';
					syncAttemptAfterAuth = false;
				} else {
					syncMessage = '';
					showAuthModal = true;
				}
			} else {
				syncMessage = result.message || 'Sync failed';
			}
		} catch (err) {
			console.error('Sync error:', err);
			syncMessage = 'Network error';
		} finally {
			syncing = false;
		}
	}

	function onAuthSuccess() {
		// After successful re-auth, try syncing again
		syncAttemptAfterAuth = true; // Mark this as a retry so modal won't reopen
		syncMessage = 'Reconnected! Syncing...';
		syncNow();
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
	<!-- Garmin Re-Auth Modal -->
	<GarminAuthModal
		open={showAuthModal}
		onClose={() => (showAuthModal = false)}
		onSuccess={onAuthSuccess}
	/>

	<!-- Theme Picker Modal -->
	{#if showThemePicker}
		<button 
			type="button"
			class="fixed inset-0 z-[200] cursor-default bg-transparent" 
			onclick={() => showThemePicker = false}
			aria-label="Close theme picker"
		></button>
		<div 
			class="fixed right-4 top-16 z-[201] w-48 rounded-xl border border-slate-700/50 bg-slate-850 p-2 shadow-2xl"
			role="menu"
		>
				<!-- Light/Dark Toggle -->
				<button
					onclick={toggleDarkMode}
					class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-800"
				>
					<span class="text-slate-200">Mode</span>
					<div class="flex items-center gap-2">
						{#if isDarkMode}
							<Moon class="h-4 w-4 text-slate-400" />
							<span class="text-xs text-slate-400">Dark</span>
						{:else}
							<Sun class="h-4 w-4 text-amber-400" />
							<span class="text-xs text-amber-400">Light</span>
						{/if}
					</div>
				</button>
				
				<div class="my-2 border-t border-slate-700/50"></div>
				
				<!-- Color Themes -->
				<p class="px-3 py-1 text-xs font-medium uppercase tracking-wider text-slate-500">Accent Color</p>
				{#each themes as theme}
					<button
						onclick={() => setTheme(theme.id)}
						class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-800 {currentTheme === theme.id ? 'bg-slate-800' : ''}"
					>
						<div class="h-4 w-4 rounded-full shadow-sm" style="background-color: {theme.color}"></div>
						<span class="text-slate-200">{theme.name}</span>
						{#if currentTheme === theme.id}
							<span class="ml-auto text-xs" style="color: {theme.color}">✓</span>
						{/if}
					</button>
				{/each}
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
					<img 
						src="/icons/android-chrome-192x192.png" 
						alt="OpenCoach" 
						class="h-10 w-10 rounded-xl shadow-lg shadow-accent-900/30"
					/>
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
					<Button onclick={syncNow} variant="outline" size="sm" disabled={syncing}>
						<RefreshCw class={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
						{syncing ? 'Syncing...' : 'Sync'}
					</Button>
					
					<!-- Theme Picker Button -->
					<Button onclick={() => (showThemePicker = !showThemePicker)} variant="ghost" size="sm" title="Change theme">
						<Palette class="h-4 w-4" />
					</Button>

					<a href="/settings">
						<Button variant="ghost" size="sm" title="Settings">
							<Settings class="h-4 w-4" />
						</Button>
					</a>
				</div>
			</div>
		</header>

		<main class="mx-auto max-w-6xl px-6 py-8">
			{#if syncMessage || rescheduleMessage}
				<div class="mb-6 rounded-xl bg-accent-500/10 px-4 py-3 text-sm text-accent-400">
					{syncMessage || rescheduleMessage}
				</div>
			{/if}

			<!-- Recovery Alert -->
			{#if data.recoveryAlert && !alertDismissed}
				<div class="mb-6 rounded-2xl border {data.recoveryAlert.type === 'low' ? 'border-red-500/30 bg-red-900/20' : 'border-amber-500/30 bg-amber-900/20'} p-4">
					<div class="flex items-start gap-4">
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl {data.recoveryAlert.type === 'low' ? 'bg-red-500/20' : 'bg-amber-500/20'}">
							<AlertTriangle class="h-5 w-5 {data.recoveryAlert.type === 'low' ? 'text-red-400' : 'text-amber-400'}" />
						</div>
						<div class="flex-1">
							<h3 class="font-display font-semibold {data.recoveryAlert.type === 'low' ? 'text-red-300' : 'text-amber-300'}">
								{data.recoveryAlert.type === 'low' ? 'Low Recovery Detected' : 'Moderate Recovery'}
							</h3>
							<p class="mt-1 text-sm text-slate-300">{data.recoveryAlert.message}</p>
							
							<div class="mt-4 flex flex-wrap gap-2">
								{#if data.recoveryAlert.suggestion === 'reschedule'}
									<Button onclick={() => showRescheduleModal = true} size="sm" class="bg-red-600 hover:bg-red-700">
										<Calendar class="h-4 w-4" />
										Reschedule Options
									</Button>
								{:else}
									<Button onclick={() => showRescheduleModal = true} size="sm" variant="outline" class="border-amber-500/50 text-amber-300 hover:bg-amber-500/10">
										<Calendar class="h-4 w-4" />
										Adjust Today's Run
									</Button>
								{/if}
								<Button onclick={() => alertDismissed = true} size="sm" variant="ghost" class="text-slate-400">
									I'll push through
								</Button>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Reschedule Modal -->
			{#if showRescheduleModal}
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
					<div class="mx-4 w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-850 p-6 shadow-2xl">
						<div class="mb-6 flex items-center justify-between">
							<h2 class="font-display text-xl font-bold text-white">Adjust Today's Run</h2>
							<button onclick={() => showRescheduleModal = false} class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
								<X class="h-5 w-5" />
							</button>
						</div>

						<p class="mb-6 text-sm text-slate-400">
							Your body needs rest. Choose how you'd like to handle today's {data.recoveryAlert?.todaysRunType || 'run'}:
						</p>

						<div class="space-y-3">
							<!-- Move to Tomorrow -->
							<button
								onclick={() => handleReschedule('move_tomorrow')}
								disabled={rescheduling}
								class="flex w-full items-center gap-4 rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 text-left transition-colors hover:border-blue-500/50 hover:bg-blue-900/20 disabled:opacity-50"
							>
								<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
									<ArrowRight class="h-5 w-5 text-blue-400" />
								</div>
								<div>
									<p class="font-medium text-white">Move to Tomorrow</p>
									<p class="text-sm text-slate-400">Swap with tomorrow's workout if there is one</p>
								</div>
							</button>

							<!-- Convert to Walk -->
							<button
								onclick={() => handleReschedule('convert_walk')}
								disabled={rescheduling}
								class="flex w-full items-center gap-4 rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 text-left transition-colors hover:border-green-500/50 hover:bg-green-900/20 disabled:opacity-50"
							>
								<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20">
									<Footprints class="h-5 w-5 text-green-400" />
								</div>
								<div>
									<p class="font-medium text-white">Convert to Walk</p>
									<p class="text-sm text-slate-400">20-minute easy walk - movement without stress</p>
								</div>
							</button>

							<!-- Skip -->
							<button
								onclick={() => handleReschedule('skip')}
								disabled={rescheduling}
								class="flex w-full items-center gap-4 rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 text-left transition-colors hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
							>
								<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-700/50">
									<X class="h-5 w-5 text-slate-400" />
								</div>
								<div>
									<p class="font-medium text-white">Skip Today</p>
									<p class="text-sm text-slate-400">Rest is training too - take the day off</p>
								</div>
							</button>
						</div>

						{#if rescheduling}
							<p class="mt-4 text-center text-sm text-slate-400">
								<RefreshCw class="inline h-4 w-4 animate-spin" /> Updating...
							</p>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Pre-Run "I'm Going" Modal -->
			{#if showPreRunModal && data.todaysRun}
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
					<div class="mx-4 w-full max-w-lg rounded-2xl border border-forest-500/30 bg-gradient-to-br from-forest-900/40 to-slate-900 p-6 shadow-2xl">
						<div class="mb-4 flex items-center justify-between">
							<h2 class="font-display text-2xl font-bold text-white">Let's Go! 🏃</h2>
							<button onclick={() => { showPreRunModal = false; stopTimer(); }} class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
								<X class="h-5 w-5" />
							</button>
						</div>

						<!-- Countdown Timer (if active) -->
						{#if preRunCountdown !== null}
							<div class="mb-6 rounded-2xl bg-forest-500/20 p-6 text-center">
								<p class="text-sm font-medium text-forest-300 mb-2">Get Ready Timer</p>
								<p class="font-display text-5xl font-bold text-forest-400">{formatCountdown(preRunCountdown)}</p>
								<p class="text-sm text-forest-300/70 mt-2">Just get dressed. That's the goal.</p>
								<Button onclick={stopTimer} variant="ghost" size="sm" class="mt-3 text-forest-400">
									Cancel timer
								</Button>
							</div>
						{:else}
							<!-- Workout Summary -->
							<div class="mb-6 rounded-xl bg-slate-800/50 p-4">
								<div class="flex items-center gap-4">
									<div class="flex h-14 w-14 items-center justify-center rounded-xl bg-forest-500/20">
										<Activity class="h-7 w-7 text-forest-400" />
									</div>
									<div>
										<p class="text-sm text-slate-400">Today's Workout</p>
										<p class="font-display text-xl font-bold text-white">{data.todaysRun.type}</p>
										<p class="text-lg text-forest-400">{data.todaysRun.distance}</p>
									</div>
								</div>
								<p class="mt-3 text-sm text-slate-300">{data.todaysRun.description}</p>
							</div>

							<!-- Motivational Message -->
							<div class="mb-6 rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
								<div class="flex gap-3">
									<Lightbulb class="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
									<p class="text-amber-200">{getPreRunMessage(data.todaysRun.type)}</p>
								</div>
							</div>

							<!-- Quick Checklist -->
							<div class="mb-6 space-y-2">
								<p class="text-sm font-medium text-slate-400 mb-3">Quick Checklist</p>
								<div class="flex items-center gap-3 text-slate-300">
									<CheckCircle2 class="h-4 w-4 text-forest-400" />
									<span class="text-sm">Shoes on</span>
								</div>
								<div class="flex items-center gap-3 text-slate-300">
									<CheckCircle2 class="h-4 w-4 text-forest-400" />
									<span class="text-sm">Phone charged (for safety)</span>
								</div>
								<div class="flex items-center gap-3 text-slate-300">
									<CheckCircle2 class="h-4 w-4 text-forest-400" />
									<span class="text-sm">Water ready for after</span>
								</div>
								{#if data.todaysRun.garminSynced}
									<div class="flex items-center gap-3 text-forest-300">
										<Watch class="h-4 w-4 text-forest-400" />
										<span class="text-sm">Workout is on your watch! ✓</span>
									</div>
								{/if}
							</div>

							<!-- Action Buttons -->
							<div class="flex gap-3">
								<Button onclick={startGetReadyTimer} variant="outline" class="flex-1 border-forest-500/50 text-forest-300">
									<Clock class="h-4 w-4" />
									10 min timer
								</Button>
								<Button onclick={() => showPreRunModal = false} class="flex-1 bg-forest-600 hover:bg-forest-700">
									<Play class="h-4 w-4" />
									I'm ready!
								</Button>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Edit Run Modal -->
			{#if showEditRunModal && selectedRun}
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
					<div class="mx-4 w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-850 p-6 shadow-2xl">
						<div class="mb-6 flex items-center justify-between">
							<h2 class="font-display text-xl font-bold text-white">Edit Run</h2>
							<button onclick={() => showEditRunModal = false} class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
								<X class="h-5 w-5" />
							</button>
						</div>

						<form onsubmit={(e) => { e.preventDefault(); saveRunEdit(); }} class="space-y-4">
							<div class="space-y-2">
								<Label for="edit-date">Date</Label>
								<Input id="edit-date" type="date" bind:value={editDate} />
							</div>

							<div class="grid grid-cols-2 gap-4">
								<div class="space-y-2">
									<Label for="edit-distance">Distance (km)</Label>
									<Input id="edit-distance" type="number" step="0.1" bind:value={editDistance} />
								</div>
								<div class="space-y-2">
									<Label for="edit-duration">Duration (min)</Label>
									<Input id="edit-duration" type="number" step="1" bind:value={editDuration} />
								</div>
							</div>

							<div class="space-y-2">
								<Label for="edit-hr">Avg Heart Rate (optional)</Label>
								<Input id="edit-hr" type="number" placeholder="145" bind:value={editHr} />
							</div>

							{#if runActionMessage}
								<p class="text-sm text-amber-400">{runActionMessage}</p>
							{/if}

							<div class="flex gap-3 pt-4">
								<Button type="button" variant="outline" onclick={() => showEditRunModal = false} class="flex-1">
									Cancel
								</Button>
								<Button type="submit" class="flex-1" disabled={editingRun}>
									{editingRun ? 'Saving...' : 'Save Changes'}
								</Button>
							</div>
						</form>
					</div>
				</div>
			{/if}

			<!-- Delete Confirmation Modal -->
			{#if showDeleteConfirm && selectedRun}
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
					<div class="mx-4 w-full max-w-sm rounded-2xl border border-red-500/30 bg-slate-850 p-6 shadow-2xl">
						<div class="mb-4 flex items-center gap-3">
							<div class="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
								<Trash2 class="h-5 w-5 text-red-400" />
							</div>
							<h2 class="font-display text-xl font-bold text-white">Delete Run?</h2>
						</div>

						<p class="mb-2 text-slate-300">
							Are you sure you want to delete this run?
						</p>
						<p class="mb-6 text-sm text-slate-400">
							{selectedRun.dateFormatted} • {selectedRun.distance} • {selectedRun.duration}
						</p>

						{#if runActionMessage}
							<p class="mb-4 text-sm text-amber-400">{runActionMessage}</p>
						{/if}

						<div class="flex gap-3">
							<Button variant="outline" onclick={() => showDeleteConfirm = false} class="flex-1">
								Cancel
							</Button>
							<Button onclick={deleteRun} class="flex-1 bg-red-600 hover:bg-red-700" disabled={deletingRun}>
								{deletingRun ? 'Deleting...' : 'Delete'}
							</Button>
						</div>
					</div>
				</div>
			{/if}

			<!-- AI Coach Chat -->
			<div class="mb-6">
				<div class="rounded-2xl border border-slate-700/50 bg-slate-850/80 backdrop-blur-sm overflow-hidden">
					<!-- Chat Input -->
					<form onsubmit={(e) => { e.preventDefault(); sendChatMessage(); }} class="flex items-center gap-3 p-4">
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-coral-500 to-coral-600 shadow-lg shadow-coral-900/20">
							<MessageCircle class="h-5 w-5 text-white" />
						</div>
						<input
							type="text"
							bind:value={chatInput}
							placeholder="Ask your coach anything... (training tips, plan questions, motivation)"
							class="flex-1 bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none"
							disabled={chatLoading}
						/>
						<Button type="submit" size="sm" disabled={chatLoading || !chatInput.trim()}>
							{chatLoading ? '...' : 'Send'}
						</Button>
					</form>

					<!-- Chat History (expandable) -->
					{#if chatMessages.length > 0}
						<div class="border-t border-slate-700/50">
							{#if !chatExpanded && chatMessages.length > 2}
								<button
									onclick={() => chatExpanded = true}
									class="w-full px-4 py-2 text-xs text-slate-500 hover:text-slate-400 hover:bg-slate-800/50"
								>
									Show {chatMessages.length} messages...
								</button>
							{/if}
							
							<div class="max-h-64 overflow-y-auto p-4 space-y-3">
								{#each chatExpanded ? chatMessages : chatMessages.slice(-2) as msg}
									<div class="flex gap-3 {msg.role === 'user' ? 'justify-end' : ''}">
										{#if msg.role === 'assistant'}
											<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-forest-500/20">
												<Lightbulb class="h-4 w-4 text-forest-400" />
											</div>
										{/if}
										<div class="rounded-xl px-4 py-2 max-w-[80%] {msg.role === 'user' ? 'bg-forest-600/30 text-forest-100' : 'bg-slate-800 text-slate-200'}">
											<p class="text-sm whitespace-pre-wrap">{msg.content}</p>
										</div>
									</div>
								{/each}
								{#if chatLoading}
									<div class="flex gap-3">
										<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-forest-500/20">
											<Lightbulb class="h-4 w-4 text-forest-400 animate-pulse" />
										</div>
										<div class="rounded-xl bg-slate-800 px-4 py-2">
											<p class="text-sm text-slate-400">Thinking...</p>
										</div>
									</div>
								{/if}
							</div>

							{#if chatExpanded && chatMessages.length > 0}
								<button
									onclick={() => { chatMessages = []; chatExpanded = false; }}
									class="w-full border-t border-slate-700/50 px-4 py-2 text-xs text-slate-500 hover:text-red-400 hover:bg-slate-800/50"
								>
									Clear conversation
								</button>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Next Run Hero -->
			{#if data.nextRun}
				<Card class="mb-8 border-accent-500/30 bg-gradient-to-br from-accent-900/20 to-slate-900">
					<CardContent class="p-6">
						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium uppercase tracking-wider text-accent-400">
									{data.todaysRun ? "Today's Run" : 'Next Run'}
								</p>
								<h2 class="mt-1 font-display text-2xl font-bold text-white">{data.nextRun.dateFormatted}</h2>
								<div class="mt-2 flex items-center gap-3">
									<span class="rounded-lg bg-accent-500/20 px-3 py-1 text-sm font-medium text-accent-300">
										{data.nextRun.type}
									</span>
									<span class="text-lg font-semibold text-slate-200">{data.nextRun.distance}</span>
								</div>
								<p class="mt-2 text-sm text-slate-400">{data.nextRun.description}</p>
								
								<!-- "I'm Going" Button (only shows for today's run) -->
								{#if data.todaysRun}
									<Button 
										onclick={() => showPreRunModal = true} 
										class="mt-4 bg-forest-600 hover:bg-forest-700 shadow-lg shadow-forest-900/30"
									>
										<Play class="h-4 w-4" />
										I'm Going! 🏃
									</Button>
								{/if}
							</div>
							<div class="hidden sm:block">
								{#if data.todaysRun}
									<button 
										onclick={() => showPreRunModal = true}
										class="flex h-20 w-20 items-center justify-center rounded-2xl bg-forest-500/20 transition-all hover:bg-forest-500/30 hover:scale-105"
									>
										<Play class="h-10 w-10 text-forest-400" />
									</button>
								{:else}
									<div class="flex h-20 w-20 items-center justify-center rounded-2xl bg-forest-500/20">
										<Calendar class="h-10 w-10 text-forest-400" />
									</div>
								{/if}
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

			<!-- Health Stats (from Garmin) -->
			{#if data.health}
				{@const batteryLevel = data.health.bodyBattery?.morning}
				<Card class="mb-8 border-indigo-500/20 bg-gradient-to-br from-indigo-900/10 to-slate-900">
					<CardHeader>
						<CardTitle class="flex items-center gap-2 text-lg">
							<Heart class="h-5 w-5 text-indigo-400" />
							Today's Recovery
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<!-- Sleep -->
							{#if data.health.sleep}
								<div class="rounded-xl bg-slate-800/50 p-4">
									<div class="flex items-center gap-2 mb-2">
										<BedDouble class="h-4 w-4 text-blue-400" />
										<span class="text-sm text-slate-400">Sleep</span>
									</div>
									<p class="font-display text-2xl font-bold text-white">
										{data.health.sleep.durationHours.toFixed(1)}<span class="text-sm font-normal text-slate-400">hrs</span>
									</p>
									<p class="text-xs text-slate-500 mt-1 capitalize">{data.health.sleep.quality}</p>
								</div>
							{/if}

							<!-- Body Battery -->
							{#if batteryLevel !== undefined}
								<div class="rounded-xl bg-slate-800/50 p-4">
									<div class="flex items-center gap-2 mb-2">
										<Battery class="h-4 w-4 text-emerald-400" />
										<span class="text-sm text-slate-400">Body Battery</span>
									</div>
									<p class="font-display text-2xl font-bold {batteryLevel >= 50 ? 'text-emerald-400' : batteryLevel >= 25 ? 'text-amber-400' : 'text-red-400'}">
										{batteryLevel}<span class="text-sm font-normal text-slate-400">/100</span>
									</p>
									<p class="text-xs text-slate-500 mt-1">
										{batteryLevel >= 70 ? 'Great for a workout!' : batteryLevel >= 40 ? 'Take it easy' : 'Consider rest'}
									</p>
								</div>
							{/if}

							<!-- HRV -->
							{#if data.health.hrv}
								<div class="rounded-xl bg-slate-800/50 p-4">
									<div class="flex items-center gap-2 mb-2">
										<Activity class="h-4 w-4 text-purple-400" />
										<span class="text-sm text-slate-400">HRV</span>
									</div>
									<p class="font-display text-2xl font-bold text-white">
										{data.health.hrv.avg}<span class="text-sm font-normal text-slate-400">ms</span>
									</p>
									<p class="text-xs mt-1 capitalize {data.health.hrv.status === 'balanced' ? 'text-emerald-400' : data.health.hrv.status === 'low' ? 'text-red-400' : 'text-amber-400'}">
										{data.health.hrv.status}
									</p>
								</div>
							{/if}

							<!-- Resting HR -->
							{#if data.health.restingHR}
								<div class="rounded-xl bg-slate-800/50 p-4">
									<div class="flex items-center gap-2 mb-2">
										<Heart class="h-4 w-4 text-red-400" />
										<span class="text-sm text-slate-400">Resting HR</span>
									</div>
									<p class="font-display text-2xl font-bold text-white">
										{data.health.restingHR}<span class="text-sm font-normal text-slate-400">bpm</span>
									</p>
									{#if data.health.steps}
										<p class="text-xs text-slate-500 mt-1">{data.health.steps.toLocaleString()} steps</p>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Recovery Summary -->
						<div class="mt-4 rounded-xl bg-slate-800/30 p-3 text-center">
							{#if batteryLevel !== undefined}
								{#if batteryLevel >= 70}
									<p class="text-sm text-emerald-400">✨ You're well recovered! Great day for a quality workout.</p>
								{:else if batteryLevel >= 40}
									<p class="text-sm text-amber-400">⚡ Moderate recovery. Consider an easy run or rest day.</p>
								{:else}
									<p class="text-sm text-red-400">😴 Low recovery. Prioritize rest and sleep today.</p>
								{/if}
							{:else}
								<p class="text-sm text-slate-400">Wear your watch to track recovery metrics.</p>
							{/if}
						</div>
					</CardContent>
				</Card>
			{/if}

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
								<div class="group rounded-xl border border-slate-800/50 bg-slate-900/50 p-4 transition-colors hover:border-slate-700/50">
									<div class="flex items-start justify-between">
										<div class="flex-1">
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
										
										<!-- Edit/Delete buttons (visible on hover) -->
										<div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
											<button
												onclick={() => openEditModal(run)}
												class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
												title="Edit run"
											>
												<Pencil class="h-4 w-4" />
											</button>
											<button
												onclick={() => openDeleteConfirm(run)}
												class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-900/30 hover:text-red-400"
												title="Delete run"
											>
												<Trash2 class="h-4 w-4" />
											</button>
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
