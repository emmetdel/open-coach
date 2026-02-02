<script lang="ts">
    import { Card, CardContent } from "./ui/card";
    import { CheckCircle2, Circle, Trophy } from "lucide-svelte";

    interface WeeklyProgressProps {
        completed: number;
        target: number;
        weekStart: string;
    }

    let { completed, target, weekStart }: WeeklyProgressProps = $props();

    // Format the week range (Mon - Sun)
    const weekRange = $derived(() => {
        const start = new Date(weekStart);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);

        const formatDate = (d: Date) =>
            d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

        return `${formatDate(start)} - ${formatDate(end)}`;
    });

    const isGoalMet = $derived(completed >= target);
    const progressPercent = $derived(
        Math.min(100, Math.round((completed / target) * 100))
    );

    // Generate progress dots
    const progressDots = $derived(() => {
        const dots = [];
        for (let i = 0; i < target; i++) {
            dots.push({
                index: i,
                completed: i < completed,
            });
        }
        return dots;
    });
</script>

<Card
    class="mb-6 sm:mb-8 border-slate-800/50 bg-linear-to-br from-slate-850 to-slate-900 {isGoalMet
        ? 'border-forest-500/30'
        : ''}"
>
    <CardContent class="p-4 sm:p-6">
        <div class="flex items-center justify-between mb-4">
            <div>
                <div class="flex items-center gap-2">
                    <h3 class="text-sm font-medium text-slate-300">This Week</h3>
                    <span class="text-xs text-slate-500">{weekRange()}</span>
                </div>
                <div class="mt-1 flex items-baseline gap-2">
                    <span class="font-display text-2xl font-bold text-white">
                        {completed}/{target}
                    </span>
                    <span class="text-sm text-slate-400">runs</span>
                </div>
            </div>

            {#if isGoalMet}
                <div
                    class="flex h-12 w-12 items-center justify-center rounded-xl bg-forest-500/20"
                >
                    <Trophy class="h-6 w-6 text-forest-400" />
                </div>
            {/if}
        </div>

        <!-- Progress bar -->
        <div class="h-2 w-full rounded-full bg-slate-700 mb-3">
            <div
                class="h-2 rounded-full transition-all duration-500 {isGoalMet
                    ? 'bg-forest-500'
                    : 'bg-forest-600'}"
                style="width: {progressPercent}%"
            ></div>
        </div>

        <!-- Progress dots -->
        <div class="flex items-center justify-center gap-3">
            {#each progressDots() as dot}
                {#if dot.completed}
                    <CheckCircle2 class="h-5 w-5 text-forest-400" />
                {:else}
                    <Circle class="h-5 w-5 text-slate-600" />
                {/if}
            {/each}
        </div>

        {#if isGoalMet}
            <p class="mt-4 text-center text-sm text-forest-400">
                Weekly goal reached! Great consistency!
            </p>
        {:else if completed > 0}
            <p class="mt-4 text-center text-sm text-slate-400">
                {target - completed} more run{target - completed === 1 ? "" : "s"} to hit your weekly goal
            </p>
        {:else}
            <p class="mt-4 text-center text-sm text-slate-400">
                Complete your first run this week to get started
            </p>
        {/if}
    </CardContent>
</Card>
