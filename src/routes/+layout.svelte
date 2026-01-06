<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';

	let { children } = $props();
	let theme = $state('forest');

	onMount(() => {
		// Load saved theme
		const saved = localStorage.getItem('opencoach-theme');
		if (saved) {
			theme = saved;
			document.documentElement.setAttribute('data-theme', saved);
		}
	});

	// Export theme setter for other components
	function setTheme(newTheme: string) {
		theme = newTheme;
		localStorage.setItem('opencoach-theme', newTheme);
		document.documentElement.setAttribute('data-theme', newTheme);
	}

	// Make setTheme available globally
	if (typeof window !== 'undefined') {
		(window as any).setTheme = setTheme;
	}
</script>

<svelte:head>
	<title>OpenCoach</title>
</svelte:head>

{@render children()}
