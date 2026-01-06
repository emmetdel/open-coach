<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		children?: Snippet;
	}

	let { class: className, children, ...restProps }: Props = $props();
</script>

<div
	class={cn(
		'rounded-2xl border border-slate-800 bg-slate-850 shadow-xl shadow-black/20',
		className
	)}
	{...restProps}
>
	{#if children}
		{@render children()}
	{/if}
</div>

