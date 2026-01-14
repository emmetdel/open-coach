<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import {
        Card,
        CardContent,
        CardHeader,
        CardTitle,
    } from "$lib/components/ui/card";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import GarminAuthModal from "$lib/components/GarminAuthModal.svelte";
    import {
        RefreshCw,
        Activity,
        TrendingUp,
        Calendar,
        MessageCircle,
        Zap,
        Plus,
        X,
        Key,
        Settings,
        Flame,
        Trophy,
        Lightbulb,
        Target,
        ChevronRight,
        Trash2,
    } from "lucide-svelte";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    let syncing = $state(false);
    let syncMessage = $state("");

    // Manual run entry
    let showAddRun = $state(false);
    let addingRun = $state(false);
    let runDate = $state(new Date().toISOString().split("T")[0]);
    let runDistance = $state("");
    let runDuration = $state("");
    let runHr = $state("");

    // Token import
    let showImportTokens = $state(false);
    let tokenJson = $state("");
    let importingTokens = $state(false);

    // Garmin re-auth modal
    let showAuthModal = $state(false);
    let syncAttemptAfterAuth = $state(false); // Track if this is a retry after auth

    // Plan generation
    let generatingPlan = $state(false);

    // Run now
    let runningNow = $state(false);

    // Delete run
    let deletingRuns = $state<Set<string>>(new Set());

    async function runNow(planId: string) {
        runningNow = true;
        syncMessage = "";

        try {
            const res = await fetch("/api/plan/reschedule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId, action: "run_now" }),
            });

            const result: { success: boolean; message?: string } =
                await res.json();

            if (result.success) {
                syncMessage = result.message || "Run scheduled for today!";
                // Reload page to show updated plan
                setTimeout(() => window.location.reload(), 1000);
            } else {
                syncMessage = "Failed to schedule run";
            }
        } catch (err) {
            console.error("Run now error:", err);
            syncMessage = "Network error";
        } finally {
            runningNow = false;
        }
    }

    async function syncNow() {
        syncing = true;
        syncMessage = "";

        try {
            const res = await fetch("/api/sync", { method: "POST" });
            const result: {
                success: boolean;
                message?: string;
                newRuns?: number;
                authRequired?: boolean;
            } = await res.json();

            console.log("Sync result:", result);

            if (result.success) {
                syncMessage = result.message || "Synced!";
                syncAttemptAfterAuth = false;
                if (result.newRuns && result.newRuns > 0) {
                    // Reload page to show new runs
                    window.location.reload();
                }
            } else if (result.authRequired) {
                // Show the re-auth modal only if this isn't already a retry after auth
                if (syncAttemptAfterAuth) {
                    syncMessage =
                        "Still having trouble connecting. Please check your credentials.";
                    syncAttemptAfterAuth = false;
                } else {
                    syncMessage = "";
                    showAuthModal = true;
                }
            } else {
                syncMessage = result.message || "Sync failed";
            }
        } catch (err) {
            console.error("Sync error:", err);
            syncMessage = "Network error";
        } finally {
            syncing = false;
        }
    }

    function onAuthSuccess() {
        // After successful re-auth, try syncing again
        syncAttemptAfterAuth = true; // Mark this as a retry so modal won't reopen
        syncMessage = "Reconnected! Syncing...";
        syncNow();
    }

    async function addManualRun() {
        if (!runDistance || !runDuration) {
            syncMessage = "Please enter distance and duration";
            return;
        }

        addingRun = true;
        syncMessage = "";

        try {
            const res = await fetch("/api/runs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: runDate + "T12:00:00",
                    distance_km: parseFloat(runDistance),
                    duration_minutes: parseFloat(runDuration),
                    avg_hr: runHr ? parseInt(runHr) : undefined,
                }),
            });

            const result: { success: boolean } = await res.json();

            if (result.success) {
                syncMessage = "Run added! Getting AI feedback...";
                showAddRun = false;
                runDistance = "";
                runDuration = "";
                runHr = "";
                // Reload to show new run with AI feedback
                setTimeout(() => window.location.reload(), 1500);
            } else {
                syncMessage = "Failed to add run";
            }
        } catch {
            syncMessage = "Network error";
        } finally {
            addingRun = false;
        }
    }

    async function importTokens() {
        if (!tokenJson.trim()) {
            syncMessage = "Please paste the token JSON";
            return;
        }

        importingTokens = true;
        syncMessage = "";

        try {
            const tokens = JSON.parse(tokenJson);

            const res = await fetch("/api/garmin/tokens", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(tokens),
            });

            const result: { success: boolean } = await res.json();

            if (result.success) {
                syncMessage = "Garmin tokens imported! Try syncing now.";
                showImportTokens = false;
                tokenJson = "";
            } else {
                syncMessage = "Failed to import tokens";
            }
        } catch {
            syncMessage = "Invalid JSON format";
        } finally {
            importingTokens = false;
        }
    }

    async function deleteRun(runId: string, event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        if (
            !confirm(
                "Are you sure you want to delete this run? This action cannot be undone.",
            )
        ) {
            return;
        }

        const newDeleting = new Set(deletingRuns);
        newDeleting.add(runId);
        deletingRuns = newDeleting;
        syncMessage = "";

        try {
            const res = await fetch(`/api/runs/${runId}`, {
                method: "DELETE",
            });

            if (res.ok) {
                syncMessage = "Run deleted successfully";
                // Reload page to show updated runs
                setTimeout(() => window.location.reload(), 500);
            } else {
                syncMessage = "Failed to delete run";
            }
        } catch (err) {
            console.error("Delete error:", err);
            syncMessage = "Network error";
        } finally {
            const newDeleting = new Set(deletingRuns);
            newDeleting.delete(runId);
            deletingRuns = newDeleting;
        }
    }

    async function generatePlan() {
        generatingPlan = true;
        syncMessage = "";

        try {
            const res = await fetch("/api/plan/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goalId: data.primaryGoal?.id }) });
            const result: { success: boolean; message?: string } =
                await res.json();

            if (result.success) {
                syncMessage = result.message || "Plan generated!";
                // Reload to show new plan
                window.location.reload();
            } else {
                syncMessage = result.message || "Failed to generate plan";
            }
        } catch {
            syncMessage = "Network error";
        } finally {
            generatingPlan = false;
        }
    }

    // Generate consistency bars for visualization
    // Match SQLite's strftime('%Y-%W') format: YYYY-WW where WW is 00-53
    function getWeekKey(date: Date): string {
        // Use ISO week format to match SQLite's strftime('%Y-%W', date)
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;

        // Get ISO week number (same as SQLite %W format)
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 4 - (d.getDay() || 7));
        const yearStart = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil(
            ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
        );

        return `${d.getFullYear()}-${String(weekNum - 1).padStart(2, "0")}`;
    }

    function getConsistencyBars() {
        const weeks = [];
        const today = new Date();

        // Get the Monday of the current week (weeks run Mon-Sun)
        const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
        const thisMonday = new Date(today);
        thisMonday.setDate(today.getDate() - daysFromMonday);
        thisMonday.setHours(0, 0, 0, 0);

        // Generate last 8 weeks (Monday to Sunday), newest to oldest
        for (let i = 0; i <= 7; i++) {
            const weekStart = new Date(thisMonday);
            weekStart.setDate(thisMonday.getDate() - i * 7);

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);

            // Count runs in this Monday-Sunday week
            const runsInWeek = data.runs.filter((run) => {
                const runDate = new Date(run.date);
                return runDate >= weekStart && runDate <= weekEnd;
            });

            weeks.push({
                weekStart: weekStart.toISOString().split("T")[0],
                count: runsInWeek.length,
            });
        }

        return weeks;
    }

    const consistencyBars = $derived(getConsistencyBars());
    const maxCount = $derived(
        Math.max(...consistencyBars.map((b) => b.count), 3),
    );
</script>

<div
    class="min-h-screen bg-linear-to-br from-slate-925 via-slate-900 to-slate-925"
>
    <!-- Garmin Re-Auth Modal -->
    <GarminAuthModal
        open={showAuthModal}
        onClose={() => (showAuthModal = false)}
        onSuccess={onAuthSuccess}
    />

    <!-- Import Tokens Modal -->
    {#if showImportTokens}
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3"
        >
            <div
                class="w-full max-w-lg rounded-2xl border border-slate-700/50 bg-slate-850 p-4 sm:p-6 shadow-2xl"
            >
                <div class="mb-4 sm:mb-6 flex items-center justify-between">
                    <h2
                        class="font-display text-lg sm:text-xl font-bold text-white"
                    >
                        Import Garmin Tokens
                    </h2>
                    <button
                        onclick={() => (showImportTokens = false)}
                        class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                    >
                        <X class="h-5 w-5" />
                    </button>
                </div>

                <div
                    class="mb-4 rounded-lg bg-slate-800/50 p-3 sm:p-4 text-xs sm:text-sm text-slate-300"
                >
                    <p class="mb-2"><strong>Manual token import:</strong></p>
                    <p class="text-slate-400">
                        If you have OAuth tokens from another source, paste the
                        JSON below. Format: <code
                            class="rounded bg-slate-700 px-1 text-xs"
                            >{`{"oauth1": {...}, "oauth2": {...}}`}</code
                        >
                    </p>
                </div>

                <form
                    onsubmit={(e) => {
                        e.preventDefault();
                        importTokens();
                    }}
                    class="space-y-4"
                >
                    <div class="space-y-2">
                        <Label for="token-json">Token JSON</Label>
                        <textarea
                            id="token-json"
                            bind:value={tokenJson}
                            placeholder={'{"oauth1": {...}, "oauth2": {...}}'}
                            rows="6"
                            class="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 sm:px-4 sm:py-3 font-mono text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/20"
                        ></textarea>
                    </div>

                    <div class="flex gap-2 sm:gap-3 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onclick={() => (showImportTokens = false)}
                            class="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            class="flex-1"
                            disabled={importingTokens}
                        >
                            {importingTokens ? "Importing..." : "Import Tokens"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    {/if}

    <!-- Add Run Modal -->
    {#if showAddRun}
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3"
        >
            <div
                class="w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-850 p-4 sm:p-6 shadow-2xl"
            >
                <div class="mb-4 sm:mb-6 flex items-center justify-between">
                    <h2
                        class="font-display text-lg sm:text-xl font-bold text-white"
                    >
                        Add Run Manually
                    </h2>
                    <button
                        onclick={() => (showAddRun = false)}
                        class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                    >
                        <X class="h-5 w-5" />
                    </button>
                </div>

                <form
                    onsubmit={(e) => {
                        e.preventDefault();
                        addManualRun();
                    }}
                    class="space-y-4"
                >
                    <div class="space-y-2">
                        <Label for="run-date">Date</Label>
                        <Input id="run-date" type="date" bind:value={runDate} />
                    </div>

                    <div class="grid grid-cols-2 gap-3 sm:gap-4">
                        <div class="space-y-2">
                            <Label for="run-distance">Distance (km)</Label>
                            <Input
                                id="run-distance"
                                type="number"
                                step="0.1"
                                placeholder="5.0"
                                bind:value={runDistance}
                            />
                        </div>
                        <div class="space-y-2">
                            <Label for="run-duration">Duration (min)</Label>
                            <Input
                                id="run-duration"
                                type="number"
                                step="1"
                                placeholder="30"
                                bind:value={runDuration}
                            />
                        </div>
                    </div>

                    <div class="space-y-2">
                        <Label for="run-hr">Avg Heart Rate (optional)</Label>
                        <Input
                            id="run-hr"
                            type="number"
                            placeholder="145"
                            bind:value={runHr}
                        />
                    </div>

                    <div class="flex gap-2 sm:gap-3 pt-2 sm:pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onclick={() => (showAddRun = false)}
                            class="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            class="flex-1"
                            disabled={addingRun}
                        >
                            {addingRun ? "Adding..." : "Add Run"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    {/if}

    <!-- Background effects -->
    <div class="pointer-events-none fixed inset-0">
        <div
            class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-linear-stops))] from-forest-900/10 via-transparent to-transparent"
        ></div>
        <div
            class="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-linear-stops))] from-coral-900/5 via-transparent to-transparent"
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
                        class="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-linear-to-br from-forest-500 to-forest-600 shadow-lg shadow-forest-900/30"
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
                        <Button variant="ghost" size="sm" class="h-9 px-4">
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

                <!-- Actions -->
                <div class="flex items-center gap-1 sm:gap-2">
                    <Button
                        onclick={syncNow}
                        variant="outline"
                        size="sm"
                        disabled={syncing}
                        class="h-9 px-3 hidden sm:flex"
                    >
                        <RefreshCw
                            class={`h-4 w-4 sm:mr-2 ${syncing ? "animate-spin" : ""}`}
                        />
                        <span class="hidden sm:inline"
                            >{syncing ? "Syncing..." : "Sync"}</span
                        >
                    </Button>
                    <Button
                        onclick={() => (showAddRun = true)}
                        variant="default"
                        size="sm"
                        class="h-9 px-3 bg-forest-600 hover:bg-forest-700"
                    >
                        <Plus class="h-4 w-4 sm:mr-2" />
                        <span class="hidden sm:inline">Add Run</span>
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
                        class="flex flex-col items-center gap-1 py-2 px-3 text-slate-400 hover:text-white transition-colors"
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
                        onclick={syncNow}
                        class="flex flex-col items-center gap-1 py-2 px-3 text-slate-400 hover:text-white transition-colors"
                        disabled={syncing}
                    >
                        <RefreshCw
                            class={`h-5 w-5 ${syncing ? "animate-spin" : ""}`}
                        />
                        <span class="text-xs">Sync</span>
                    </button>
                </nav>
            </div>
        </header>

        <main class="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
            {#if syncMessage}
                <div
                    class="mb-6 rounded-xl bg-forest-500/10 px-4 py-3 text-sm text-forest-400"
                >
                    {syncMessage}
                </div>
            {/if}

            <!-- Next Run Hero -->
            {#if data.nextRun}
                <Card
                    class="mb-6 sm:mb-8 border-forest-500/30 bg-linear-to-br from-forest-900/20 to-slate-900"
                >
                    <CardContent class="p-4 sm:p-6">
                        <div class="flex items-center justify-between">
                            <div class="flex-1">
                                <div class="flex items-center gap-2 mb-1">
                                    <p
                                        class="text-xs sm:text-sm font-medium uppercase tracking-wider text-accent-300"
                                    >
                                        Next Run
                                    </p>
                                    {#if data.primaryGoal}
                                        <span class="text-xs text-slate-500">•</span>
                                        <div class="flex items-center gap-1 text-xs text-forest-400">
                                            <Target class="h-3 w-3" />
                                            <span>{data.primaryGoal.name}</span>
                                        </div>
                                    {/if}
                                </div>
                                <h2
                                    class="mt-1 font-display text-xl sm:text-2xl font-bold text-white"
                                >
                                    {data.nextRun.dateFormatted}
                                </h2>
                                <div
                                    class="mt-2 flex flex-wrap items-center gap-2 sm:gap-3"
                                >
                                    <span
                                        class="rounded-lg bg-forest-500/20 px-2.5 py-1 text-xs sm:text-sm font-medium text-forest-300"
                                    >
                                        {data.nextRun.type}
                                    </span>
                                    <span
                                        class="text-base sm:text-lg font-semibold text-slate-200"
                                        >{data.nextRun.distance}</span
                                    >
                                </div>
                                <p
                                    class="mt-2 text-xs sm:text-sm text-slate-400"
                                >
                                    {data.nextRun.description}
                                </p>
                                <div class="mt-4 flex flex-wrap gap-2">
                                    <Button
                                        onclick={() => runNow(data.nextRun!.id)}
                                        variant="default"
                                        size="sm"
                                        disabled={runningNow}
                                        class="bg-forest-600 hover:bg-forest-700 text-base"
                                    >
                                        {#if runningNow}
                                            <RefreshCw
                                                class="h-4 w-4 animate-spin"
                                            />
                                            Scheduling...
                                        {:else}
                                            <Zap class="h-4 w-4" />
                                            Do This Today
                                        {/if}
                                    </Button>
                                </div>
                            </div>
                            <div class="hidden sm:block ml-4">
                                <div
                                    class="flex h-20 w-20 items-center justify-center rounded-2xl bg-forest-500/20"
                                >
                                    <Calendar
                                        class="h-10 w-10 text-forest-400"
                                    />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            {:else}
                <!-- No plan - prompt to generate -->
                {#if data.primaryGoal}
                    <!-- Has goal, needs plan -->
                    <Card
                        class="mb-6 sm:mb-8 border-forest-500/30 bg-linear-to-br from-forest-900/20 to-slate-900"
                    >
                        <CardContent class="p-6">
                            <div class="text-center">
                                <div class="flex items-center justify-center gap-3 mb-4">
                                    <div class="flex items-center gap-2 text-forest-400">
                                        <Target class="h-5 w-5" />
                                        <span class="text-sm font-medium">Goal Set</span>
                                    </div>
                                    <ChevronRight class="h-4 w-4 text-slate-600" />
                                    <div class="flex items-center gap-2 text-amber-400">
                                        <Calendar class="h-5 w-5" />
                                        <span class="text-sm font-medium">Generate Plan</span>
                                    </div>
                                    <ChevronRight class="h-4 w-4 text-slate-600" />
                                    <div class="flex items-center gap-2 text-slate-500">
                                        <Activity class="h-5 w-5" />
                                        <span class="text-sm font-medium">Start Running</span>
                                    </div>
                                </div>
                                
                                <h2
                                    class="mt-4 font-display text-lg sm:text-xl font-bold text-white"
                                >
                                    Ready to Build Your Training Plan
                                </h2>
                                <p class="mt-2 text-sm text-slate-300">
                                    Goal: <span class="font-semibold text-forest-400">{data.primaryGoal.name}</span>
                                </p>
                                <p class="text-sm text-slate-400">
                                    {data.primaryGoal.target_distance_km}km by {new Date(data.primaryGoal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                                <p class="mt-3 text-sm text-slate-400">
                                    I'll create a personalized training plan based on your goal, current fitness, and available days.
                                </p>
                                <Button
                                    onclick={generatePlan}
                                    class="mt-4 bg-forest-600 hover:bg-forest-700"
                                    disabled={generatingPlan}
                                >
                                    {#if generatingPlan}
                                        <RefreshCw class="h-4 w-4 animate-spin" />
                                        Generating Plan...
                                    {:else}
                                        <Zap class="h-4 w-4" />
                                        Generate Training Plan
                                    {/if}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                {:else}
                    <!-- No goal, needs to create one first -->
                    <Card
                        class="mb-6 sm:mb-8 border-slate-700/50 bg-linear-to-br from-slate-850 to-slate-900"
                    >
                        <CardContent class="p-6">
                            <div class="text-center">
                                <div class="flex items-center justify-center gap-3 mb-4">
                                    <div class="flex items-center gap-2 text-amber-400">
                                        <Target class="h-5 w-5" />
                                        <span class="text-sm font-medium">Set a Goal</span>
                                    </div>
                                    <ChevronRight class="h-4 w-4 text-slate-600" />
                                    <div class="flex items-center gap-2 text-slate-500">
                                        <Calendar class="h-5 w-5" />
                                        <span class="text-sm font-medium">Generate Plan</span>
                                    </div>
                                    <ChevronRight class="h-4 w-4 text-slate-600" />
                                    <div class="flex items-center gap-2 text-slate-500">
                                        <Activity class="h-5 w-5" />
                                        <span class="text-sm font-medium">Start Running</span>
                                    </div>
                                </div>
                                
                                <h2
                                    class="mt-4 font-display text-lg sm:text-xl font-bold text-white"
                                >
                                    Let's Start with a Goal
                                </h2>
                                <p class="mt-2 text-sm text-slate-400">
                                    Set a running goal (like "Run a 5K" or "Complete a 10K race"), and I'll create a personalized training plan to help you achieve it.
                                </p>
                                <a href="/goals">
                                    <Button
                                        class="mt-4 bg-forest-600 hover:bg-forest-700"
                                    >
                                        <Target class="h-4 w-4" />
                                        Create Your First Goal
                                    </Button>
                                </a>
                            </div>
                        </CardContent>
                    </Card>
                {/if}
            {/if}

            <!-- Upcoming Runs -->
            {#if data.upcomingPlans.length > 0}
                <Card
                    class="mb-6 sm:mb-8 border-slate-800/50 bg-linear-to-br from-slate-850 to-slate-900"
                >
                    <CardHeader
                        class="flex flex-row items-center justify-between p-4 sm:p-6"
                    >
                        <CardTitle
                            class="flex items-center gap-2 text-base sm:text-lg"
                        >
                            <div
                                class="h-2 w-2 rounded-full bg-coral-500"
                            ></div>
                            Upcoming Runs
                        </CardTitle>
                        <Button
                            onclick={generatePlan}
                            variant="ghost"
                            size="sm"
                            disabled={generatingPlan}
                            class="h-8 sm:h-9"
                        >
                            <RefreshCw
                                class={`h-4 w-4 ${generatingPlan ? "animate-spin" : ""}`}
                            />
                            <span class="hidden sm:inline">Regenerate</span>
                        </Button>
                    </CardHeader>
                    <CardContent class="p-4 sm:p-6 pt-0 sm:pt-0">
                        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {#each data.upcomingPlans as plan}
                                <div
                                    class="rounded-xl border border-slate-700/50 bg-slate-800/50 p-3 sm:p-4"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <span
                                            class="text-xs sm:text-sm font-medium text-slate-300"
                                            >{plan.dayName}</span
                                        >
                                        <span
                                            class="rounded-lg bg-slate-700/50 px-2 py-0.5 text-xs font-medium text-slate-400"
                                        >
                                            {plan.type}
                                        </span>
                                    </div>
                                    <p
                                        class="mt-1 font-display text-base sm:text-lg font-bold text-white"
                                    >
                                        {plan.distance}
                                    </p>
                                    <p class="mt-1 text-xs text-slate-500">
                                        {plan.dateFormatted}
                                    </p>
                                </div>
                            {/each}
                        </div>
                    </CardContent>
                </Card>
            {/if}

            <!-- Active Goal Card -->
            {#if data.primaryGoal && data.primaryGoalProgress}
                <Card
                    class="mb-6 sm:mb-8 border-forest-800/50 bg-linear-to-br from-forest-900 to-slate-900"
                >
                    <CardHeader>
                        <CardTitle class="flex items-center gap-2">
                            <Target class="h-5 w-5 text-forest-400" />
                            <span>{data.primaryGoal.name}</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div class="mb-4">
                            <div class="mb-1 flex justify-between text-sm">
                                <span class="text-slate-300"
                                    >Progress to Goal</span
                                >
                                <span class="font-semibold text-white"
                                    >{data.primaryGoalProgress
                                        .percentComplete}%</span
                                >
                            </div>
                            <div class="h-2 w-full rounded-full bg-slate-700">
                                <div
                                    class="h-full rounded-full bg-gradient-to-r from-forest-600 to-forest-500"
                                    style="width: {data.primaryGoalProgress
                                        .percentComplete}%"
                                ></div>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <div class="text-slate-400">Target Date</div>
                                <div class="font-semibold text-white">
                                    {new Date(
                                        data.primaryGoal.target_date,
                                    ).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                    })}
                                </div>
                            </div>
                            <div>
                                <div class="text-slate-400">
                                    Weeks Remaining
                                </div>
                                <div class="font-semibold text-white">
                                    {data.primaryGoalProgress.weeksRemaining}
                                </div>
                            </div>
                            <div>
                                <div class="text-slate-400">Longest Run</div>
                                <div class="font-semibold text-white">
                                    {data.primaryGoalProgress.longestRun.toFixed(
                                        1,
                                    )}km
                                </div>
                            </div>
                            <div>
                                <div class="text-slate-400">Status</div>
                                <div
                                    class="font-semibold {data
                                        .primaryGoalProgress.status ===
                                    'on_track'
                                        ? 'text-green-400'
                                        : data.primaryGoalProgress.status ===
                                            'ahead'
                                          ? 'text-blue-400'
                                          : 'text-yellow-400'}"
                                >
                                    {data.primaryGoalProgress.status ===
                                    "on_track"
                                        ? "On track ✓"
                                        : data.primaryGoalProgress.status ===
                                            "ahead"
                                          ? "Ahead ⚡"
                                          : "Behind ⚠️"}
                                </div>
                            </div>
                        </div>

                        <a
                            href="/goals"
                            class="mt-4 inline-block text-forest-400 hover:text-forest-300 hover:underline text-sm"
                        >
                            View all goals →
                        </a>
                    </CardContent>
                </Card>
            {/if}

            <!-- Stats Grid -->
            <div class="mb-6 sm:mb-8 grid gap-3 sm:gap-4 sm:grid-cols-3">
                <Card
                    class="border-slate-800/50 bg-linear-to-br from-slate-850 to-slate-900"
                >
                    <CardContent class="p-4 sm:p-6">
                        <div class="flex items-center gap-3 sm:gap-4">
                            <div
                                class="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-forest-500/20 shrink-0"
                            >
                                <Activity
                                    class="h-5 w-5 sm:h-6 sm:w-6 text-forest-400"
                                />
                            </div>
                            <div class="min-w-0">
                                <p class="text-xs sm:text-sm text-slate-400">
                                    Total Runs
                                </p>
                                <p
                                    class="font-display text-xl sm:text-2xl font-bold text-white"
                                >
                                    {data.stats.totalRuns}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card
                    class="border-slate-800/50 bg-linear-to-br from-slate-850 to-slate-900"
                >
                    <CardContent class="p-4 sm:p-6">
                        <div class="flex items-center gap-3 sm:gap-4">
                            <div
                                class="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-coral-500/20 shrink-0"
                            >
                                <TrendingUp
                                    class="h-5 w-5 sm:h-6 sm:w-6 text-coral-400"
                                />
                            </div>
                            <div class="min-w-0">
                                <p class="text-xs sm:text-sm text-slate-400">
                                    Total Distance
                                </p>
                                <p
                                    class="font-display text-xl sm:text-2xl font-bold text-white"
                                >
                                    {data.stats.totalDistance}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card
                    class="border-slate-800/50 bg-linear-to-br from-slate-850 to-slate-900"
                >
                    <CardContent class="p-4 sm:p-6">
                        <div class="flex items-center gap-3 sm:gap-4">
                            <div
                                class="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-purple-500/20 shrink-0"
                            >
                                <Calendar
                                    class="h-5 w-5 sm:h-6 sm:w-6 text-purple-400"
                                />
                            </div>
                            <div class="min-w-0">
                                <p class="text-xs sm:text-sm text-slate-400">
                                    Avg Runs/Week
                                </p>
                                <p
                                    class="font-display text-xl sm:text-2xl font-bold text-white"
                                >
                                    {data.stats.avgWeeklyRuns}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <!-- Streak & Motivation Row -->
            <div class="mb-6 sm:mb-8 grid gap-3 sm:gap-4 sm:grid-cols-2">
                <!-- Streak Card -->
                <Card
                    class="border-amber-500/20 bg-linear-to-br from-amber-900/10 to-slate-900"
                >
                    <CardContent class="p-4 sm:p-6">
                        <div class="flex items-center justify-between">
                            <div class="flex-1">
                                <div class="flex items-center gap-2">
                                    <Flame
                                        class="h-4 w-4 sm:h-5 sm:w-5 text-amber-400"
                                    />
                                    <p
                                        class="text-xs sm:text-sm font-medium text-amber-400"
                                    >
                                        Current Streak
                                    </p>
                                </div>
                                <p
                                    class="mt-2 font-display text-3xl sm:text-4xl font-bold text-white"
                                >
                                    {data.streak.current}
                                    <span
                                        class="text-base sm:text-lg font-normal text-slate-400"
                                        >runs</span
                                    >
                                </p>
                                {#if data.streak.longest > data.streak.current}
                                    <p
                                        class="mt-1 text-xs sm:text-sm text-slate-500"
                                    >
                                        Best: {data.streak.longest} runs
                                    </p>
                                {/if}
                            </div>
                            <div
                                class="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-amber-500/20 shrink-0 ml-2"
                            >
                                <Trophy
                                    class="h-6 w-6 sm:h-8 sm:w-8 text-amber-400"
                                />
                            </div>
                        </div>
                        {#if data.streak.current >= 3}
                            <p
                                class="mt-4 text-xs sm:text-sm text-amber-300/80"
                            >
                                Don't break the chain! You're on fire!
                            </p>
                        {:else if data.streak.current === 0}
                            <p class="mt-4 text-xs sm:text-sm text-slate-400">
                                Complete your next scheduled run to start a
                                streak!
                            </p>
                        {/if}
                    </CardContent>
                </Card>

                <!-- Tips Card -->
                <Card
                    class="border-sky-500/20 bg-linear-to-br from-sky-900/10 to-slate-900"
                >
                    <CardContent class="p-4 sm:p-6">
                        <div class="flex items-center gap-2 mb-3">
                            <Lightbulb
                                class="h-4 w-4 sm:h-5 sm:w-5 text-sky-400"
                            />
                            <p
                                class="text-xs sm:text-sm font-medium text-sky-400"
                            >
                                Coach's Tip
                            </p>
                        </div>
                        <p
                            class="text-sm sm:text-base text-slate-200 leading-relaxed"
                        >
                            {data.tips[
                                Math.floor(Math.random() * data.tips.length)
                            ]}
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
                <Card
                    class="mb-6 sm:mb-8 border-slate-800/50 bg-linear-to-br from-slate-850 to-slate-900"
                >
                    <CardHeader class="p-4 sm:p-6">
                        <CardTitle
                            class="flex items-center gap-2 text-base sm:text-lg"
                        >
                            <Target
                                class="h-4 w-4 sm:h-5 sm:w-5 text-forest-400"
                            />
                            Your Progress
                        </CardTitle>
                    </CardHeader>
                    <CardContent class="p-4 sm:p-6 pt-0 sm:pt-0">
                        <div
                            class="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4"
                        >
                            <div>
                                <p class="text-xs sm:text-sm text-slate-400">
                                    Total Distance
                                </p>
                                <p
                                    class="font-display text-lg sm:text-2xl font-bold text-white"
                                >
                                    {data.progress.totalDistance} km
                                </p>
                            </div>
                            <div>
                                <p class="text-xs sm:text-sm text-slate-400">
                                    Total Time
                                </p>
                                <p
                                    class="font-display text-lg sm:text-2xl font-bold text-white"
                                >
                                    {data.progress.totalDuration} min
                                </p>
                            </div>
                            <div>
                                <p class="text-xs sm:text-sm text-slate-400">
                                    Runs Completed
                                </p>
                                <p
                                    class="font-display text-lg sm:text-2xl font-bold text-white"
                                >
                                    {data.progress.totalRuns}
                                </p>
                            </div>
                            {#if data.progress.paceImprovement}
                                <div>
                                    <p
                                        class="text-xs sm:text-sm text-slate-400"
                                    >
                                        Pace Improvement
                                    </p>
                                    <p
                                        class="font-display text-lg sm:text-2xl font-bold text-forest-400"
                                    >
                                        +{data.progress.paceImprovement}
                                    </p>
                                </div>
                            {/if}
                        </div>

                        {#if data.progress.firstRun && data.progress.latestRun && data.progress.totalRuns > 1}
                            <div
                                class="mt-4 sm:mt-6 rounded-xl bg-slate-800/50 p-3 sm:p-4"
                            >
                                <p
                                    class="text-xs sm:text-sm font-medium text-slate-300 mb-3"
                                >
                                    Your Journey
                                </p>
                                <div class="flex items-center gap-2 sm:gap-4">
                                    <div
                                        class="flex-1 rounded-lg bg-slate-700/50 p-2.5 sm:p-3"
                                    >
                                        <p class="text-xs text-slate-500">
                                            First Run
                                        </p>
                                        <p
                                            class="text-sm sm:text-base font-medium text-slate-200"
                                        >
                                            {data.progress.firstRun.distance.toFixed(
                                                1,
                                            )} km
                                        </p>
                                        <p class="text-xs text-slate-500">
                                            {new Date(
                                                data.progress.firstRun.date,
                                            ).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div
                                        class="text-forest-400 text-sm sm:text-base"
                                    >
                                        →
                                    </div>
                                    <div
                                        class="flex-1 rounded-lg bg-forest-500/20 p-2.5 sm:p-3"
                                    >
                                        <p class="text-xs text-forest-400">
                                            Latest Run
                                        </p>
                                        <p
                                            class="text-sm sm:text-base font-medium text-forest-200"
                                        >
                                            {data.progress.latestRun.distance.toFixed(
                                                1,
                                            )} km
                                        </p>
                                        <p class="text-xs text-forest-400">
                                            {new Date(
                                                data.progress.latestRun.date,
                                            ).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        {/if}
                    </CardContent>
                </Card>
            {/if}

            <!-- Consistency Chart -->
            <Card
                class="mb-6 sm:mb-8 border-slate-800/50 bg-linear-to-br from-slate-850 to-slate-900"
            >
                <CardHeader class="p-4 sm:p-6">
                    <CardTitle
                        class="flex items-center gap-2 text-base sm:text-lg"
                    >
                        <div class="h-2 w-2 rounded-full bg-forest-500"></div>
                        Consistency
                    </CardTitle>
                </CardHeader>
                <CardContent class="p-4 sm:p-6 pt-0 sm:pt-0">
                    <div
                        class="grid grid-cols-8 items-end gap-1.5 sm:gap-2"
                        style="height: 80px; sm:height: 100px;"
                    >
                        {#each consistencyBars as bar, i}
                            {@const barHeight =
                                bar.count > 0
                                    ? Math.round((bar.count / maxCount) * 80)
                                    : 6}
                            <div
                                class="w-full rounded-t-lg transition-all duration-500 {bar.count >
                                0
                                    ? 'bg-linear-to-t from-forest-600 to-forest-400'
                                    : 'bg-slate-700/50'}"
                                style="height: {barHeight}px;"
                                style:animation-delay="{i * 50}ms"
                            ></div>
                        {/each}
                    </div>
                    <div class="mt-2 grid grid-cols-8 gap-1.5 sm:gap-2">
                        {#each consistencyBars as _, i}
                            <span class="text-center text-xs text-slate-500"
                                >W{i + 1}</span
                            >
                        {/each}
                    </div>
                    <p
                        class="mt-3 sm:mt-4 text-center text-xs sm:text-sm text-slate-400"
                    >
                        Last 8 weeks • {consistencyBars.filter(
                            (b) => b.count > 0,
                        ).length} active weeks
                    </p>
                </CardContent>
            </Card>

            <!-- Recent Runs -->
            <Card
                class="border-slate-800/50 bg-linear-to-br from-slate-850 to-slate-900"
            >
                <CardHeader class="p-4 sm:p-6">
                    <CardTitle class="text-base sm:text-lg"
                        >Recent Runs</CardTitle
                    >
                </CardHeader>
                <CardContent class="p-4 sm:p-6 pt-0 sm:pt-0">
                    {#if data.runs.length === 0}
                        <div class="py-8 sm:py-12 text-center">
                            <Activity
                                class="mx-auto mb-4 h-10 w-10 sm:h-12 sm:w-12 text-slate-600"
                            />
                            <p class="text-sm sm:text-base text-slate-400">
                                No runs yet.
                            </p>
                            <p class="mt-1 text-xs sm:text-sm text-slate-500">
                                Add a run manually or sync from Garmin.
                            </p>
                            <Button
                                onclick={() => (showAddRun = true)}
                                class="mt-4"
                            >
                                <Plus class="h-4 w-4" />
                                Add Your First Run
                            </Button>
                        </div>
                    {:else}
                        <div class="space-y-3 sm:space-y-4">
                            {#each data.runs as run}
                                <a
                                    href="/runs/{run.garmin_activity_id}"
                                    class="block group relative"
                                >
                                    <div
                                        class="rounded-xl border border-slate-800/50 bg-slate-900/50 p-3 sm:p-4 transition-all hover:border-slate-700/50 hover:bg-slate-800/50"
                                    >
                                        <div
                                            class="flex items-start justify-between gap-2"
                                        >
                                            <div class="flex-1 min-w-0">
                                                <p
                                                    class="font-medium text-sm sm:text-base text-slate-200"
                                                >
                                                    {run.dateFormatted}
                                                </p>
                                                <div
                                                    class="mt-1 flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-slate-400"
                                                >
                                                    <span>{run.distance}</span>
                                                    <span class="text-slate-600"
                                                        >•</span
                                                    >
                                                    <span>{run.duration}</span>
                                                    <span class="text-slate-600"
                                                        >•</span
                                                    >
                                                    <span
                                                        class="hidden sm:inline"
                                                        >{run.pace}</span
                                                    >
                                                    {#if run.avg_hr}
                                                        <span
                                                            class="hidden sm:inline text-slate-600"
                                                            >•</span
                                                        >
                                                        <span
                                                            class="text-coral-400"
                                                            >{run.avg_hr} bpm</span
                                                        >
                                                    {/if}
                                                </div>
                                            </div>
                                            <div
                                                class="flex items-center gap-2 shrink-0"
                                            >
                                                <button
                                                    onclick={(e) =>
                                                        deleteRun(
                                                            run.garmin_activity_id,
                                                            e,
                                                        )}
                                                    disabled={deletingRuns.has(
                                                        run.garmin_activity_id,
                                                    )}
                                                    class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-700/50 rounded-lg"
                                                    aria-label="Delete run"
                                                >
                                                    {#if deletingRuns.has(run.garmin_activity_id)}
                                                        <Trash2
                                                            class="h-4 w-4 text-rose-400 animate-pulse"
                                                        />
                                                    {:else}
                                                        <Trash2
                                                            class="h-4 w-4 text-rose-400"
                                                        />
                                                    {/if}
                                                </button>
                                                <div class="text-slate-500">
                                                    <ChevronRight
                                                        class="h-4 w-4 sm:h-5 sm:w-5"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {#if run.ai_feedback}
                                            <div
                                                class="mt-3 sm:mt-4 flex gap-2 sm:gap-3"
                                            >
                                                <div
                                                    class="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-forest-500/20"
                                                >
                                                    <MessageCircle
                                                        class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-forest-400"
                                                    />
                                                </div>
                                                <div
                                                    class="rounded-2xl rounded-tl-sm bg-slate-800/80 px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-slate-300"
                                                >
                                                    {run.ai_feedback}
                                                </div>
                                            </div>
                                        {/if}
                                    </div>
                                </a>
                            {/each}
                        </div>
                    {/if}
                </CardContent>
            </Card>
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
