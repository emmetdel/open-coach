<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { ArrowLeft, Calendar, Activity, TrendingUp, Clock, Heart, MessageCircle, Trash2 } from 'lucide-svelte';
	import RunMap from '$lib/components/RunMap.svelte';
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let deleting = $state(false);

	async function deleteRun() {
		if (!confirm('Are you sure you want to delete this run? This action cannot be undone.')) {
			return;
		}

		deleting = true;

		try {
			const res = await fetch(`/api/runs/${data.run.garmin_activity_id}`, {
				method: 'DELETE'
			});

			if (res.ok) {
				// Navigate back to home page
				await goto('/');
			} else {
				alert('Failed to delete run');
			}
		} catch (err) {
			console.error('Delete error:', err);
			alert('Network error');
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head>
	<title>{data.run.dateFormatted} | OpenCoach</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-925 via-slate-900 to-slate-925">
	<div class="pointer-events-none fixed inset-0">
		<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-forest-900/10 via-transparent to-transparent"></div>
	</div>

	<div class="relative z-10">
		<!-- Header -->
		<header class="border-b border-slate-800/50 bg-slate-925/80 backdrop-blur-xl">
			<div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
				<div class="flex items-center gap-3">
					<a href="/">
						<Button variant="ghost" size="sm">
							<ArrowLeft class="h-4 w-4" />
						</Button>
					</a>
					<span class="font-display text-lg font-bold text-white">Run Details</span>
				</div>
				<Button variant="ghost" size="sm" onclick={deleteRun} disabled={deleting} class="text-rose-400 hover:text-rose-300">
					{#if deleting}
						<Trash2 class="h-4 w-4 animate-pulse" />
					{:else}
						<Trash2 class="h-4 w-4" />
					{/if}
				</Button>
			</div>
		</header>

		<main class="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
			<!-- Title & Map -->
			<div class="mb-8">
				<h1 class="mb-2 font-display text-2xl font-bold text-white sm:text-3xl">{data.run.dateFormatted}</h1>
				<div class="flex items-center gap-2 text-slate-400">
					<div class="h-2 w-2 rounded-full bg-forest-500"></div>
					<span class="text-sm font-medium">Running</span>
				</div>
			</div>

			<!-- Map Card -->
			<Card class="mb-8 overflow-hidden border-slate-800/50 bg-slate-850">
				{#if data.run.map_polyline}
					<div class="h-[300px] w-full sm:h-[400px]">
						<RunMap polyline={data.run.map_polyline} class="h-full w-full" />
					</div>
				{:else}
					<div class="flex h-[200px] w-full items-center justify-center bg-slate-900 text-slate-500">
						<p>No map data available for this run</p>
					</div>
				{/if}
			</Card>

			<!-- Stats Grid -->
			<div class="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
				<Card class="border-slate-800/50 bg-slate-850/50">
					<CardContent class="p-4">
						<div class="mb-2 flex items-center gap-2 text-slate-400">
							<Activity class="h-4 w-4" />
							<span class="text-xs font-medium uppercase tracking-wider">Distance</span>
						</div>
						<p class="font-display text-2xl font-bold text-white">{data.run.distance}</p>
					</CardContent>
				</Card>

				<Card class="border-slate-800/50 bg-slate-850/50">
					<CardContent class="p-4">
						<div class="mb-2 flex items-center gap-2 text-slate-400">
							<Clock class="h-4 w-4" />
							<span class="text-xs font-medium uppercase tracking-wider">Duration</span>
						</div>
						<p class="font-display text-2xl font-bold text-white">{data.run.duration}</p>
					</CardContent>
				</Card>

				<Card class="border-slate-800/50 bg-slate-850/50">
					<CardContent class="p-4">
						<div class="mb-2 flex items-center gap-2 text-slate-400">
							<TrendingUp class="h-4 w-4" />
							<span class="text-xs font-medium uppercase tracking-wider">Pace</span>
						</div>
						<p class="font-display text-2xl font-bold text-white">{data.run.pace}</p>
					</CardContent>
				</Card>

				<Card class="border-slate-800/50 bg-slate-850/50">
					<CardContent class="p-4">
						<div class="mb-2 flex items-center gap-2 text-slate-400">
							<Heart class="h-4 w-4 text-rose-500" />
							<span class="text-xs font-medium uppercase tracking-wider">Avg HR</span>
						</div>
						<p class="font-display text-2xl font-bold text-white">
							{data.run.avg_hr ? `${data.run.avg_hr} bpm` : '--'}
						</p>
					</CardContent>
				</Card>
			</div>

			<!-- AI Analysis -->
			{#if data.run.ai_feedback}
				<Card class="border-forest-500/20 bg-gradient-to-br from-forest-900/10 to-slate-900">
					<CardHeader>
						<CardTitle class="flex items-center gap-2 text-lg">
							<MessageCircle class="h-5 w-5 text-forest-400" />
							Coach's Analysis
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="prose prose-invert max-w-none text-sm text-slate-300">
							{data.run.ai_feedback}
						</div>
					</CardContent>
				</Card>
			{/if}
		</main>
	</div>
</div>
