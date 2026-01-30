<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";

  let name = $state("");
  let email = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);

  async function handleSignup() {
    if (!name || !email || !password) {
      error = "Please complete every field.";
      return;
    }

    loading = true;
    error = "";

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        error = result.error || "Signup failed.";
        return;
      }

      await goto("/setup");
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
      <h1 class="text-3xl font-semibold">Create your coach profile</h1>
      <p class="text-sm text-slate-400">
        Set your goal first. We will build everything else around it.
      </p>
    </div>

    {#if error}
      <div class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {error}
      </div>
    {/if}

    <form class="space-y-4" onsubmit={(e) => { e.preventDefault(); handleSignup(); }}>
      <div class="space-y-2">
        <Label for="name">Name</Label>
        <Input id="name" type="text" bind:value={name} placeholder="Jordan" />
      </div>
      <div class="space-y-2">
        <Label for="email">Email</Label>
        <Input id="email" type="email" bind:value={email} placeholder="you@example.com" />
      </div>
      <div class="space-y-2">
        <Label for="password">Password</Label>
        <Input id="password" type="password" bind:value={password} />
      </div>
      <Button type="submit" class="w-full bg-forest-600 hover:bg-forest-700" disabled={loading}>
        {loading ? "Creating account..." : "Create account"}
      </Button>
    </form>

    <p class="text-center text-sm text-slate-400">
      Already have an account?
      <a href="/login" class="text-forest-400 hover:text-forest-300">Sign in</a>
    </p>
  </div>
</div>
