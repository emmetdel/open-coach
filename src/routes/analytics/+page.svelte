<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import {
        Card,
        CardContent,
        CardHeader,
        CardTitle,
    } from "$lib/components/ui/card";
    import {
        TrendingUp,
        Activity,
        Calendar,
        Heart,
        Trophy,
        Settings,
        Zap,
        Target,
    } from "lucide-svelte";
    import type { PageData } from "./$types";
    import Chart from "$lib/components/ui/chart/Chart.svelte";
    import type { ChartConfiguration } from "chart.js";

    let { data }: { data: PageData } = $props();

    function formatPace(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    // Chart Options Helpers
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                backgroundColor: "#1e293b",
                titleColor: "#f8fafc",
                bodyColor: "#cbd5e1",
                borderColor: "#334155",
                borderWidth: 1,
                padding: 10,
                displayColors: false,
            },
        },
        scales: {
            x: {
                grid: {
                    color: "#334155",
                    drawBorder: false,
                },
                ticks: {
                    color: "#94a3b8",
                },
            },
            y: {
                grid: {
                    color: "#334155",
                    drawBorder: false,
                },
                ticks: {
                    color: "#94a3b8",
                },
            },
        },
    };

    // Pace Chart Config
    const paceChartConfig: ChartConfiguration = $derived({
        type: "line",
        data: {
            labels: data.paceData.map((p) => p.date),
            datasets: [
                {
                    label: "Pace (min/km)",
                    data: data.paceData.map((p) => p.paceSeconds),
                    borderColor: "#10b981", // forest-500
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: "#059669", // forest-600
                    pointRadius: 4,
                    pointHoverRadius: 6,
                },
            ],
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    ...commonOptions.scales.y,
                    reverse: true, // Lower pace is better/faster
                    ticks: {
                        color: "#94a3b8",
                        callback: (value) => formatPace(Number(value)),
                    },
                },
            },
            plugins: {
                ...commonOptions.plugins,
                tooltip: {
                    ...commonOptions.plugins.tooltip,
                    callbacks: {
                        label: (context) =>
                            `Pace: ${formatPace(Number(context.raw))}/km`,
                    },
                },
            },
        },
    });

    // Volume Chart Config
    const volumeChartConfig: ChartConfiguration = $derived({
        type: "bar",
        data: {
            labels: data.volumeData.map((w) => w.week),
            datasets: [
                {
                    label: "Distance (km)",
                    data: data.volumeData.map((w) => w.distanceKm),
                    backgroundColor: "#f43f5e", // coral-500 (approx rose-500)
                    borderRadius: 4,
                    hoverBackgroundColor: "#fb7185", // rose-400
                },
            ],
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                tooltip: {
                    ...commonOptions.plugins.tooltip,
                    callbacks: {
                        label: (context) => `Distance: ${context.raw} km`,
                    },
                },
            },
        },
    });

    // Weekly Completion Rate Chart Config
    const completionChartConfig: ChartConfiguration = $derived({
        type: "bar",
        data: {
            labels: data.consistency.weeklyCompletion.map((w) => w.week),
            datasets: [
                {
                    label: "Completed",
                    data: data.consistency.weeklyCompletion.map(
                        (w) => w.completed,
                    ),
                    backgroundColor: "#10b981", // forest-500
                    borderRadius: 4,
                },
                {
                    label: "Missed",
                    data: data.consistency.weeklyCompletion.map(
                        (w) => w.planned - w.completed,
                    ),
                    backgroundColor: "#ef4444", // red-500
                    borderRadius: 4,
                },
            ],
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                x: {
                    ...commonOptions.scales.x,
                    stacked: true,
                },
                y: {
                    ...commonOptions.scales.y,
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        color: "#94a3b8",
                        stepSize: 1,
                    },
                    suggestedMax: 3, // Ensure small values are visible
                },
            },
            plugins: {
                ...commonOptions.plugins,
                legend: {
                    display: true,
                    position: "top",
                    labels: {
                        color: "#cbd5e1",
                        font: { size: 12 },
                        boxWidth: 12,
                    },
                },
                tooltip: {
                    ...commonOptions.plugins.tooltip,
                    callbacks: {
                        label: (context) =>
                            `${context.dataset.label}: ${context.raw} runs`,
                    },
                },
            },
        },
    });

    // HR Zone Config
    const hrZoneChartConfig: ChartConfiguration = $derived({
        type: "doughnut",
        data: {
            labels: data.hrZoneData.map((z) => z.zone),
            datasets: [
                {
                    data: data.hrZoneData.map((z) => z.count),
                    backgroundColor: [
                        "#94a3b8", // Z1 - slate-400
                        "#60a5fa", // Z2 - blue-400
                        "#34d399", // Z3 - emerald-400
                        "#fbbf24", // Z4 - amber-400
                        "#f87171", // Z5 - red-400
                    ],
                    borderWidth: 0,
                    hoverOffset: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "right",
                    labels: {
                        color: "#cbd5e1",
                        font: {
                            size: 12,
                        },
                        boxWidth: 12,
                    },
                },
                tooltip: commonOptions.plugins.tooltip,
            },
        },
    });
</script>

<svelte:head>
    <title>Analytics | OpenCoach</title>
</svelte:head>

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
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-9 px-4 bg-slate-800"
                        >
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
                        class="flex flex-col items-center gap-1 py-2 px-3 text-white"
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
                </nav>
            </div>
        </header>

        <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            {#if !data.hasRuns}
                <!-- No runs yet -->
                <Card
                    class="border-slate-700/50 bg-gradient-to-br from-slate-850 to-slate-900"
                >
                    <CardContent class="p-8 text-center">
                        <Activity class="mx-auto h-16 w-16 text-slate-500" />
                        <h2
                            class="mt-6 font-display text-2xl font-bold text-white"
                        >
                            No Data Yet
                        </h2>
                        <p class="mx-auto mt-3 max-w-md text-slate-400">
                            Start logging runs to see your analytics and track
                            your progress.
                        </p>
                        <a href="/">
                            <Button class="mt-6">Go to Dashboard</Button>
                        </a>
                    </CardContent>
                </Card>
            {:else}
                <!-- Stats Overview -->
                <div
                    class="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6"
                >
                    <Card class="border-slate-800/50 bg-slate-850/50">
                        <CardContent class="p-4">
                            <div
                                class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400"
                            >
                                Total Runs
                            </div>
                            <p
                                class="font-display text-2xl font-bold text-white"
                            >
                                {data.totalStats.totalRuns}
                            </p>
                        </CardContent>
                    </Card>

                    <Card class="border-slate-800/50 bg-slate-850/50">
                        <CardContent class="p-4">
                            <div
                                class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400"
                            >
                                Total Distance
                            </div>
                            <p
                                class="font-display text-2xl font-bold text-white"
                            >
                                {data.totalStats.totalDistance}
                            </p>
                        </CardContent>
                    </Card>

                    <Card class="border-slate-800/50 bg-slate-850/50">
                        <CardContent class="p-4">
                            <div
                                class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400"
                            >
                                Total Time
                            </div>
                            <p
                                class="font-display text-2xl font-bold text-white"
                            >
                                {data.totalStats.totalDuration}
                            </p>
                        </CardContent>
                    </Card>

                    <Card class="border-slate-800/50 bg-slate-850/50">
                        <CardContent class="p-4">
                            <div
                                class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400"
                            >
                                Avg Pace
                            </div>
                            <p
                                class="font-display text-2xl font-bold text-white"
                            >
                                {data.totalStats.avgPace}
                            </p>
                        </CardContent>
                    </Card>

                    <Card class="border-slate-800/50 bg-slate-850/50">
                        <CardContent class="p-4">
                            <div
                                class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400"
                            >
                                Longest Run
                            </div>
                            <p
                                class="font-display text-2xl font-bold text-white"
                            >
                                {data.totalStats.longestRun}
                            </p>
                        </CardContent>
                    </Card>

                    <Card class="border-slate-800/50 bg-slate-850/50">
                        <CardContent class="p-4">
                            <div
                                class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400"
                            >
                                Best Pace
                            </div>
                            <p
                                class="font-display text-2xl font-bold text-white"
                            >
                                {data.totalStats.fastestPace}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <!-- Consistency Section -->
                <div class="mb-8">
                    <h2
                        class="mb-6 font-display text-2xl font-bold text-white flex items-center gap-2"
                    >
                        <Activity class="h-6 w-6 text-forest-400" />
                        Consistency Tracking
                    </h2>

                    {#if data.consistency.weeklyCompletion.every((w) => w.planned === 0)}
                        <!-- No historical plan data yet -->
                        <Card
                            class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900"
                        >
                            <CardContent class="p-8 text-center">
                                <Calendar
                                    class="mx-auto h-16 w-16 text-slate-500"
                                />
                                <h3
                                    class="mt-6 font-display text-xl font-bold text-white"
                                >
                                    Start Your Plan to See Consistency
                                </h3>
                                <p class="mx-auto mt-3 max-w-md text-slate-400">
                                    Follow your training plan and complete runs
                                    to see your consistency metrics, streaks,
                                    and habit health score.
                                </p>
                            </CardContent>
                        </Card>
                    {:else}
                        <!-- Habit Health & Streaks -->
                        <div class="mb-6 grid gap-4 md:grid-cols-3">
                            <!-- Habit Health Score -->
                            <Card
                                class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900"
                            >
                                <CardContent class="p-6 text-center">
                                    <div
                                        class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400"
                                    >
                                        Habit Health
                                    </div>
                                    <div
                                        class="mb-3 font-display text-5xl font-bold {data
                                            .consistency.healthStatus ===
                                        'excellent'
                                            ? 'text-forest-400'
                                            : data.consistency.healthStatus ===
                                                'good'
                                              ? 'text-forest-500'
                                              : data.consistency
                                                      .healthStatus ===
                                                  'slipping'
                                                ? 'text-amber-500'
                                                : 'text-red-500'}"
                                    >
                                        {data.consistency.habitHealth}%
                                    </div>
                                    <p class="text-sm text-slate-300">
                                        {data.consistency.healthMessage}
                                    </p>
                                </CardContent>
                            </Card>

                            <!-- Current Streak -->
                            <Card
                                class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900"
                            >
                                <CardContent class="p-6 text-center">
                                    <div
                                        class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400"
                                    >
                                        Current Streak
                                    </div>
                                    <div
                                        class="mb-1 font-display text-5xl font-bold text-forest-400"
                                    >
                                        {data.consistency.currentStreak}
                                    </div>
                                    <p class="text-sm text-slate-500">
                                        {data.consistency.currentStreak === 1
                                            ? "week"
                                            : "weeks"} ≥75%
                                    </p>
                                </CardContent>
                            </Card>

                            <!-- Best Streak -->
                            <Card
                                class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900"
                            >
                                <CardContent class="p-6 text-center">
                                    <div
                                        class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400"
                                    >
                                        Best Streak
                                    </div>
                                    <div
                                        class="mb-1 font-display text-5xl font-bold text-amber-400"
                                    >
                                        {data.consistency.bestStreak}
                                    </div>
                                    <p class="text-sm text-slate-500">
                                        {data.consistency.bestStreak === 1
                                            ? "week"
                                            : "weeks"} ≥75%
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        <!-- Weekly Completion Chart -->
                        <Card
                            class="mb-6 border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900"
                        >
                            <CardHeader>
                                <CardTitle class="flex items-center gap-2">
                                    <Calendar class="h-5 w-5 text-forest-400" />
                                    Weekly Completion Rate
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {#if data.consistency.weeklyCompletion.length > 0}
                                    <div class="h-64 w-full">
                                        <Chart
                                            config={completionChartConfig}
                                            class="h-full w-full"
                                        />
                                    </div>
                                {:else}
                                    <p class="py-8 text-center text-slate-400">
                                        No training plan data yet
                                    </p>
                                {/if}
                            </CardContent>
                        </Card>

                        <!-- Calendar Heatmap -->
                        <Card
                            class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900"
                        >
                            <CardHeader>
                                <CardTitle class="flex items-center gap-2">
                                    <Activity class="h-5 w-5 text-forest-400" />
                                    Activity Calendar (Last 90 Days)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div class="overflow-x-auto">
                                    <div
                                        class="inline-grid grid-cols-13 gap-1.5 min-w-full"
                                    >
                                        {#each data.consistency.calendarData as day}
                                            <div
                                                class="h-3 w-3 rounded-sm {day.hasRun
                                                    ? day.count > 1
                                                        ? 'bg-forest-400'
                                                        : 'bg-forest-600'
                                                    : 'bg-slate-700/30'}"
                                                title="{new Date(
                                                    day.date,
                                                ).toLocaleDateString()}: {day.count} {day.count ===
                                                1
                                                    ? 'run'
                                                    : 'runs'}"
                                            ></div>
                                        {/each}
                                    </div>
                                    <div
                                        class="mt-4 flex items-center justify-end gap-2 text-xs text-slate-500"
                                    >
                                        <span>Less</span>
                                        <div
                                            class="h-3 w-3 rounded-sm bg-slate-700/30"
                                        ></div>
                                        <div
                                            class="h-3 w-3 rounded-sm bg-forest-600"
                                        ></div>
                                        <div
                                            class="h-3 w-3 rounded-sm bg-forest-400"
                                        ></div>
                                        <span>More</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    {/if}
                </div>

                <div class="grid gap-8 lg:grid-cols-2">
                    <!-- Pace Progression Chart -->
                    <Card
                        class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900"
                    >
                        <CardHeader>
                            <CardTitle class="flex items-center gap-2">
                                <TrendingUp class="h-5 w-5 text-forest-400" />
                                Pace Progression
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {#if data.paceData.length > 0}
                                <div class="h-64 w-full">
                                    <Chart
                                        config={paceChartConfig}
                                        class="h-full w-full"
                                    />
                                </div>
                            {:else}
                                <p class="py-8 text-center text-slate-400">
                                    Not enough data yet
                                </p>
                            {/if}
                        </CardContent>
                    </Card>

                    <!-- Weekly Volume Chart -->
                    <Card
                        class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900"
                    >
                        <CardHeader>
                            <CardTitle class="flex items-center gap-2">
                                <Activity class="h-5 w-5 text-coral-400" />
                                Weekly Volume
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {#if data.volumeData.length > 0}
                                <div class="h-64 w-full">
                                    <Chart
                                        config={volumeChartConfig}
                                        class="h-full w-full"
                                    />
                                </div>
                            {:else}
                                <p class="py-8 text-center text-slate-400">
                                    Not enough data yet
                                </p>
                            {/if}
                        </CardContent>
                    </Card>

                    <!-- Personal Records -->
                    <Card
                        class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900"
                    >
                        <CardHeader>
                            <CardTitle class="flex items-center gap-2">
                                <Trophy class="h-5 w-5 text-amber-400" />
                                Personal Records
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div class="space-y-4">
                                {#each Object.entries(data.personalRecords) as [distance, record]}
                                    <div
                                        class="flex items-center justify-between border-b border-slate-700/50 pb-3 last:border-0"
                                    >
                                        <div>
                                            <p class="font-medium text-white">
                                                {distance}
                                            </p>
                                            {#if record}
                                                <p
                                                    class="text-sm text-slate-400"
                                                >
                                                    {record.date}
                                                </p>
                                            {/if}
                                        </div>
                                        {#if record}
                                            <div class="text-right">
                                                <p
                                                    class="font-display font-bold text-forest-400"
                                                >
                                                    {record.time}
                                                </p>
                                                <p
                                                    class="text-xs text-slate-500"
                                                >
                                                    {record.pace}/km
                                                </p>
                                            </div>
                                        {:else}
                                            <p class="text-sm text-slate-500">
                                                No data
                                            </p>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </CardContent>
                    </Card>

                    <!-- HR Zone Distribution -->
                    <Card
                        class="border-slate-800/50 bg-gradient-to-br from-slate-850 to-slate-900"
                    >
                        <CardHeader>
                            <CardTitle class="flex items-center gap-2">
                                <Heart class="h-5 w-5 text-rose-400" />
                                Training Zones
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {#if data.hrZoneData.some((z) => z.count > 0)}
                                <div class="h-64 w-full">
                                    <Chart
                                        config={hrZoneChartConfig}
                                        class="h-full w-full"
                                    />
                                </div>
                            {:else}
                                <p class="py-8 text-center text-slate-400">
                                    No heart rate data yet
                                </p>
                            {/if}
                        </CardContent>
                    </Card>
                </div>
            {/if}
        </main>
    </div>
</div>
