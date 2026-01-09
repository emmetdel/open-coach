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
        Target,
        Zap,
        Settings,
    } from "lucide-svelte";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();
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
                                {@const minPace = Math.min(
                                    ...data.paceData.map((p) => p.paceSeconds),
                                )}
                                {@const maxPace = Math.max(
                                    ...data.paceData.map((p) => p.paceSeconds),
                                )}
                                {@const paceRange = maxPace - minPace}
                                <div class="space-y-2">
                                    <p class="text-sm text-slate-400">
                                        Last {data.paceData.length} run{data
                                            .paceData.length > 1
                                            ? "s"
                                            : ""}
                                    </p>
                                    <div
                                        class="h-64 flex items-end justify-between gap-1"
                                    >
                                        {#each data.paceData as point}
                                            <div
                                                class="flex flex-1 flex-col items-center justify-end group relative"
                                            >
                                                <div
                                                    class="w-full rounded-t bg-gradient-to-t from-forest-600 to-forest-400 min-h-[20px]"
                                                    style="height: {paceRange >
                                                    0
                                                        ? ((maxPace -
                                                              point.paceSeconds) /
                                                              paceRange) *
                                                              80 +
                                                          20
                                                        : 50}%"
                                                ></div>
                                                <div
                                                    class="absolute bottom-full mb-2 hidden group-hover:block bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10"
                                                >
                                                    {point.pace} • {point.date}
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                    <div
                                        class="flex justify-between text-xs text-slate-500"
                                    >
                                        <span>{data.paceData[0].date}</span>
                                        {#if data.paceData.length > 1}
                                            <span
                                                >{data.paceData[
                                                    data.paceData.length - 1
                                                ].date}</span
                                            >
                                        {/if}
                                    </div>
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
                                {@const maxVolume = Math.max(
                                    ...data.volumeData.map((w) => w.distanceKm),
                                )}
                                <div class="space-y-2">
                                    <p class="text-sm text-slate-400">
                                        Last {data.volumeData.length} week{data
                                            .volumeData.length > 1
                                            ? "s"
                                            : ""}
                                    </p>
                                    <div
                                        class="h-64 flex items-end justify-between gap-2"
                                    >
                                        {#each data.volumeData as week}
                                            <div
                                                class="flex flex-1 flex-col items-center justify-end group relative"
                                            >
                                                <div
                                                    class="w-full rounded-t bg-gradient-to-t from-coral-600 to-coral-400 min-h-[20px]"
                                                    style="height: {maxVolume >
                                                    0
                                                        ? (week.distanceKm /
                                                              maxVolume) *
                                                              90 +
                                                          10
                                                        : 50}%"
                                                ></div>
                                                <div
                                                    class="absolute bottom-full mb-2 hidden group-hover:block bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10"
                                                >
                                                    {week.distance}km • {week.week}
                                                </div>
                                                <span
                                                    class="mt-2 text-xs text-slate-500"
                                                    >{week.distance}km</span
                                                >
                                            </div>
                                        {/each}
                                    </div>
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
                                <div class="space-y-3">
                                    {#each data.hrZoneData as zone}
                                        {#if zone.count > 0}
                                            <div>
                                                <div
                                                    class="mb-1 flex items-center justify-between text-sm"
                                                >
                                                    <span class="text-slate-300"
                                                        >{zone.zone}</span
                                                    >
                                                    <span
                                                        class="font-medium text-white"
                                                        >{zone.count} runs</span
                                                    >
                                                </div>
                                                <div
                                                    class="h-2 w-full rounded-full bg-slate-800"
                                                >
                                                    <div
                                                        class="h-full rounded-full bg-rose-500"
                                                        style="width: {(zone.count /
                                                            Math.max(
                                                                ...data.hrZoneData.map(
                                                                    (z) =>
                                                                        z.count,
                                                                ),
                                                            )) *
                                                            100}%"
                                                    ></div>
                                                </div>
                                            </div>
                                        {/if}
                                    {/each}
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
