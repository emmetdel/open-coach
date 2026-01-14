<script lang="ts">
    import { onMount } from "svelte";
    import { fly, fade } from "svelte/transition";
    import { Send, MessageSquare, X, Sparkles } from "lucide-svelte";
    import { Button } from "$lib/components/ui/button";
    import { Textarea } from "$lib/components/ui/textarea";

    let messages: { role: "user" | "assistant"; content: string }[] = $state(
        [],
    );
    let input = $state("");
    let isLoading = $state(false);
    let isOpen = $state(false);
    let chatContainer = $state<HTMLElement>();

    $effect(() => {
        if (messages.length && isOpen) {
            scrollToBottom();
        }
    });

    async function loadHistory() {
        try {
            const res = await fetch("/api/chat");
            const data = await res.json();
            if (data.history) {
                messages = data.history.map((h: any) => ({
                    role: h.role,
                    content: h.content,
                }));
            }
        } catch (e) {
            console.error("Failed to load history", e);
        }
    }

    onMount(() => {
        loadHistory();
    });

    async function sendMessage() {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        messages = [...messages, { role: "user", content: userMsg }];
        input = "";
        isLoading = true;

        // Scroll to bottom
        setTimeout(scrollToBottom, 10);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMsg }),
            });
            const data = await res.json();

            if (data.response) {
                messages = [
                    ...messages,
                    { role: "assistant", content: data.response },
                ];
            } else {
                messages = [
                    ...messages,
                    {
                        role: "assistant",
                        content: "Something went wrong. Please try again.",
                    },
                ];
            }
        } catch (e) {
            messages = [
                ...messages,
                { role: "assistant", content: "Error connecting to coach." },
            ];
        } finally {
            isLoading = false;
            setTimeout(scrollToBottom, 10);
        }
    }

    function scrollToBottom() {
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    function toggleChat() {
        isOpen = !isOpen;
        if (isOpen) {
            setTimeout(scrollToBottom, 100);
        }
    }
</script>

{#if !isOpen}
    <div class="fixed bottom-6 right-6 z-50">
        <Button
            onclick={toggleChat}
            class="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 bg-primary hover:bg-primary/90"
        >
            <MessageSquare class="h-6 w-6 text-primary-foreground" />
        </Button>
    </div>
{:else}
    <div
        transition:fly={{ y: 20, duration: 300 }}
        class="fixed bottom-6 right-6 z-50 w-full max-w-[400px] h-[600px] shadow-2xl rounded-xl overflow-hidden flex flex-col bg-background/95 backdrop-blur-sm border border-border"
    >
        <!-- Header -->
        <div
            class="p-4 border-b border-border flex items-center justify-between bg-primary/5"
        >
            <div class="flex items-center gap-2">
                <Sparkles class="h-5 w-5 text-primary" />
                <h3 class="font-semibold text-foreground">Coach AI</h3>
            </div>
            <div class="flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8"
                    onclick={() => (isOpen = false)}
                >
                    <X class="h-4 w-4" />
                </Button>
            </div>
        </div>

        <!-- Messages -->
        <div
            class="flex-1 overflow-y-auto p-4 space-y-4"
            bind:this={chatContainer}
        >
            {#if messages.length === 0}
                <div
                    class="flex flex-col items-center justify-center h-full text-muted-foreground text-center p-6 opacity-70"
                >
                    <Sparkles class="h-12 w-12 mb-4 text-primary/30" />
                    <p class="text-lg font-medium mb-2">
                        How can I help you run today?
                    </p>
                    <p class="text-sm">
                        Ask me to modify your plan, analyze a run, or just chat
                        about training.
                    </p>
                </div>
            {/if}

            {#each messages as msg}
                <div
                    class="flex flex-col {msg.role === 'user'
                        ? 'items-end'
                        : 'items-start'}"
                >
                    <div
                        class="max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm
                        {msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-none'
                            : 'bg-muted text-foreground rounded-bl-none'}"
                    >
                        <p class="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <span class="text-[10px] text-muted-foreground mt-1 px-1">
                        {msg.role === "user" ? "You" : "Coach"}
                    </span>
                </div>
            {/each}

            {#if isLoading}
                <div class="flex flex-col items-start" transition:fade>
                    <div
                        class="bg-muted text-foreground rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-2"
                    >
                        <div class="flex gap-1">
                            <div
                                class="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
                            ></div>
                            <div
                                class="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:0.2s]"
                            ></div>
                            <div
                                class="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:0.4s]"
                            ></div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Input -->
        <div class="p-4 border-t border-border bg-background">
            <form
                class="relative flex items-end gap-2"
                onsubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                }}
            >
                <Textarea
                    bind:value={input}
                    placeholder="Ask me to change your plan..."
                    class="min-h-[50px] max-h-[150px] resize-none pr-12"
                    onkeydown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    }}
                />
                <Button
                    type="submit"
                    size="icon"
                    disabled={!input.trim() || isLoading}
                    class="absolute right-2 bottom-2 h-8 w-8"
                >
                    <Send class="h-4 w-4" />
                </Button>
            </form>
        </div>
    </div>
{/if}
