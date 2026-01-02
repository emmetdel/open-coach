<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { CheckCircle, ChevronRight, Loader2, AlertCircle, Bell, Mail } from 'lucide-svelte';

	const AVAILABLE_MODELS = [
		{ id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic' },
		{ id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
		{ id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
		{ id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
		{ id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'Google' },
		{ id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'Meta' },
		{ id: 'mistralai/mistral-small-24b-instruct-2501', name: 'Mistral Small', provider: 'Mistral' },
		{ id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' }
	];

	let step = $state(1);
	let loading = $state(false);
	let error = $state('');

	// Step 1: Credentials
	let garminEmail = $state('');
	let garminPassword = $state('');
	let openrouterKey = $state('');
	let selectedModel = $state('anthropic/claude-3.5-haiku');
	let skipValidation = $state(false);

	// Step 2: Goals
	let targetDate = $state('');
	let selectedDays = $state<string[]>([]);
	let currentFitness = $state('');

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
		if (!garminEmail || !garminPassword || !openrouterKey) {
			error = 'Please fill in all fields';
			return;
		}

		loading = true;
		error = '';

		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					garmin_email: garminEmail,
					garmin_password: garminPassword,
					openrouter_key: openrouterKey,
					openrouter_model: selectedModel,
					skip_validation: skipValidation
				})
			});

			const data = await res.json();

			if (!res.ok || !data.success) {
				error = data.errors?.join(', ') || 'Failed to save credentials';
				return;
			}

			step = 2;
		} catch (e) {
			error = 'Network error. Please try again.';
		} finally {
			loading = false;
		}
	}

	async function saveGoals() {
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

			const data = await res.json();

			if (!res.ok || !data.success) {
				error = data.errors?.join(', ') || 'Failed to save goals';
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
				applicationServerKey: urlBase64ToUint8Array(publicKey)
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
	
	<div class="relative z-10 flex min-h-screen items-center justify-center p-6">
		<div class="w-full max-w-lg">
			<!-- Logo/Header -->
			<div class="mb-8 text-center">
				<div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-forest-500 to-forest-600 shadow-lg shadow-forest-900/50">
					<svg class="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
					</svg>
				</div>
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

			<!-- Step 1: Credentials -->
			{#if step === 1}
				<Card class="border-slate-700/50 bg-slate-850/80 backdrop-blur">
					<CardHeader>
						<CardTitle>Connect Your Accounts</CardTitle>
						<CardDescription>
							Link your Garmin account and add your OpenRouter API key.
						</CardDescription>
					</CardHeader>
					<CardContent>
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

							<div class="border-t border-slate-700 pt-6 space-y-4">
								<div class="space-y-2">
									<Label for="openrouter-key">OpenRouter API Key</Label>
									<Input
										id="openrouter-key"
										type="password"
										placeholder="sk-or-..."
										bind:value={openrouterKey}
									/>
									<p class="text-xs text-slate-500">
										Get your API key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" class="text-forest-400 hover:underline">openrouter.ai</a>
									</p>
								</div>

								<div class="space-y-2">
									<Label for="model-select">AI Model</Label>
									<select
										id="model-select"
										bind:value={selectedModel}
										class="flex h-11 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/20"
									>
										{#each AVAILABLE_MODELS as model}
											<option value={model.id}>{model.name} ({model.provider})</option>
										{/each}
									</select>
									<p class="text-xs text-slate-500">
										Choose your preferred AI model for coaching feedback
									</p>
								</div>
							</div>

							{#if error}
								<div class="flex items-center gap-2 rounded-lg bg-coral-500/10 p-3 text-sm text-coral-400">
									<AlertCircle class="h-4 w-4 shrink-0" />
									{error}
								</div>
							{/if}

							<label class="flex items-center gap-2 text-sm text-slate-400">
								<input
									type="checkbox"
									bind:checked={skipValidation}
									class="h-4 w-4 rounded border-slate-600 bg-slate-700 text-forest-600 focus:ring-forest-500"
								/>
								Skip validation (use if Garmin blocks automated login)
							</label>

							<Button type="submit" class="w-full" disabled={loading}>
								{#if loading}
									<Loader2 class="h-4 w-4 animate-spin" />
									Validating...
								{:else}
									Continue
									<ChevronRight class="h-4 w-4" />
								{/if}
							</Button>
						</form>
					</CardContent>
				</Card>
			{/if}

			<!-- Step 2: Goals -->
			{#if step === 2}
				<Card class="border-slate-700/50 bg-slate-850/80 backdrop-blur">
					<CardHeader>
						<CardTitle>Set Your Goals</CardTitle>
						<CardDescription>
							Tell us about your running goals and availability.
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

							<div class="flex gap-3">
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
