<script lang="ts">
    import { onMount } from "svelte";
    import { Button } from "./ui/button";
    import { Input } from "./ui/input";
    import { Label } from "./ui/label";
    import { Textarea } from "./ui/textarea";

    export let open: boolean = false;
    export let goal: any = null;
    export let onClose: () => void;
    export let onSuccess: () => void;

    let formData = {
        name: "",
        goal_type: "distance",
        target_date: "",
        target_distance_km: 10,
        target_duration_minutes: null,
        description: "",
    };

    let errors: Record<string, string> = {};
    let isSubmitting = false;

    // Calculate min and max dates
    let minDate: string = "";
    let maxDate: string = "";

    onMount(() => {
        const today = new Date();
        const min = new Date(today);
        min.setDate(min.getDate() + 56); // 8 weeks
        minDate = min.toISOString().split("T")[0];

        const max = new Date(today);
        max.setFullYear(max.getFullYear() + 1);
        maxDate = max.toISOString().split("T")[0];
    });

    // Populate form when editing
    $: if (goal && open) {
        formData = {
            name: goal.name || "",
            goal_type: goal.goal_type || "distance",
            target_date: goal.target_date || "",
            target_distance_km: goal.target_distance_km || 10,
            target_duration_minutes: goal.target_duration_minutes || null,
            description: goal.description || "",
        };
    } else if (open) {
        // Reset form for new goal
        formData = {
            name: "",
            goal_type: "distance",
            target_date: "",
            target_distance_km: 10,
            target_duration_minutes: null,
            description: "",
        };
    }

    function validate(): boolean {
        errors = {};

        if (!formData.name.trim()) {
            errors.name = "Goal name is required";
        } else if (formData.name.length > 100) {
            errors.name = "Goal name must be less than 100 characters";
        }

        if (!formData.target_date) {
            errors.target_date = "Target date is required";
        } else {
            const targetDate = new Date(formData.target_date);
            const min = new Date(minDate);
            const max = new Date(maxDate);

            if (targetDate < min) {
                errors.target_date =
                    "Target date must be at least 8 weeks in the future";
            } else if (targetDate > max) {
                errors.target_date = "Target date must be within 1 year";
            }
        }

        if (!formData.target_distance_km || formData.target_distance_km < 1) {
            errors.target_distance_km = "Target distance is required";
        } else if (
            formData.target_distance_km &&
            (formData.target_distance_km < 1 ||
                formData.target_distance_km > 42.2)
        ) {
            errors.target_distance_km =
                "Target distance must be between 1 and 42.2 km";
        }

        return Object.keys(errors).length === 0;
    }

    async function handleSubmit() {
        if (!validate()) {
            return;
        }

        isSubmitting = true;

        try {
            const url = goal ? `/api/goals/${goal.id}` : "/api/goals";
            const method = goal ? "PATCH" : "POST";

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (response.ok) {
                onSuccess();
            } else {
                errors.general = result.error || "Failed to save goal";
            }
        } catch (err) {
            console.error("Failed to save goal:", err);
            errors.general = "An error occurred while saving the goal";
        } finally {
            isSubmitting = false;
        }
    }

    function handleCancel() {
        onClose();
        errors = {};
    }
</script>

{#if open}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        on:click={handleCancel}
        on:keydown={(e) => e.key === 'Escape' && handleCancel()}
        role="dialog"
        aria-modal="true"
    >
        <div
            class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-slate-800 p-6 shadow-xl"
            on:click|stopPropagation
            on:keydown={(e) => e.stopPropagation()}
            role="document"
        >
            <h2 class="mb-6 text-2xl font-bold text-white">
                {goal ? "Edit Goal" : "Create New Goal"}
            </h2>

            {#if errors.general}
                <div class="mb-4 rounded bg-red-900/50 p-3 text-red-300">
                    {errors.general}
                </div>
            {/if}

            <form on:submit|preventDefault={handleSubmit}>
                <!-- Goal Name -->
                <div class="mb-4">
                    <Label
                        for="name"
                        class="mb-2 block text-sm font-medium text-slate-300"
                    >
                        Goal Name *
                    </Label>
                    <Input
                        id="name"
                        type="text"
                        bind:value={formData.name}
                        placeholder="e.g., Run my first 10km"
                        class="bg-slate-700 text-white placeholder-slate-400"
                        maxlength="100"
                    />
                    {#if errors.name}
                        <p class="mt-1 text-sm text-red-400">{errors.name}</p>
                    {/if}
                </div>

                <!-- Goal Type -->
                <div class="mb-4">
                    <Label
                        for="goal_type"
                        class="mb-2 block text-sm font-medium text-slate-300"
                    >
                        Goal Type *
                    </Label>
                    <select
                        id="goal_type"
                        bind:value={formData.goal_type}
                        class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-forest-500 focus:outline-none focus:ring-1 focus:ring-forest-500"
                    >
                        <option value="distance">Distance Goal</option>
                        <option value="race">Race Event</option>
                    </select>
                </div>

                <!-- Target Date -->
                <div class="mb-4">
                    <Label
                        for="target_date"
                        class="mb-2 block text-sm font-medium text-slate-300"
                    >
                        Target Date *
                    </Label>
                    <Input
                        id="target_date"
                        type="date"
                        bind:value={formData.target_date}
                        min={minDate}
                        max={maxDate}
                        class="bg-slate-700 text-white"
                    />
                    {#if errors.target_date}
                        <p class="mt-1 text-sm text-red-400">
                            {errors.target_date}
                        </p>
                    {:else}
                        <p class="mt-1 text-xs text-slate-400">
                            Must be at least 8 weeks from today
                        </p>
                    {/if}
                </div>

                <!-- Target Distance -->
                <div class="mb-4">
                    <Label
                        for="target_distance_km"
                        class="mb-2 block text-sm font-medium text-slate-300"
                    >
                        Target Distance (km) *
                    </Label>
                    <Input
                        id="target_distance_km"
                        type="number"
                        bind:value={formData.target_distance_km}
                        min="1"
                        max="42.2"
                        step="0.1"
                        class="bg-slate-700 text-white"
                    />
                    {#if errors.target_distance_km}
                        <p class="mt-1 text-sm text-red-400">
                            {errors.target_distance_km}
                        </p>
                    {:else}
                        <p class="mt-1 text-xs text-slate-400">
                            Range: 1 - 42.2 km
                        </p>
                    {/if}
                </div>

                <!-- Description -->
                <div class="mb-6">
                    <Label
                        for="description"
                        class="mb-2 block text-sm font-medium text-slate-300"
                    >
                        Description
                    </Label>
                    <Textarea
                        id="description"
                        bind:value={formData.description}
                        placeholder="Why is this goal important to you?"
                        rows="3"
                        class="bg-slate-700 text-white placeholder-slate-400"
                    />
                    <p class="mt-1 text-xs text-slate-400">
                        Optional: Add any notes about your goal
                    </p>
                </div>

                <!-- Buttons -->
                <div class="flex justify-end gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        on:click={handleCancel}
                        disabled={isSubmitting}
                        class="border-slate-600 text-slate-300 hover:bg-slate-700"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        class="bg-forest-600 hover:bg-forest-700"
                    >
                        {isSubmitting
                            ? "Saving..."
                            : goal
                              ? "Update Goal"
                              : "Create Goal"}
                    </Button>
                </div>
            </form>
        </div>
    </div>
{/if}
