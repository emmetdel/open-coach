<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";

  let email = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);

  async function handleLogin() {
    if (!email || !password) {
      error = "Please enter your email and password.";
      return;
    }

    loading = true;
    error = "";

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        error = result.error || "Login failed.";
        return;
      }

      await goto("/");
    } catch (err) {
      error = "Network error. Please try again.";
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-slate-950 px-4 py-16 text-white">
  <div class="mx-auto w-full max-w-md space-y-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-lg">
    <div class="space-y-2 text-center">
      <h1 class="text-3xl font-semibold">Welcome back</h1>
      <p class="text-sm text-slate-400">
        Sign in to keep your goal front and center.
      </p>
    </div>

    {#if error}
      <div class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {error}
      </div>
    {/if}

    <form class="space-y-4" onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
      <div class="space-y-2">
        <Label for="email">Email</Label>
        <Input id="email" type="email" bind:value={email} placeholder="you@example.com" />
      </div>
      <div class="space-y-2">
        <Label for="password">Password</Label>
        <Input id="password" type="password" bind:value={password} />
      </div>
      <Button type="submit" class="w-full bg-forest-600 hover:bg-forest-700" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
    </form>

    <p class="text-center text-sm text-slate-400">
      Need an account?
      <a href="/signup" class="text-forest-400 hover:text-forest-300">Create one</a>
    </p>
  </div>
</div>
