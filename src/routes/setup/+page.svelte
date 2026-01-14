<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { CheckCircle, ChevronRight, Loader2, AlertCircle, Bell, Mail, RotateCcw } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Derived values from props (reactive)
	let garminFromEnv = $derived(data.garminFromEnv ?? false);
	let isEditing = $derived(!!(data.existingSettings?.garminEmail && data.existingSettings?.targetDate));
	let initialEmail = $derived(data.existingSettings?.garminEmail || '');
	let initialTargetDate = $derived(data.existingSettings?.targetDate || '');
	let initialDays = $derived(data.existingSettings?.availableDays || []);
	let initialFitness = $derived(data.existingSettings?.currentFitness || '');

	// Start at step 2 (Goals) if editing OR if Garmin is from env vars
	let step = $state(1);
	$effect(() => {
		if (isEditing || garminFromEnv) step = 2;
	});
	
	let loading = $state(false);
	let error = $state('');
	let resetting = $state(false);

	// Step 1: Garmin Credentials
	let garminEmail = $state('');
	let garminPassword = $state('');
	
	// Initialize from props on mount
	$effect(() => {
		if (initialEmail && !garminEmail) garminEmail = initialEmail;
	});

	// Reset Garmin credentials
	async function resetGarminCredentials() {
		if (!confirm('This will clear your Garmin credentials. You will need to enter them again. Continue?')) {
			return;
		}
		
		resetting = true;
		error = '';
		
		try {
			const res = await fetch('/api/settings?what=garmin', { method: 'DELETE' });
			const result = await res.json();
			
			if (res.ok && result.success) {
				// Clear local state and go to step 1
				garminEmail = '';
				garminPassword = '';
				step = 1;
			} else {
				error = result.message || 'Failed to reset credentials';
			}
		} catch (e) {
			error = 'Network error. Please try again.';
		} finally {
			resetting = false;
		}
	}

	// Step 2: Goals
	let targetDate = $state('');
	let selectedDays = $state<string[]>([]);
	let currentFitness = $state('');
	
	// Initialize goals from props on mount
	$effect(() => {
		if (initialTargetDate && !targetDate) targetDate = initialTargetDate;
		if (initialDays.length && !selectedDays.length) selectedDays = [...initialDays];
		if (initialFitness && !currentFitness) currentFitness = initialFitness;
	});

	// Step 3: Notifications
	let notificationEmail = $state('');
	let pushEnabled = $state(false);
	let emailEnabled = $state(false);
	let notifyOnSync = $state(true);
	let notifyOnMissed = $state(true);

	const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	function toggleDay(day: string) {
		if (selectedDays.includes(day)) {
			selectedDays = selectedDays.filter((d) => d !== day);
		} else {
			selectedDays = [...selectedDays, day];
		}
	}

	async function saveCredentials() {
		if (!garminEmail || !garminPassword) {
			error = 'Please enter your Garmin email and password';
			return;
		}

		loading = true;
		error = '';

		try {
			// First, try to authenticate with Garmin directly
			const authRes = await fetch('/api/garmin/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: garminEmail,
					password: garminPassword
				})
			});

			const authData = await authRes.json();

			if (!authRes.ok || !authData.success) {
				error = authData.error || authData.hint || 'Failed to connect to Garmin';
				return;
			}

			// Auth successful - save credentials to settings
			await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					garmin_email: garminEmail,
					garmin_password: garminPassword
				})
			});

			step = 2;
		} catch (e) {
			error = 'Network error. Please try again.';
		} finally {
			loading = false;
		}
	}

	async function saveGoals(andGeneratePlan = false) {
		if (!targetDate || selectedDays.length === 0) {
			error = 'Please select a target date and at least one available day';
			return;
		}

		loading = true;
		error = '';

		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					target_date: targetDate,
					available_days: selectedDays,
					current_fitness: currentFitness
				})
			});

			const result = await res.json();

			if (!res.ok || !result.success) {
				error = result.errors?.join(', ') || 'Failed to save goals';
				return;
			}

			// If editing, regenerate the plan and go back to dashboard
			if (andGeneratePlan || isEditing) {
				await fetch('/api/plan', { method: 'POST' });
				goto('/');
				return;
			}

			step = 3;
		} catch (e) {
			error = 'Network error. Please try again.';
		} finally {
			loading = false;
		}
	}

	async function enablePushNotifications() {
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
			error = 'Push notifications are not supported in this browser';
			return;
		}

		if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
			error = 'Push notifications are disabled for local development';
			return;
		}

		try {
			// Register service worker
			const registration = await navigator.serviceWorker.register('/sw.js');
			await navigator.serviceWorker.ready;

			// Get VAPID public key
			const keyRes = await fetch('/api/push');
			const { publicKey } = await keyRes.json();

			// Request permission
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				error = 'Notification permission denied';
				return;
			}

			// Subscribe to push
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
			});

			// Save subscription to server
			await fetch('/api/push', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(subscription.toJSON())
			});

			pushEnabled = true;
		} catch (e) {
			console.error('Failed to enable push:', e);
			error = 'Failed to enable push notifications';
		}
	}

	function urlBase64ToUint8Array(base64String: string): Uint8Array {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
		const rawData = atob(base64);
		const outputArray = new Uint8Array(rawData.length);
		for (let i = 0; i < rawData.length; ++i) {
			outputArray[i] = rawData.charCodeAt(i);
		}
		return outputArray;
	}

	async function finishSetup() {
		loading = true;
		error = '';

		try {
			// Save notification settings
			await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					notification_email: notificationEmail,
					email_enabled: emailEnabled && !!notificationEmail,
					notify_on_sync: notifyOnSync,
					notify_on_missed: notifyOnMissed
				})
			});

			// Trigger initial sync
			await fetch('/api/sync', { method: 'POST' });

			// Redirect to dashboard
			goto('/');
		} catch (e) {
			error = 'Network error. Please try again.';
		} finally {
			loading = false;
		}
	}

	function skipNotifications() {
		goto('/');
	}
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-925 via-slate-900 to-slate-925">
	<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-forest-900/20 via-transparent to-transparent"></div>
	
	<div class="relative z-10 flex min-h-screen items-center justify-center p-4 sm:p-6">
		<div class="w-full max-w-lg">
			<!-- Logo/Header -->
			<div class="mb-8 text-center">
				<img 
					src="/icons/android-chrome-192x192.png" 
					alt="OpenCoach" 
					class="mx-auto mb-4 h-20 w-20 rounded-2xl shadow-lg shadow-forest-900/50"
				/>
				<h1 class="font-display text-3xl font-bold text-white">OpenCoach</h1>
				<p class="mt-2 text-slate-400">Your AI running companion</p>
			</div>

			<!-- Progress Steps -->
			<div class="mb-8 flex items-center justify-center gap-3">
				{#each [1, 2, 3] as s}
					<div class="flex items-center gap-2">
						<div class={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${step >= s ? 'bg-forest-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
							{#if step > s}
								<CheckCircle class="h-5 w-5" />
							{:else}
								{s}
							{/if}
						</div>
						<span class={`text-sm ${step >= s ? 'text-slate-200' : 'text-slate-500'}`}>
							{s === 1 ? 'Connect' : s === 2 ? 'Goals' : 'Notify'}
						</span>
					</div>
					{#if s < 3}
						<div class="h-px w-6 bg-slate-700"></div>
					{/if}
				{/each}
			</div>

			<!-- Step 1: Garmin Credentials -->
			{#if step === 1}
				<Card class="border-slate-700/50 bg-slate-850/80 backdrop-blur">
					<CardHeader>
						<CardTitle>Connect Garmin</CardTitle>
						<CardDescription>
							Link your Garmin Connect account to sync your runs.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{#if garminFromEnv}
							<!-- Credentials from env vars - show info and skip -->
							<div class="space-y-6">
								<div class="rounded-lg bg-forest-500/10 border border-forest-500/20 p-4 text-sm">
									<p class="font-medium text-forest-400 mb-2">✓ Garmin credentials configured</p>
									<p class="text-slate-400">Your Garmin credentials are set via environment variables. No manual entry needed.</p>
									<p class="text-slate-500 mt-2 text-xs">Email: {data.existingSettings?.garminEmail}</p>
								</div>

								<Button type="button" class="w-full" onclick={() => (step = 2)}>
									Continue
									<ChevronRight class="h-4 w-4" />
								</Button>
							</div>
						{:else}
							<form onsubmit={(e) => { e.preventDefault(); saveCredentials(); }} class="space-y-6">
								<div class="space-y-4">
									<div class="space-y-2">
										<Label for="garmin-email">Garmin Email</Label>
										<Input
											id="garmin-email"
											type="email"
											placeholder="your@email.com"
											bind:value={garminEmail}
											autocomplete="email"
										/>
									</div>
									<div class="space-y-2">
										<Label for="garmin-password">Garmin Password</Label>
										<Input
											id="garmin-password"
											type="password"
											placeholder="••••••••"
											bind:value={garminPassword}
											autocomplete="current-password"
										/>
									</div>
								</div>

								<div class="rounded-lg bg-slate-800/50 p-4 text-sm text-slate-400">
									<p class="font-medium text-slate-300 mb-2">💡 Having trouble?</p>
									<p>Make sure you can log in at <a href="https://connect.garmin.com" target="_blank" class="text-forest-400 underline">connect.garmin.com</a> with these credentials. If Garmin blocks the login, wait 15-30 minutes and try again.</p>
								</div>

								{#if error}
									<div class="flex items-center gap-2 rounded-lg bg-coral-500/10 p-3 text-sm text-coral-400">
										<AlertCircle class="h-4 w-4 shrink-0" />
										{error}
									</div>
								{/if}

								<Button type="submit" class="w-full" disabled={loading}>
									{#if loading}
										<Loader2 class="h-4 w-4 animate-spin" />
										Saving...
									{:else}
										Continue
										<ChevronRight class="h-4 w-4" />
									{/if}
								</Button>
							</form>
						{/if}
					</CardContent>
				</Card>
			{/if}

			<!-- Step 2: Goals -->
			{#if step === 2}
				<Card class="border-slate-700/50 bg-slate-850/80 backdrop-blur">
					<CardHeader>
						<CardTitle>{isEditing ? 'Edit Your Goals' : 'Set Your Goals'}</CardTitle>
						<CardDescription>
							{isEditing 
								? 'Update your running days and goals. A new plan will be generated.'
								: 'Tell us about your running goals and availability.'}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onsubmit={(e) => { e.preventDefault(); saveGoals(); }} class="space-y-6">
							<div class="space-y-2">
								<Label for="target-date">Target Race/Goal Date</Label>
								<Input
									id="target-date"
									type="date"
									bind:value={targetDate}
									min={new Date().toISOString().split('T')[0]}
								/>
							</div>

							<div class="space-y-2">
								<Label>Available Days for Running</Label>
								<div class="flex flex-wrap gap-2">
									{#each daysOfWeek as day}
										<button
											type="button"
											onclick={() => toggleDay(day)}
											class={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
												selectedDays.includes(day)
													? 'bg-forest-600 text-white shadow-lg shadow-forest-900/30'
													: 'bg-slate-800 text-slate-300 hover:bg-slate-700'
											}`}
										>
											{day}
										</button>
									{/each}
								</div>
							</div>

							<div class="space-y-2">
								<Label for="current-fitness">Current Fitness Level (optional)</Label>
								<Textarea
									id="current-fitness"
									placeholder="e.g., I can run 5k comfortably, usually run 2-3 times per week..."
									bind:value={currentFitness}
								/>
							</div>

							{#if error}
								<div class="flex items-center gap-2 rounded-lg bg-coral-500/10 p-3 text-sm text-coral-400">
									<AlertCircle class="h-4 w-4 shrink-0" />
									{error}
								</div>
							{/if}

							<!-- Reset Garmin credentials option (only if not from env vars) -->
							{#if !garminFromEnv && data.existingSettings?.garminEmail}
								<div class="rounded-lg bg-slate-800/50 p-4 text-sm">
									<p class="text-slate-400 mb-3">
										Wrong Garmin credentials? 
										<span class="text-slate-500">({data.existingSettings.garminEmail})</span>
									</p>
									<Button 
										type="button" 
										variant="outline" 
										size="sm"
										onclick={resetGarminCredentials}
										disabled={resetting}
									>
										{#if resetting}
											<Loader2 class="h-4 w-4 animate-spin" />
											Resetting...
										{:else}
											<RotateCcw class="h-4 w-4" />
											Reset Garmin Credentials
										{/if}
									</Button>
								</div>
							{/if}

							<div class="flex gap-3">
								{#if isEditing}
									<Button type="button" variant="outline" onclick={() => goto('/')} class="flex-1">
										Cancel
									</Button>
									<Button type="submit" class="flex-1" disabled={loading}>
										{#if loading}
											<Loader2 class="h-4 w-4 animate-spin" />
											Saving...
										{:else}
											Save & Regenerate Plan
										{/if}
									</Button>
								{:else if garminFromEnv}
									<Button type="submit" class="flex-1" disabled={loading}>
										{#if loading}
											<Loader2 class="h-4 w-4 animate-spin" />
											Saving...
										{:else}
											Continue
											<ChevronRight class="h-4 w-4" />
										{/if}
									</Button>
								{:else}
									<Button type="button" variant="outline" onclick={() => (step = 1)} class="flex-1">
										Back
									</Button>
									<Button type="submit" class="flex-1" disabled={loading}>
										{#if loading}
											<Loader2 class="h-4 w-4 animate-spin" />
											Saving...
										{:else}
											Continue
											<ChevronRight class="h-4 w-4" />
										{/if}
									</Button>
								{/if}
							</div>
						</form>
					</CardContent>
				</Card>
			{/if}

			<!-- Step 3: Notifications -->
			{#if step === 3}
				<Card class="border-slate-700/50 bg-slate-850/80 backdrop-blur">
					<CardHeader>
						<CardTitle>Stay in the Loop</CardTitle>
						<CardDescription>
							Get notified when runs sync and receive your coach's feedback.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div class="space-y-6">
							<!-- Push Notifications -->
							<div class="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
								<div class="flex items-start gap-4">
									<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-forest-500/20">
										<Bell class="h-5 w-5 text-forest-400" />
									</div>
									<div class="flex-1">
										<h3 class="font-medium text-slate-200">Push Notifications</h3>
										<p class="mt-1 text-sm text-slate-400">
											Get instant alerts in your browser when runs are synced.
										</p>
										{#if pushEnabled}
											<div class="mt-3 flex items-center gap-2 text-sm text-forest-400">
												<CheckCircle class="h-4 w-4" />
												Enabled
											</div>
										{:else}
											<Button
												type="button"
												variant="secondary"
												size="sm"
												class="mt-3"
												onclick={enablePushNotifications}
											>
												Enable Push
											</Button>
										{/if}
									</div>
								</div>
							</div>

							<!-- Email Notifications -->
							<div class="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
								<div class="flex items-start gap-4">
									<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-coral-500/20">
										<Mail class="h-5 w-5 text-coral-400" />
									</div>
									<div class="flex-1">
										<h3 class="font-medium text-slate-200">Email Notifications</h3>
										<p class="mt-1 text-sm text-slate-400">
											Receive run summaries and feedback via email.
										</p>
										<div class="mt-3 space-y-3">
											<Input
												type="email"
												placeholder="your@email.com"
												bind:value={notificationEmail}
											/>
											<label class="flex items-center gap-2 text-sm text-slate-300">
												<input
													type="checkbox"
													bind:checked={emailEnabled}
													class="h-4 w-4 rounded border-slate-600 bg-slate-700 text-forest-600 focus:ring-forest-500"
												/>
												Enable email notifications
											</label>
										</div>
									</div>
								</div>
							</div>

							<!-- Notification Events -->
							<div class="space-y-3">
								<Label>Notify me when:</Label>
								<label class="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">
									<input
										type="checkbox"
										bind:checked={notifyOnSync}
										class="h-4 w-4 rounded border-slate-600 bg-slate-700 text-forest-600 focus:ring-forest-500"
									/>
									A run is synced with AI feedback
								</label>
								<label class="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">
									<input
										type="checkbox"
										bind:checked={notifyOnMissed}
										class="h-4 w-4 rounded border-slate-600 bg-slate-700 text-forest-600 focus:ring-forest-500"
									/>
									A scheduled run is missed and rescheduled
								</label>
							</div>

							{#if error}
								<div class="flex items-center gap-2 rounded-lg bg-coral-500/10 p-3 text-sm text-coral-400">
									<AlertCircle class="h-4 w-4 shrink-0" />
									{error}
								</div>
							{/if}

							<div class="flex gap-3">
								<Button type="button" variant="outline" onclick={() => (step = 2)} class="flex-1">
									Back
								</Button>
								<Button type="button" variant="ghost" onclick={skipNotifications}>
									Skip
								</Button>
								<Button type="button" class="flex-1" onclick={finishSetup} disabled={loading}>
									{#if loading}
										<Loader2 class="h-4 w-4 animate-spin" />
										Finishing...
									{:else}
										Get Started
									{/if}
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			{/if}

			<!-- Footer -->
			<p class="mt-8 text-center text-sm text-slate-500">
				Mental health over metrics. Every run counts.
			</p>
		</div>
	</div>
</div>
