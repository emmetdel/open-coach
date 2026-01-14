<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { invalidateAll } from "$app/navigation";
    import GoalModal from "$lib/components/GoalModal.svelte";
    import GoalProgressCard from "$lib/components/GoalProgressCard.svelte";
    import { Button } from "$lib/components/ui/button";
    import {
        Card,
        CardHeader,
        CardTitle,
        CardContent,
    } from "$lib/components/ui/card";

    let { data } = $props();

    let showGoalModal = $state(false);
    let editingGoal = $state<any>(null);

    function openCreateModal() {
        editingGoal = null;
        showGoalModal = true;
    }

    function openEditModal(goal: any) {
        editingGoal = goal;
        showGoalModal = true;
    }

    function closeModal() {
        showGoalModal = false;
        editingGoal = null;
    }

    async function handleGoalSuccess() {
        closeModal();
        // Reload the page to get updated goals
        await invalidateAll();
    }

    async function deleteGoal(goalId: string) {
        if (
            !confirm(
                "Are you sure you want to delete this goal? This will also delete all associated workouts.",
            )
        ) {
            return;
        }

        try {
            const response = await fetch(`/api/goals/${goalId}`, {
                method: "DELETE",
            });

            if (response.ok) {
                await invalidateAll();
            } else {
                alert("Failed to delete goal");
            }
        } catch (err) {
            console.error("Failed to delete goal:", err);
            alert("Failed to delete goal");
        }
    }
</script>

<div class="container mx-auto px-4 py-8">
    <div class="mb-8 flex items-center justify-between">
        <div>
            <h1 class="text-3xl font-bold text-white">My Training Goals</h1>
            <p class="mt-2 text-slate-400">
                Set targets and track your progress
            </p>
        </div>
        <Button
            onclick={openCreateModal}
            class="bg-forest-600 hover:bg-forest-700"
        >
            + New Goal
        </Button>
    </div>

    {#if data.goals.length === 0}
        <Card class="border-slate-700 bg-slate-800">
            <CardContent class="py-12 text-center">
                <div class="mb-4 text-6xl">🎯</div>
                <h3 class="mb-2 text-xl font-semibold text-white">
                    No goals yet
                </h3>
                <p class="mb-6 text-slate-400">
                    Create your first goal to get a personalized training plan
                </p>
                <Button
                    onclick={openCreateModal}
                    class="bg-forest-600 hover:bg-forest-700"
                >
                    Create Your First Goal
                </Button>
            </CardContent>
        </Card>
    {:else}
        <div class="grid gap-6 md:grid-cols-2">
            {#each data.goals as goal}
                <GoalProgressCard
                    {goal}
                    onedit={() => openEditModal(goal)}
                    ondelete={() => deleteGoal(goal.id)}
                />
            {/each}
        </div>
    {/if}
</div>

{#if showGoalModal}
    <GoalModal
        open={showGoalModal}
        goal={editingGoal}
        onClose={closeModal}
        onSuccess={handleGoalSuccess}
    />
{/if}
