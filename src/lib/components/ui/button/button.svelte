<script lang="ts">
	import { cn } from '$lib/utils';
	import { buttonVariants, type ButtonProps } from './index';

	let {
		class: className,
		variant = 'default',
		size = 'default',
		children,
		...restProps
	}: ButtonProps = $props();
</script>

<button class={cn(buttonVariants({ variant, size }), className)} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</button>

