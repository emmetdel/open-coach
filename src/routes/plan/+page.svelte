<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import {
        Card,
        CardContent,
        CardHeader,
        CardTitle,
    } from "$lib/components/ui/card";
    import { Input } from "$lib/components/ui/input";
    import {
        Calendar,
        RefreshCw,
        Settings,
        Zap,
        CheckCircle2,
        Watch,
        Trash2,
        CalendarClock,
        Activity,
        TrendingUp,
    } from "lucide-svelte";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    let regenerating = $state(false);
    let syncingWatch = $state(false);
    let deletingWorkouts = $state(false);
    let message = $state("");

    // Reschedule state
    let reschedulingWorkouts = $state<Set<string>>(new Set());
    let showDatePickers = $state<Set<string>>(new Set());

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

    async function syncToWatch() {
        syncingWatch = true;
        message = "";

        try {
            const res = await fetch("/api/garmin/sync-watch", {
                method: "POST",
            });
            const result = await res.json();

            message = result.message;
        } catch {
            message = "Failed to sync to watch";
        } finally {
            syncingWatch = false;
        }
    }

    async function deleteGarminWorkouts() {
        if (!confirm("Delete all OpenCoach workouts from Garmin Connect?")) {
            return;
        }

        deletingWorkouts = true;
        message = "";

        try {
            const res = await fetch("/api/garmin/workouts", {
                method: "DELETE",
            });
            const result = await res.json();

            message = result.message;
        } catch {
            message = "Failed to delete workouts";
        } finally {
            deletingWorkouts = false;
        }
    }

    function toggleDatePicker(workoutId: string) {
        const newSet = new Set(showDatePickers);
        if (newSet.has(workoutId)) {
            newSet.delete(workoutId);
        } else {
            newSet.add(workoutId);
        }
        showDatePickers = newSet;
    }

    async function rescheduleWorkout(workoutId: string, newDate: string) {
        const newRescheduling = new Set(reschedulingWorkouts);
        newRescheduling.add(workoutId);
        reschedulingWorkouts = newRescheduling;
        message = "";

        try {
            const res = await fetch("/api/plan/reschedule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planId: workoutId,
                    action: "reschedule_to_date",
                    newDate,
                }),
            });

            const result = await res.json();

            if (result.success) {
                message = result.message;
                // Hide the date picker
                const newSet = new Set(showDatePickers);
                newSet.delete(workoutId);
                showDatePickers = newSet;
                // Reload to show updated dates
                setTimeout(() => window.location.reload(), 1000);
            } else {
                message = result.error || "Failed to reschedule";
            }
        } catch {
            message = "Network error";
        } finally {
            const newRescheduling = new Set(reschedulingWorkouts);
            newRescheduling.delete(workoutId);
            reschedulingWorkouts = newRescheduling;
        }
    }

    // Color for workout type badge
    function getTypeColor(type: string): string {
        switch (type) {
            case "Walk-Run":
                return "bg-emerald-500/20 text-emerald-400";
            case "Easy":
                return "bg-sky-500/20 text-sky-400";
            case "Long":
                return "bg-amber-500/20 text-amber-400";
            case "Interval":
                return "bg-rose-500/20 text-rose-400";
            default:
                return "bg-slate-500/20 text-slate-400";
        }
    }
</script>

<div
    class="min-h-screen bg-gradient-to-br from-slate-925 via-slate-900 to-slate-925"
>
    <!-- Background effects -->
    <div class="pointer-events-none fixed inset-0">
        <div
            class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--tw-gradient-stops))] from-forest-900/10 via-transparent to-transparent"
        ></div>
    </div>

    <div class="relative z-10">
        <!-- Header -->
        <header
            class="border-b border-slate-800/50 bg-slate-925/90 backdrop-blur-xl sticky top-0 z-50"
        >
            <div
                class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6"
            >
                <!-- Logo -->
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

                <!-- Desktop Navigation -->
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
                </nav>

                <!-- Actions -->
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

        <main class="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
            {#if message}
                <div
                    class="mb-6 rounded-xl bg-forest-500/10 px-4 py-3 text-sm text-forest-400"
                >
                    {message}
                </div>
            {/if}

            {#if !data.hasPlan}
                <!-- No plan yet -->
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
                        <p class="mx-auto mt-3 max-w-md text-slate-400">
                            Generate a personalized multi-week training plan
                            based on your goals and available days.
                        </p>
                        <Button
                            onclick={regeneratePlan}
                            class="mt-6"
                            disabled={regenerating}
                        >
                            {#if regenerating}
                                <RefreshCw class="h-4 w-4 animate-spin" />
                                Generating...
                            {:else}
                                <Zap class="h-4 w-4" />
                                Generate Plan
                            {/if}
                        </Button>
                    </CardContent>
                </Card>
            {:else}
                <!-- Plan Overview Card (like Runna) -->
                <Card
                    class="mb-8 border-forest-500/30 bg-gradient-to-br from-slate-850 to-slate-900"
                >
                    <CardContent class="p-6">
                        <div class="flex items-start justify-between">
                            <div>
                                <h2
                                    class="font-display text-2xl font-bold text-white"
                                >
                                    {data.planName}
                                </h2>
                                <p class="mt-1 text-sm text-slate-400">
                                    Your end date: <span
                                        class="font-medium text-slate-300"
                                    >
                                        {new Date(
                                            Date.now() +
                                                (data.totalWeeks -
                                                    data.currentWeek +
                                                    1) *
                                                    7 *
                                                    24 *
                                                    60 *
                                                    60 *
                                                    1000,
                                        )
                                            .toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                            })
                                            .toUpperCase()}
                                    </span>
                                </p>

                                <!-- Progress bar -->
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

                                <p class="mt-3 text-sm text-slate-400">
                                    Total Weeks: <span
                                        class="font-bold text-white"
                                        >{data.completedWeeks}/{data.totalWeeks}</span
                                    >
                                </p>

                                <!-- Garmin buttons -->
                                <div class="mt-4 flex gap-2">
                                    <Button
                                        onclick={syncToWatch}
                                        disabled={syncingWatch}
                                    >
                                        {#if syncingWatch}
                                            <RefreshCw
                                                class="h-4 w-4 animate-spin"
                                            />
                                            Syncing...
                                        {:else}
                                            <Watch class="h-4 w-4" />
                                            Send to Watch
                                        {/if}
                                    </Button>
                                    <Button
                                        onclick={deleteGarminWorkouts}
                                        variant="outline"
                                        disabled={deletingWorkouts}
                                    >
                                        {#if deletingWorkouts}
                                            <RefreshCw
                                                class="h-4 w-4 animate-spin"
                                            />
                                        {:else}
                                            <Trash2 class="h-4 w-4" />
                                        {/if}
                                        Clear Garmin
                                    </Button>
                                </div>
                            </div>

                            <!-- Plan badge -->
                            <div
                                class="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-pink-400/30 bg-slate-800"
                            >
                                <span class="text-lg font-bold text-pink-400"
                                    >NTR</span
                                >
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <!-- Week-by-week view -->
                <div class="space-y-4">
                    {#each data.weeks as week}
                        <Card
                            class="border-slate-700/50 {week.isCurrentWeek
                                ? 'ring-2 ring-forest-500/50'
                                : ''} bg-gradient-to-br from-slate-850 to-slate-900"
                        >
                            <CardContent class="p-6">
                                <div
                                    class="mb-4 flex items-center justify-between"
                                >
                                    <div>
                                        <p
                                            class="text-sm font-medium uppercase tracking-wider text-forest-400"
                                        >
                                            {week.startDate} - {week.endDate}
                                        </p>
                                        <h3
                                            class="font-display text-xl font-bold text-white"
                                        >
                                            Week {week.weekNumber}
                                            {#if week.isCurrentWeek}
                                                <span
                                                    class="ml-2 rounded-full bg-forest-500/20 px-2 py-0.5 text-xs font-medium text-forest-400"
                                                >
                                                    Current
                                                </span>
                                            {/if}
                                        </h3>
                                    </div>
                                </div>

                                <p class="mb-4 text-sm text-slate-400">
                                    Total Workouts: <span
                                        class="font-semibold text-white"
                                        >{week.totalWorkouts}</span
                                    >
                                </p>

                                <!-- Workouts list -->
                                <div class="space-y-3">
                                    {#each week.workouts as workout}
                                        <div
                                            class="rounded-lg border border-slate-700/30 p-3"
                                        >
                                            <div
                                                class="flex items-center gap-4"
                                            >
                                                <div
                                                    class="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-500/20"
                                                >
                                                    {#if workout.status === "Completed"}
                                                        <CheckCircle2
                                                            class="h-5 w-5 text-forest-400"
                                                        />
                                                    {:else}
                                                        <div
                                                            class="h-3 w-3 rounded-full bg-forest-500"
                                                        ></div>
                                                    {/if}
                                                </div>
                                                <div class="flex-1">
                                                    <div
                                                        class="flex items-center gap-2"
                                                    >
                                                        <span
                                                            class="text-sm font-medium text-slate-300"
                                                            >{workout.day}</span
                                                        >
                                                        <span
                                                            class={`rounded-lg px-2 py-0.5 text-xs font-medium ${getTypeColor(workout.type)}`}
                                                        >
                                                            {workout.type}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div class="text-right">
                                                    <p
                                                        class="text-sm font-medium text-white"
                                                    >
                                                        {workout.distance ||
                                                            workout.duration}
                                                    </p>
                                                </div>
                                                {#if workout.status === "Pending"}
                                                    <Button
                                                        onclick={() =>
                                                            toggleDatePicker(
                                                                workout.id,
                                                            )}
                                                        variant="ghost"
                                                        size="sm"
                                                        class="h-8 w-8 p-0"
                                                    >
                                                        <CalendarClock
                                                            class="h-4 w-4"
                                                        />
                                                    </Button>
                                                {/if}
                                            </div>

                                            {#if showDatePickers.has(workout.id)}
                                                <div
                                                    class="mt-3 flex items-center gap-2 border-t border-slate-700/30 pt-3"
                                                >
                                                    <Input
                                                        type="date"
                                                        id={`date-${workout.id}`}
                                                        value={workout.scheduledDate}
                                                        class="flex-1"
                                                    />
                                                    <Button
                                                        onclick={() => {
                                                            const input =
                                                                document.getElementById(
                                                                    `date-${workout.id}`,
                                                                ) as HTMLInputElement;
                                                            if (input?.value) {
                                                                rescheduleWorkout(
                                                                    workout.id,
                                                                    input.value,
                                                                );
                                                            }
                                                        }}
                                                        size="sm"
                                                        disabled={reschedulingWorkouts.has(
                                                            workout.id,
                                                        )}
                                                    >
                                                        {#if reschedulingWorkouts.has(workout.id)}
                                                            <RefreshCw
                                                                class="h-4 w-4 animate-spin"
                                                            />
                                                        {:else}
                                                            Reschedule
                                                        {/if}
                                                    </Button>
                                                </div>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            </CardContent>
                        </Card>
                    {/each}
                </div>

                <!-- Regenerate CTA -->
                <div class="mt-8 text-center">
                    <p class="text-sm text-slate-500">
                        Not happy with the plan?
                    </p>
                    <Button
                        onclick={regeneratePlan}
                        variant="outline"
                        class="mt-2"
                        disabled={regenerating}
                    >
                        {#if regenerating}
                            <RefreshCw class="h-4 w-4 animate-spin" />
                            Regenerating...
                        {:else}
                            Regenerate Plan
                        {/if}
                    </Button>
                </div>
            {/if}
        </main>

        <!-- Footer -->
        <footer
            class="border-t border-slate-800/50 py-6 sm:py-8 text-center text-xs sm:text-sm text-slate-500"
        >
            <p>Mental health over metrics. Every run counts.</p>
            {#if import.meta.env.VITE_GIT_SHA}
                <p class="mt-2 text-xs text-slate-600">
                    v{import.meta.env.VITE_GIT_SHA}
                </p>
            {/if}
        </footer>
    </div>
</div>
