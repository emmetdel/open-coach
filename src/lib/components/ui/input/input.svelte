<script lang="ts">
	import { cn } from '$lib/utils';
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends HTMLInputAttributes {
		value?: string;
	}

	let { class: className, value = $bindable(''), ...restProps }: Props = $props();
</script>

<input
	class={cn(
		'flex h-11 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
		className
	)}
	bind:value
	{...restProps}
/>

