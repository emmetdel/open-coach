<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { X, Loader2, CheckCircle, AlertCircle } from 'lucide-svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		onSuccess: () => void;
	}

	let { open, onClose, onSuccess }: Props = $props();

	// Form state
	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);

	// Reset state when modal opens
	$effect(() => {
		if (open) {
			error = '';
			success = false;
		}
	});

	async function handleLogin() {
		if (!email || !password) {
			error = 'Please enter your Garmin email and password';
			return;
		}

		loading = true;
		error = '';

		try {
			const res = await fetch('/api/garmin/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			});

			const data = await res.json();

			if (data.success) {
				success = true;
				// Also save credentials to settings
				await fetch('/api/settings', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						garmin_email: email,
						garmin_password: password
					})
				});
				
				setTimeout(() => {
					onSuccess();
					onClose();
				}, 1500);
			} else {
				error = data.error || data.hint || 'Login failed';
			}
		} catch (err) {
			error = 'Network error. Please try again.';
		} finally {
			loading = false;
		}
	}

	function handleClose() {
		email = '';
		password = '';
		error = '';
		success = false;
		onClose();
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
		<div class="mx-4 w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-850 shadow-2xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-slate-700/50 p-5">
				<div class="flex items-center gap-3">
					{#if success}
						<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-500/20">
							<CheckCircle class="h-5 w-5 text-forest-400" />
						</div>
					{:else}
						<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-500/20">
							<svg class="h-5 w-5 text-forest-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
							</svg>
						</div>
					{/if}
					<div>
						<h2 class="font-display text-lg font-bold text-white">
							{success ? 'Connected!' : 'Connect Garmin'}
						</h2>
					</div>
				</div>
				<button onclick={handleClose} class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Content -->
			<div class="p-5">
				{#if success}
					<div class="text-center py-6">
						<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-forest-500/20">
							<CheckCircle class="h-8 w-8 text-forest-400" />
						</div>
						<p class="text-slate-300">Syncing your runs...</p>
					</div>
				{:else}
					<form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="space-y-4">
						<div class="space-y-2">
							<Label for="garmin-email">Garmin Email</Label>
							<Input
								id="garmin-email"
								type="email"
								placeholder="your@email.com"
								bind:value={email}
								autocomplete="email"
							/>
						</div>

						<div class="space-y-2">
							<Label for="garmin-password">Garmin Password</Label>
							<Input
								id="garmin-password"
								type="password"
								placeholder="••••••••"
								bind:value={password}
								autocomplete="current-password"
							/>
						</div>

						{#if error}
							<div class="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
								<AlertCircle class="h-4 w-4 shrink-0 mt-0.5" />
								<span>{error}</span>
							</div>
						{/if}

						<div class="rounded-lg bg-slate-800/50 p-3 text-sm text-slate-400">
							<p>Make sure you can log in at <a href="https://connect.garmin.com" target="_blank" class="text-forest-400 underline">connect.garmin.com</a> with these credentials.</p>
						</div>

						<div class="flex gap-3">
							<Button type="button" variant="outline" onclick={handleClose} class="flex-1">
								Cancel
							</Button>
							<Button type="submit" class="flex-1" disabled={loading}>
								{#if loading}
									<Loader2 class="h-4 w-4 animate-spin" />
									Connecting...
								{:else}
									Connect
								{/if}
							</Button>
						</div>
					</form>
				{/if}
			</div>
		</div>
	</div>
{/if}
