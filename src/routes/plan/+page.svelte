<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Card, CardContent } from "$lib/components/ui/card";
    import TrainingCalendar from "$lib/components/TrainingCalendar.svelte";
    import {
        Calendar,
        RefreshCw,
        Settings,
        Zap,
        Activity,
        TrendingUp,
        Target,
    } from "lucide-svelte";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    let goalContext = $derived(data.primaryGoal ? `for ${data.primaryGoal.name} (${data.primaryGoal.target_distance_km}km on ${new Date(data.primaryGoal.target_date).toLocaleDateString()})` : "");

    let regenerating = $state(false);
    let message = $state("");
    let calendarRuns = $state(data.runs);

    async function regeneratePlan() {
        regenerating = true;
        message = "";

        try {
            const res = await fetch("/api/plan", { method: "POST" });
            const result = await res.json();

            if (result.success) {
                message = result.message;
                window.location.reload();
            } else {
                message = result.message || "Failed to generate plan";
            }
        } catch {
            message = "Network error";
        } finally {
            regenerating = false;
        }
    }

    async function handleMove(runId: string, newDate: string) {
        try {
            const res = await fetch("/api/plan/reschedule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planId: runId,
                    action: "reschedule_to_date",
                    newDate,
                }),
            });

            const result = await res.json();

            if (result.success) {
                message = result.message;
                // Update local state
                calendarRuns = calendarRuns.map((r) =>
                    r.id === runId ? { ...r, date: newDate } : r,
                );
            } else {
                message = result.error || "Failed to reschedule";
            }
        } catch {
            message = "Network error";
        }
    }

    async function handleStatusChange(
        runId: string,
        newStatus: "Pending" | "Completed",
    ) {
        try {
            const res = await fetch("/api/plan/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planId: runId,
                    newStatus,
                }),
            });

            const result = await res.json();

            if (result.success) {
                message = result.message;
                // Update local state
                calendarRuns = calendarRuns.map((r) =>
                    r.id === runId ? { ...r, status: newStatus } : r,
                );
            } else {
                message = result.error || "Failed to update status";
            }
        } catch {
            message = "Network error";
        }
    }
</script>

<div
    class="min-h-screen bg-gradient-to-br from-slate-925 via-slate-900 to-slate-925"
>
    <div class="pointer-events-none fixed inset-0">
        <div
            class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--tw-gradient-stops))] from-forest-900/10 via-transparent to-transparent"
        ></div>
    </div>

    <div class="relative z-10">
        <header
            class="border-b border-slate-800/50 bg-slate-925/90 backdrop-blur-xl sticky top-0 z-50"
        >
            <div
                class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6"
            >
                <a
                    href="/"
                    class="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity"
                >
                    <div
                        class="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-gradient-to-br from-forest-500 to-forest-600 shadow-lg shadow-forest-900/30"
                    >
                        <Zap class="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                    </div>
                    <span
                        class="font-display text-lg sm:text-xl font-bold text-white"
                        >OpenCoach</span
                    >
                </a>

                <nav class="hidden md:flex items-center gap-1">
                    <a href="/">
                        <Button variant="ghost" size="sm" class="h-9 px-4">
                            <Activity class="h-4 w-4 mr-2" />
                            Dashboard
                        </Button>
                    </a>
                    <a href="/analytics">
                        <Button variant="ghost" size="sm" class="h-9 px-4">
                            <TrendingUp class="h-4 w-4 mr-2" />
                            Analytics
                        </Button>
                    </a>
                    <a href="/plan">
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-9 px-4 bg-slate-800"
                        >
                            <Calendar class="h-4 w-4 mr-2" />
                            Plan
                        </Button>
                    </a>
                    <a href="/goals">
                        <Button variant="ghost" size="sm" class="h-9 px-4">
                            <Target class="h-4 w-4 mr-2" />
                            Goals
                        </Button>
                    </a>
                </nav>

                <div class="flex items-center gap-1 sm:gap-2">
                    <Button
                        onclick={regeneratePlan}
                        variant="outline"
                        size="sm"
                        disabled={regenerating}
                        class="hidden sm:flex h-9 px-3"
                    >
                        <RefreshCw
                            class={`h-4 w-4 sm:mr-2 ${regenerating ? "animate-spin" : ""}`}
                        />
                        <span class="hidden sm:inline"
                            >{regenerating
                                ? "Regenerating..."
                                : "Regenerate"}</span
                        >
                    </Button>
                    <a href="/settings">
                        <Button
                            variant="ghost"
                            size="sm"
                            title="Settings"
                            class="h-9 w-9 p-0"
                        >
                            <Settings class="h-4 w-4" />
                        </Button>
                    </a>
                </div>
            </div>

            <!-- Mobile Navigation -->
            <div class="md:hidden border-t border-slate-800/50">
                <nav
                    class="mx-auto max-w-7xl px-4 py-2 flex items-center justify-around"
                >
                    <a
                        href="/"
                        class="flex flex-col items-center gap-1 py-2 px-3 text-slate-400 hover:text-white transition-colors"
                    >
                        <Activity class="h-5 w-5" />
                        <span class="text-xs">Home</span>
                    </a>
                    <a
                        href="/analytics"
                        class="flex flex-col items-center gap-1 py-2 px-3 text-slate-400 hover:text-white transition-colors"
                    >
                        <TrendingUp class="h-5 w-5" />
                        <span class="text-xs">Analytics</span>
                    </a>
                    <a
                        href="/plan"
                        class="flex flex-col items-center gap-1 py-2 px-3 text-white"
                    >
                        <Calendar class="h-5 w-5" />
                        <span class="text-xs">Plan</span>
                    </a>
                    <a
                        href="/goals"
                        class="flex flex-col items-center gap-1 py-2 px-3 text-slate-400 hover:text-white transition-colors"
                    >
                        <Target class="h-5 w-5" />
                        <span class="text-xs">Goals</span>
                    </a>
                    <button
                        onclick={regeneratePlan}
                        class="flex flex-col items-center gap-1 py-2 px-3 text-slate-400 hover:text-white transition-colors"
                        disabled={regenerating}
                    >
                        <RefreshCw
                            class={`h-5 w-5 ${regenerating ? "animate-spin" : ""}`}
                        />
                        <span class="text-xs">Regen</span>
                    </button>
                </nav>
            </div>
        </header>

        <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            {#if message}
                <div
                    class="mb-6 rounded-xl bg-forest-500/10 px-4 py-3 text-sm text-forest-400"
                >
                    {message}
                </div>
            {/if}

            {#if !data.hasPlan}
                <Card
                    class="border-slate-700/50 bg-gradient-to-br from-slate-850 to-slate-900"
                >
                    <CardContent class="p-8 text-center">
                        <Calendar class="mx-auto h-16 w-16 text-slate-500" />
                        <h2
                            class="mt-6 font-display text-2xl font-bold text-white"
                        >
                            No Training Plan Yet
                        </h2>
                        {#if data.primaryGoal}
                            <p class="mx-auto mt-3 max-w-md text-slate-300">
                                Ready to generate your training plan {goalContext}
                            </p>
                            <p class="mt-2 text-sm text-slate-400">
                                I'll create a personalized week-by-week plan to help you reach your goal.
                            </p>
                        {:else}
                            <p class="mx-auto mt-3 max-w-md text-slate-400">
                                First, <a href="/goals" class="text-forest-400 hover:underline">set a goal</a>, then generate a personalized training plan.
                            </p>
                        {/if}
                        <Button
                            onclick={regeneratePlan}
                            class="mt-6 bg-forest-600 hover:bg-forest-700"
                            disabled={regenerating || !data.primaryGoal}
                        >
                            {#if regenerating}
                                <RefreshCw class="h-4 w-4 animate-spin" />
                                Generating...
                            {:else}
                                <Zap class="h-4 w-4" />
                                Generate Training Plan
                            {/if}
                        </Button>
                        {#if !data.primaryGoal}
                            <p class="mt-3 text-xs text-slate-500">
                                Create a goal first to generate your plan
                            </p>
                        {/if}
                    </CardContent>
                </Card>
            {:else}
                <!-- Goal Context Banner -->
                {#if data.primaryGoal}
                    <div class="mb-4 rounded-xl border border-forest-500/30 bg-gradient-to-r from-forest-900/20 to-slate-900 p-4">
                        <div class="flex items-center justify-between flex-wrap gap-3">
                            <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-500/20">
                                    <Target class="h-5 w-5 text-forest-400" />
                                </div>
                                <div>
                                    <p class="text-xs text-slate-400">Training for</p>
                                    <p class="font-semibold text-white">{data.primaryGoal.name}</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-xs text-slate-400">Target</p>
                                <p class="font-semibold text-forest-400">
                                    {data.primaryGoal.target_distance_km}km • {new Date(data.primaryGoal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </p>
                            </div>
                        </div>
                    </div>
                {/if}
                
                <!-- Plan Overview -->
                <div
                    class="mb-8 rounded-xl border border-forest-500/30 bg-gradient-to-br from-slate-850 to-slate-900 p-6"
                >
                    <h2 class="font-display text-2xl font-bold text-white">
                        {data.planName}
                    </h2>
                    <p class="mt-2 text-sm text-slate-400">
                        Week <span class="font-bold text-white"
                            >{data.currentWeek}</span
                        >
                        of
                        <span class="font-bold text-white"
                            >{data.totalWeeks}</span
                        >
                    </p>
                    <div class="mt-4 flex gap-1">
                        {#each Array(data.totalWeeks) as _, i}
                            <div
                                class="h-2 flex-1 rounded-full {i <
                                data.completedWeeks
                                    ? 'bg-forest-500'
                                    : i === data.currentWeek - 1
                                      ? 'bg-forest-500/50'
                                      : 'bg-slate-700'}"
                            ></div>
                        {/each}
                    </div>
                </div>

                <!-- Interactive Calendar -->
                <TrainingCalendar
                    runs={calendarRuns}
                    onMove={handleMove}
                    onStatusChange={handleStatusChange}
                />
            {/if}
        </main>
    </div>
</div>
