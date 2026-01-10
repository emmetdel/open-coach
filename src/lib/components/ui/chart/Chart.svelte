<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		type ChartConfiguration,
		type ChartItem,
		registerables
	} from 'chart.js';

	// Register all built-in components
	Chart.register(...registerables);

	let { config, class: className = '' } = $props<{
		config: ChartConfiguration;
		class?: string;
	}>();

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	onMount(() => {
		if (canvas) {
			const ctx = canvas.getContext('2d');
			if (ctx) {
				chart = new Chart(ctx as ChartItem, config);
			}
		}
	});

	onDestroy(() => {
		if (chart) {
			chart.destroy();
			chart = null;
		}
	});

    // Watch for config changes
	$effect(() => {
		if (chart && config) {
			chart.data = config.data;
			chart.options = config.options;
			chart.update();
		}
	});
</script>

<div class={className}>
	<canvas bind:this={canvas}></canvas>
</div>
