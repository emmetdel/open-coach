<script lang="ts">
	import { cn } from '$lib/utils';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	interface Props extends HTMLTextareaAttributes {
		value?: string;
	}

	let { class: className, value = $bindable(''), ...restProps }: Props = $props();
</script>

<textarea
	class={cn(
		'flex min-h-[100px] w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors resize-none',
		className
	)}
	bind:value
	{...restProps}
></textarea>

