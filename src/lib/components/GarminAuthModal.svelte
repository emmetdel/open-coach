<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { X, AlertTriangle, Loader2, CheckCircle, Terminal, Copy, Check, Smartphone } from 'lucide-svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		onSuccess: () => void;
	}

	let { open, onClose, onSuccess }: Props = $props();

	// Auth state
	type AuthStep = 'connecting' | 'logging-in' | 'mfa' | 'success' | 'error' | 'no-server';
	let step = $state<AuthStep>('connecting');
	let loading = $state(false);
	let errorMessage = $state('');

	// MFA form state
	let mfaCode = $state('');

	// Server state
	let copied = $state(false);

	const AUTH_SERVER_URL = 'http://localhost:5050';
	const COMMAND = 'uv run --python 3.12 --with garth --with flask --with flask-cors python scripts/auth-server.py';

	// Start the auth flow when modal opens
	$effect(() => {
		if (open) {
			step = 'connecting';
			errorMessage = '';
			mfaCode = '';
			startAuthFlow();
		}
	});

	async function startAuthFlow() {
		// First check if server is running
		const serverOk = await checkAuthServer();
		if (!serverOk) {
			step = 'no-server';
			// Keep polling for server
			const interval = setInterval(async () => {
				if (await checkAuthServer()) {
					clearInterval(interval);
					attemptAutoLogin();
				}
			}, 2000);
			return () => clearInterval(interval);
		}
		
		// Server is up, try auto-login
		await attemptAutoLogin();
	}

	async function checkAuthServer(): Promise<boolean> {
		try {
			const res = await fetch(`${AUTH_SERVER_URL}/health`, {
				method: 'GET',
				signal: AbortSignal.timeout(2000)
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	async function copyCommand() {
		await navigator.clipboard.writeText(COMMAND);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	async function attemptAutoLogin() {
		step = 'logging-in';
		loading = true;
		errorMessage = '';

		try {
			const res = await fetch(`${AUTH_SERVER_URL}/auth/auto-login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const data = await res.json();

			if (data.success) {
				// Login succeeded! Import tokens to the app
				if (data.tokens) {
					await importTokens(data.tokens);
				}
				step = 'success';
				setTimeout(() => {
					onSuccess();
					onClose();
				}, 1500);
			} else if (data.mfaRequired) {
				// Need MFA code
				step = 'mfa';
			} else {
				errorMessage = data.error || 'Login failed';
				step = 'error';
			}
		} catch (err) {
			step = 'no-server';
		} finally {
			loading = false;
		}
	}

	async function submitMfa() {
		loading = true;
		errorMessage = '';

		try {
			const res = await fetch(`${AUTH_SERVER_URL}/auth/mfa`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: mfaCode })
			});

			const data = await res.json();

			if (data.success) {
				if (data.tokens) {
					await importTokens(data.tokens);
				}
				step = 'success';
				setTimeout(() => {
					onSuccess();
					onClose();
				}, 1500);
			} else if (data.mfaPending) {
				// Still processing, poll for result
				await pollForResult();
			} else {
				errorMessage = data.error || 'MFA verification failed';
			}
		} catch (err) {
			errorMessage = 'Could not verify MFA code';
		} finally {
			loading = false;
		}
	}

	async function pollForResult() {
		// Poll auth status for a few seconds
		for (let i = 0; i < 5; i++) {
			await new Promise(r => setTimeout(r, 1000));
			
			const res = await fetch(`${AUTH_SERVER_URL}/auth/status`);
			const data = await res.json();
			
			if (data.authenticated) {
				// Login completed!
				const exportRes = await fetch(`${AUTH_SERVER_URL}/auth/export`, { method: 'POST' });
				const exportData = await exportRes.json();
				if (exportData.tokens) {
					await importTokens(exportData.tokens);
				}
				step = 'success';
				setTimeout(() => {
					onSuccess();
					onClose();
				}, 1500);
				return;
			}
		}
		
		errorMessage = 'MFA verification timed out. Please try again.';
	}

	async function importTokens(tokens: { oauth1: unknown; oauth2: unknown }) {
		const res = await fetch('/api/garmin/tokens', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(tokens)
		});

		if (!res.ok) {
			throw new Error('Failed to import tokens');
		}
	}

	function resetAndClose() {
		step = 'connecting';
		mfaCode = '';
		errorMessage = '';
		onClose();
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
		<div class="mx-4 w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-850 shadow-2xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-slate-700/50 p-5">
				<div class="flex items-center gap-3">
					{#if step === 'success'}
						<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-500/20">
							<CheckCircle class="h-5 w-5 text-forest-400" />
						</div>
					{:else if step === 'mfa'}
						<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
							<Smartphone class="h-5 w-5 text-amber-400" />
						</div>
					{:else}
						<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
							<AlertTriangle class="h-5 w-5 text-amber-400" />
						</div>
					{/if}
					<div>
						<h2 class="font-display text-lg font-bold text-white">
							{#if step === 'mfa'}
								Enter MFA Code
							{:else if step === 'success'}
								Connected!
							{:else}
								Garmin Reconnect
							{/if}
						</h2>
					</div>
				</div>
				<button onclick={resetAndClose} class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Content -->
			<div class="p-5">
				{#if step === 'connecting' || step === 'logging-in'}
					<!-- Auto-login in progress -->
					<div class="py-8 text-center">
						<Loader2 class="mx-auto h-10 w-10 animate-spin text-forest-400" />
						<p class="mt-4 text-slate-300">
							{step === 'connecting' ? 'Connecting to auth server...' : 'Logging into Garmin...'}
						</p>
						<p class="mt-2 text-sm text-slate-500">
							This uses your saved credentials
						</p>
					</div>

				{:else if step === 'no-server'}
					<!-- Server not running -->
					<div class="space-y-4">
						<p class="text-slate-300">
							Start the auth server to reconnect to Garmin:
						</p>

						<div class="relative">
							<pre class="rounded-xl bg-slate-900 p-4 text-xs text-slate-300 overflow-x-auto font-mono leading-relaxed">{COMMAND}</pre>
							<button
								onclick={copyCommand}
								class="absolute right-3 top-3 rounded-lg bg-slate-700/80 p-2 text-slate-400 hover:text-white transition-colors"
							>
								{#if copied}
									<Check class="h-4 w-4 text-forest-400" />
								{:else}
									<Copy class="h-4 w-4" />
								{/if}
							</button>
						</div>

						<div class="rounded-xl bg-slate-800/50 p-4 text-sm text-slate-400">
							<p class="mb-2"><strong class="text-slate-300">Required .env variables:</strong></p>
							<pre class="font-mono text-xs">GARMIN_EMAIL=your@email.com
GARMIN_PASSWORD=yourpassword</pre>
						</div>

						<div class="flex items-center justify-center gap-2 text-sm text-slate-500">
							<Loader2 class="h-4 w-4 animate-spin" />
							Waiting for server...
						</div>
					</div>

				{:else if step === 'mfa'}
					<!-- MFA input -->
					<form onsubmit={(e) => { e.preventDefault(); submitMfa(); }} class="space-y-4">
						<div class="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
							<p class="text-sm text-amber-300">
								Enter the 6-digit code from your authenticator app
							</p>
						</div>

						<div class="space-y-2">
							<Label for="mfa-code" class="sr-only">Verification Code</Label>
							<Input
								id="mfa-code"
								type="text"
								inputmode="numeric"
								placeholder="000000"
								bind:value={mfaCode}
								maxlength={6}
								class="text-center text-3xl tracking-[0.5em] font-mono h-16"
								autofocus
								required
							/>
						</div>

						{#if errorMessage}
							<div class="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
								{errorMessage}
							</div>
						{/if}

						<Button type="submit" class="w-full" disabled={loading || mfaCode.length < 6}>
							{#if loading}
								<Loader2 class="h-4 w-4 animate-spin" />
								Verifying...
							{:else}
								Verify Code
							{/if}
						</Button>
					</form>

				{:else if step === 'success'}
					<!-- Success state -->
					<div class="text-center py-6">
						<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-forest-500/20">
							<CheckCircle class="h-8 w-8 text-forest-400" />
						</div>
						<p class="text-slate-300">Syncing your runs...</p>
					</div>

				{:else if step === 'error'}
					<!-- Error state -->
					<div class="space-y-4">
						<div class="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
							<div class="flex items-start gap-3">
								<AlertTriangle class="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
								<div>
									<p class="font-medium text-red-300">Authentication Failed</p>
									<p class="text-sm text-red-400/80 mt-1">{errorMessage}</p>
								</div>
							</div>
						</div>

						<div class="flex gap-3">
							<Button variant="outline" onclick={attemptAutoLogin} class="flex-1">
								Try Again
							</Button>
							<Button variant="secondary" onclick={resetAndClose} class="flex-1">
								Close
							</Button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
