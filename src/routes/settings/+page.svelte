<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import {
        Card,
        CardContent,
        CardHeader,
        CardTitle,
        CardDescription,
    } from "$lib/components/ui/card";
    import { Textarea } from "$lib/components/ui/textarea";
    import {
        ArrowLeft,
        Brain,
        Calendar,
        Activity,
        Bell,
        Check,
        X,
        RefreshCw,
        Trash2,
        Smartphone,
    } from "lucide-svelte";
    import { onMount } from "svelte";

    let { data } = $props();

    // PWA & Notifications
    let notificationsSupported = $state(false);
    let notificationPermission = $state<NotificationPermission>("default");
    let pushEnabled = $state(data.settings?.pushEnabled || false);
    let subscribing = $state(false);
    let notificationMessage = $state("");
    let isInstalled = $state(false);
    let deferredPrompt: BeforeInstallPromptEvent | null = null;

    interface BeforeInstallPromptEvent extends Event {
        prompt(): Promise<void>;
        userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
    }

    onMount(() => {
        // Check notification support
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        notificationsSupported =
            "Notification" in window && "serviceWorker" in navigator && !isLocal;
        
        if (notificationsSupported) {
            notificationPermission = Notification.permission;
        }

        if (isLocal) {
            console.log('[PWA] Service Worker and Push disabled for local development');
        }

        // Check if already installed as PWA
        isInstalled = window.matchMedia("(display-mode: standalone)").matches;

        // Capture install prompt
        window.addEventListener("beforeinstallprompt", (e) => {
            e.preventDefault();
            deferredPrompt = e as BeforeInstallPromptEvent;
        });
    });

    async function enableNotifications() {
        subscribing = true;
        notificationMessage = "";

        try {
            // Request permission
            const permission = await Notification.requestPermission();
            notificationPermission = permission;

            if (permission !== "granted") {
                notificationMessage = "Notification permission denied";
                subscribing = false;
                return;
            }

            // Get VAPID public key
            const keyRes = await fetch("/api/push");
            const { publicKey } = await keyRes.json();

            // Get service worker registration
            const registration = await navigator.serviceWorker.ready;

            // Subscribe to push
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                applicationServerKey: urlBase64ToUint8Array(publicKey) as any,
            });

            // Save subscription to server
            await fetch("/api/push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(subscription.toJSON()),
            });

            pushEnabled = true;
            notificationMessage = "Notifications enabled! 🎉";
        } catch (err) {
            console.error("Push subscription error:", err);
            notificationMessage = "Failed to enable notifications";
        } finally {
            subscribing = false;
        }
    }

    async function disableNotifications() {
        subscribing = true;

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription =
                await registration.pushManager.getSubscription();

            if (subscription) {
                await subscription.unsubscribe();
                await fetch("/api/push", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                });
            }

            pushEnabled = false;
            notificationMessage = "Notifications disabled";
        } catch (err) {
            notificationMessage = "Failed to disable notifications";
        } finally {
            subscribing = false;
        }
    }

    async function installApp() {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === "accepted") {
            isInstalled = true;
            notificationMessage = "App installed! 📱";
        }
        deferredPrompt = null;
    }

    function urlBase64ToUint8Array(base64String: string): Uint8Array {
        const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, "+")
            .replace(/_/g, "/");
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    // AI Settings
    let openrouterKey = $state("");
    let openrouterModel = $state(
        data.settings?.openrouterModel || "anthropic/claude-sonnet-4",
    );
    let savingAI = $state(false);
    let aiMessage = $state("");

    // Training Settings
    let targetDate = $state(data.settings?.targetDate || "");
    let availableDays = $state<string[]>(data.settings?.availableDays || []);
    let currentFitness = $state(data.settings?.currentFitness || "");
    let savingTraining = $state(false);
    let trainingMessage = $state("");

    // Plan Actions
    let regenerating = $state(false);
    let regenerateMessage = $state("");

    const allDays = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ];

    const popularModels = [
        {
            id: "anthropic/claude-sonnet-4",
            name: "Claude Sonnet 4 (Recommended)",
            provider: "Anthropic",
        },
        {
            id: "anthropic/claude-3.5-sonnet",
            name: "Claude 3.5 Sonnet",
            provider: "Anthropic",
        },
        { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
        {
            id: "openai/gpt-4o-mini",
            name: "GPT-4o Mini (Faster)",
            provider: "OpenAI",
        },
        {
            id: "google/gemini-pro-1.5",
            name: "Gemini Pro 1.5",
            provider: "Google",
        },
        {
            id: "meta-llama/llama-3.1-70b-instruct",
            name: "Llama 3.1 70B",
            provider: "Meta",
        },
    ];

    function toggleDay(day: string) {
        if (availableDays.includes(day)) {
            availableDays = availableDays.filter((d) => d !== day);
        } else {
            availableDays = [...availableDays, day];
        }
    }

    async function saveAISettings() {
        savingAI = true;
        aiMessage = "";

        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    openrouter_key: openrouterKey || undefined,
                    openrouter_model: openrouterModel,
                }),
            });

            const result = await res.json();
            if (result.success) {
                aiMessage = "AI settings saved!";
                openrouterKey = ""; // Clear after save for security
            } else {
                aiMessage = result.error || "Failed to save";
            }
        } catch (err) {
            aiMessage = "Network error";
        } finally {
            savingAI = false;
        }
    }

    async function saveTrainingSettings() {
        savingTraining = true;
        trainingMessage = "";

        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    target_date: targetDate,
                    available_days: availableDays,
                    current_fitness: currentFitness,
                }),
            });

            const result = await res.json();
            if (result.success) {
                trainingMessage = "Training settings saved!";
            } else {
                trainingMessage = result.error || "Failed to save";
            }
        } catch (err) {
            trainingMessage = "Network error";
        } finally {
            savingTraining = false;
        }
    }

    async function regeneratePlan() {
        if (
            !confirm(
                "This will delete your current plan and generate a new one. Continue?",
            )
        ) {
            return;
        }

        regenerating = true;
        regenerateMessage = "";

        try {
            const res = await fetch("/api/plan/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            const result = await res.json();
            if (result.success) {
                regenerateMessage = `New plan generated! ${result.weeksGenerated} weeks created.`;
            } else {
                regenerateMessage = result.error || "Failed to generate plan";
            }
        } catch (err) {
            regenerateMessage = "Network error";
        } finally {
            regenerating = false;
        }
    }

    async function clearPlan() {
        if (
            !confirm(
                "This will delete all planned workouts. This cannot be undone. Continue?",
            )
        ) {
            return;
        }

        try {
            const res = await fetch("/api/plan", { method: "DELETE" });
            const result = await res.json();
            if (result.success) {
                regenerateMessage = "Plan cleared.";
            } else {
                regenerateMessage = result.error || "Failed to clear plan";
            }
        } catch (err) {
            regenerateMessage = "Network error";
        }
    }
</script>

<svelte:head>
    <title>Settings | OpenCoach</title>
</svelte:head>

<div class="min-h-screen bg-slate-900">
    <div class="mx-auto max-w-3xl px-4 py-8">
        <!-- Header -->
        <div class="mb-8 flex items-center gap-4">
            <a href="/" class="flex items-center gap-3">
                <img
                    src="/icons/android-chrome-192x192.png"
                    alt="OpenCoach"
                    class="h-10 w-10 rounded-xl"
                />
            </a>
            <div>
                <h1 class="font-display text-2xl font-bold text-white">
                    Settings
                </h1>
                <p class="text-sm text-slate-400">
                    Configure your training preferences and AI coach
                </p>
            </div>
        </div>

        <div class="space-y-6">
            <!-- AI Settings -->
            <Card class="border-slate-800/50 bg-slate-850">
                <CardHeader>
                    <div class="flex items-center gap-3">
                        <div
                            class="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/20"
                        >
                            <Brain class="h-5 w-5 text-violet-400" />
                        </div>
                        <div>
                            <CardTitle>AI Coach</CardTitle>
                            <CardDescription
                                >Configure your AI model and API key</CardDescription
                            >
                        </div>
                    </div>
                </CardHeader>
                <CardContent class="space-y-4">
                    <div class="space-y-2">
                        <Label for="model">AI Model</Label>
                        <select
                            id="model"
                            bind:value={openrouterModel}
                            class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                        >
                            {#each popularModels as model}
                                <option value={model.id}
                                    >{model.name} ({model.provider})</option
                                >
                            {/each}
                        </select>
                        <p class="text-xs text-slate-500">
                            Different models have different capabilities and
                            costs
                        </p>
                    </div>

                    <div class="space-y-2">
                        <Label for="api-key">OpenRouter API Key</Label>
                        <Input
                            id="api-key"
                            type="password"
                            placeholder={data.settings?.hasOpenRouterKey
                                ? "••••••••••••••••"
                                : "sk-or-v1-..."}
                            bind:value={openrouterKey}
                        />
                        <p class="text-xs text-slate-500">
                            Get your key at <a
                                href="https://openrouter.ai/keys"
                                target="_blank"
                                class="text-accent-400 hover:underline"
                                >openrouter.ai/keys</a
                            >
                            {#if data.settings?.hasOpenRouterKey}
                                <span class="ml-2 text-forest-400"
                                    >✓ Key saved</span
                                >
                            {/if}
                        </p>
                    </div>

                    {#if aiMessage}
                        <p
                            class="text-sm {aiMessage.includes('saved')
                                ? 'text-forest-400'
                                : 'text-amber-400'}"
                        >
                            {aiMessage}
                        </p>
                    {/if}

                    <Button onclick={saveAISettings} disabled={savingAI}>
                        {savingAI ? "Saving..." : "Save AI Settings"}
                    </Button>
                </CardContent>
            </Card>

            <!-- Training Settings -->
            <Card class="border-slate-800/50 bg-slate-850">
                <CardHeader>
                    <div class="flex items-center gap-3">
                        <div
                            class="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-500/20"
                        >
                            <Calendar class="h-5 w-5 text-forest-400" />
                        </div>
                        <div>
                            <CardTitle>Training Preferences</CardTitle>
                            <CardDescription
                                >Set your goal and available training days</CardDescription
                            >
                        </div>
                    </div>
                </CardHeader>
                <CardContent class="space-y-4">
                    <div class="space-y-2">
                        <Label for="target-date">Goal Date</Label>
                        <Input
                            id="target-date"
                            type="date"
                            bind:value={targetDate}
                        />
                        <p class="text-xs text-slate-500">
                            Your target race or goal date
                        </p>
                    </div>

                    <div class="space-y-2">
                        <Label>Available Days</Label>
                        <div class="flex flex-wrap gap-2">
                            {#each allDays as day}
                                <button
                                    type="button"
                                    onclick={() => toggleDay(day)}
                                    class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {availableDays.includes(
                                        day,
                                    )
                                        ? 'bg-forest-500 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}"
                                >
                                    {day.slice(0, 3)}
                                </button>
                            {/each}
                        </div>
                        <p class="text-xs text-slate-500">
                            Days you can typically run
                        </p>
                    </div>

                    <div class="space-y-2">
                        <Label for="fitness">Current Fitness Level</Label>
                        <Textarea
                            id="fitness"
                            placeholder="e.g., I can run 3km without stopping, run 2x per week..."
                            bind:value={currentFitness}
                            rows={3}
                        />
                        <p class="text-xs text-slate-500">
                            Help the AI understand your starting point
                        </p>
                    </div>

                    {#if trainingMessage}
                        <p
                            class="text-sm {trainingMessage.includes('saved')
                                ? 'text-forest-400'
                                : 'text-amber-400'}"
                        >
                            {trainingMessage}
                        </p>
                    {/if}

                    <Button
                        onclick={saveTrainingSettings}
                        disabled={savingTraining}
                    >
                        {savingTraining
                            ? "Saving..."
                            : "Save Training Settings"}
                    </Button>
                </CardContent>
            </Card>

            <!-- Plan Management -->
            <Card class="border-slate-800/50 bg-slate-850">
                <CardHeader>
                    <div class="flex items-center gap-3">
                        <div
                            class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20"
                        >
                            <Activity class="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                            <CardTitle>Training Plan</CardTitle>
                            <CardDescription
                                >Regenerate or clear your training plan</CardDescription
                            >
                        </div>
                    </div>
                </CardHeader>
                <CardContent class="space-y-4">
                    <p class="text-sm text-slate-400">
                        Regenerating will create a new plan based on your
                        current settings. This will delete any existing
                        scheduled workouts from Garmin.
                    </p>

                    {#if regenerateMessage}
                        <p
                            class="text-sm {regenerateMessage.includes(
                                'generated',
                            )
                                ? 'text-forest-400'
                                : 'text-amber-400'}"
                        >
                            {regenerateMessage}
                        </p>
                    {/if}

                    <div class="flex gap-3">
                        <Button
                            onclick={regeneratePlan}
                            disabled={regenerating}
                            class="flex-1"
                        >
                            <RefreshCw
                                class="h-4 w-4 {regenerating
                                    ? 'animate-spin'
                                    : ''}"
                            />
                            {regenerating ? "Generating..." : "Regenerate Plan"}
                        </Button>
                        <Button
                            onclick={clearPlan}
                            variant="outline"
                            class="border-red-500/50 text-red-400 hover:bg-red-500/10"
                        >
                            <Trash2 class="h-4 w-4" />
                            Clear Plan
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <!-- PWA & Notifications -->
            <Card class="border-slate-800/50 bg-slate-850">
                <CardHeader>
                    <div class="flex items-center gap-3">
                        <div
                            class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20"
                        >
                            <Smartphone class="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                            <CardTitle>App & Notifications</CardTitle>
                            <CardDescription
                                >Install the app and enable push notifications</CardDescription
                            >
                        </div>
                    </div>
                </CardHeader>
                <CardContent class="space-y-4">
                    <!-- Install App -->
                    {#if !isInstalled}
                        <div
                            class="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4"
                        >
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="font-medium text-white">
                                        Install OpenCoach
                                    </p>
                                    <p class="text-sm text-slate-400">
                                        Add to your home screen for quick access
                                    </p>
                                </div>
                                {#if deferredPrompt}
                                    <Button onclick={installApp} size="sm">
                                        Install
                                    </Button>
                                {:else}
                                    <span class="text-sm text-slate-500">
                                        {isInstalled
                                            ? "Already installed"
                                            : "Use browser menu to install"}
                                    </span>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <div
                            class="flex items-center gap-3 rounded-xl bg-forest-500/10 p-4"
                        >
                            <Check class="h-5 w-5 text-forest-400" />
                            <span class="text-forest-300"
                                >App installed on this device</span
                            >
                        </div>
                    {/if}

                    <!-- Push Notifications -->
                    <div
                        class="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4"
                    >
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="font-medium text-white">
                                    Push Notifications
                                </p>
                                <p class="text-sm text-slate-400">
                                    Get reminders for runs and coaching tips
                                </p>
                            </div>
                            {#if !notificationsSupported}
                                <span class="text-sm text-slate-500"
                                    >Not supported</span
                                >
                            {:else if pushEnabled}
                                <Button
                                    onclick={disableNotifications}
                                    variant="outline"
                                    size="sm"
                                    disabled={subscribing}
                                >
                                    {subscribing ? "Updating..." : "Disable"}
                                </Button>
                            {:else}
                                <Button
                                    onclick={enableNotifications}
                                    size="sm"
                                    disabled={subscribing}
                                >
                                    <Bell class="h-4 w-4" />
                                    {subscribing ? "Enabling..." : "Enable"}
                                </Button>
                            {/if}
                        </div>
                        {#if notificationPermission === "denied"}
                            <p class="mt-2 text-sm text-amber-400">
                                Notifications are blocked. Please enable them in
                                your browser settings.
                            </p>
                        {/if}
                    </div>

                    {#if notificationMessage}
                        <p
                            class="text-sm {notificationMessage.includes(
                                'enabled',
                            ) || notificationMessage.includes('installed')
                                ? 'text-forest-400'
                                : 'text-amber-400'}"
                        >
                            {notificationMessage}
                        </p>
                    {/if}
                </CardContent>
            </Card>

            <!-- Garmin Status -->
            <Card class="border-slate-800/50 bg-slate-850">
                <CardHeader>
                    <div class="flex items-center gap-3">
                        <div
                            class="flex h-10 w-10 items-center justify-center rounded-lg {data
                                .settings?.garminConnected
                                ? 'bg-forest-500/20'
                                : 'bg-red-500/20'}"
                        >
                            {#if data.settings?.garminConnected}
                                <Check class="h-5 w-5 text-forest-400" />
                            {:else}
                                <X class="h-5 w-5 text-red-400" />
                            {/if}
                        </div>
                        <div>
                            <CardTitle>Garmin Connect</CardTitle>
                            <CardDescription>
                                {#if data.settings?.garminConnected}
                                    Connected and syncing
                                {:else}
                                    Not connected
                                {/if}
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {#if data.settings?.garminFromEnv}
                        <p class="text-sm text-slate-400">
                            Garmin credentials are set via environment
                            variables. To change them, update your <code
                                class="rounded bg-slate-800 px-1">.env</code
                            > file.
                        </p>
                    {:else if !data.settings?.garminConnected}
                        <p class="text-sm text-slate-400 mb-4">
                            Connect your Garmin account to sync runs and
                            workouts.
                        </p>
                        <a href="/setup">
                            <Button variant="outline">Connect Garmin</Button>
                        </a>
                    {:else}
                        <p class="text-sm text-slate-400">
                            Your Garmin account is connected. Runs and workouts
                            sync automatically.
                        </p>
                    {/if}
                </CardContent>
            </Card>
        </div>

        <!-- Footer -->
        <footer
            class="mt-8 border-t border-slate-800/50 py-8 text-center text-sm text-slate-500"
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
