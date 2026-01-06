<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
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
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Sora:wght@100..800&display=swap"
		rel="stylesheet"
	/>
	<title>OpenCoach</title>
</svelte:head>

{@render children()}
