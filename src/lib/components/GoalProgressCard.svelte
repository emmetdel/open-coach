<script lang="ts">
    import { Button } from "./ui/button";
    import {
        Card,
        CardHeader,
        CardTitle,
        CardContent,
        CardFooter,
    } from "./ui/card";

    let { goal, onedit, ondelete } = $props();

    function getStatusColor(status: string): string {
        switch (status) {
            case "on_track":
                return "text-green-400";
            case "ahead":
                return "text-blue-400";
            case "behind":
                return "text-yellow-400";
            default:
                return "text-slate-400";
        }
    }

    function getStatusText(status: string): string {
        switch (status) {
            case "on_track":
                return "On track to meet goal ✓";
            case "ahead":
                return "Ahead of schedule ⚡";
            case "behind":
                return "Behind schedule ⚠️";
            default:
                return "In progress";
        }
    }

    function formatDate(dateString: string): string {
        const date = new Date(dateString);
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

    function getNextMilestone(): string {
        const weeksRemaining =
            goal.progress.totalWeeks - goal.progress.weeksCompleted;
        const targetDistance = goal.target_distance_km;

        if (weeksRemaining <= 2) {
            return "Taper week - race preparation";
        } else if (goal.progress.longestRun < targetDistance * 0.5) {
            return `Build to ${Math.round(targetDistance * 0.5)}km continuous run`;
        } else if (goal.progress.longestRun < targetDistance * 0.75) {
            return `Build to ${Math.round(targetDistance * 0.75)}km continuous run`;
        } else {
            return `Peak training - build to ${targetDistance}km`;
        }
    }
</script>

<Card
    class="border-slate-700 bg-slate-800 transition-all hover:border-slate-600"
>
    <CardHeader>
        <CardTitle class="flex items-center justify-between text-white">
            <div class="flex items-center gap-2">
                <span class="text-2xl">🎯</span>
                <span class="text-xl">{goal.name}</span>
            </div>
            <span class="text-sm font-normal text-slate-400">
                {formatDate(goal.target_date)}
            </span>
        </CardTitle>
    </CardHeader>

    <CardContent>
        <!-- Progress Bar -->
        <div class="mb-4">
            <div class="mb-2 flex justify-between text-sm">
                <span class="text-slate-300">Progress to Goal</span>
                <span class="font-semibold text-white"
                    >{goal.progress.percentComplete}%</span
                >
            </div>
            <div class="h-3 w-full overflow-hidden rounded-full bg-slate-700">
                <div
                    class="h-full rounded-full bg-linear-to-r from-forest-600 to-forest-500 transition-all duration-500"
                    style="width: {goal.progress.percentComplete}%"
                ></div>
            </div>
        </div>

        <!-- Progress Stats -->
        <div class="mb-4 space-y-2 rounded-lg bg-slate-700/50 p-4">
            <div class="flex items-center gap-2 text-sm">
                <span class="text-slate-400">📊</span>
                <span class="text-slate-300">Progress:</span>
            </div>

            <div class="grid grid-cols-2 gap-3 text-sm">
                <div>
                    <div class="text-slate-400">Weeks</div>
                    <div class="font-semibold text-white">
                        {goal.progress.weeksCompleted} / {goal.progress
                            .totalWeeks}
                    </div>
                </div>
                <div>
                    <div class="text-slate-400">Runs</div>
                    <div class="font-semibold text-white">
                        {goal.progress.runsCompleted} / {goal.progress
                            .totalRuns}
                    </div>
                </div>
                <div>
                    <div class="text-slate-400">Longest Run</div>
                    <div class="font-semibold text-white">
                        {goal.progress.longestRun.toFixed(1)}km
                    </div>
                </div>
                <div>
                    <div class="text-slate-400">Status</div>
                    <div
                        class="font-semibold {getStatusColor(
                            goal.progress.status,
                        )}"
                    >
                        {getStatusText(goal.progress.status)}
                    </div>
                </div>
            </div>
        </div>

        <!-- Next Milestone -->
        <div
            class="rounded-lg bg-forest-900/30 border border-forest-800/50 p-3"
        >
            <div class="mb-1 flex items-center gap-2 text-sm">
                <span>📅</span>
                <span class="font-medium text-forest-300">Next Milestone:</span>
            </div>
            <p class="text-sm text-slate-300">
                {getNextMilestone()}
            </p>
        </div>
    </CardContent>

    <CardFooter class="flex justify-between border-t border-slate-700 pt-4">
        <Button
            variant="outline"
            onclick={() => (window.location.href = "/plan")}
            class="border-slate-600 text-slate-300 hover:bg-slate-700"
        >
            View Full Plan
        </Button>
        <div class="flex gap-2">
            <Button
                variant="outline"
                size="sm"
                onclick={onedit}
                class="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
                Edit
            </Button>
            <Button
                variant="outline"
                size="sm"
                onclick={ondelete}
                class="border-red-900/50 text-red-400 hover:bg-red-900/20"
            >
                Delete
            </Button>
        </div>
    </CardFooter>
</Card>
