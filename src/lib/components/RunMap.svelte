<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import 'leaflet/dist/leaflet.css';

	interface Props {
		polyline: string;
		class?: string;
	}

	let { polyline, class: className }: Props = $props();

	let mapElement: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let map: any;

	// Simple polyline decoder (Google algorithm)
	function decodePolyline(str: string, precision = 5) {
		let index = 0,
			lat = 0,
			lng = 0,
			coordinates = [],
			shift = 0,
			result = 0,
			byte = null,
			latitude_change,
			longitude_change,
			factor = Math.pow(10, precision);

		while (index < str.length) {
			byte = null;
			shift = 0;
			result = 0;

			do {
				byte = str.charCodeAt(index++) - 63;
				result |= (byte & 0x1f) << shift;
				shift += 5;
			} while (byte >= 0x20);

			latitude_change = result & 1 ? ~(result >> 1) : result >> 1;

			shift = result = 0;

			do {
				byte = str.charCodeAt(index++) - 63;
				result |= (byte & 0x1f) << shift;
				shift += 5;
			} while (byte >= 0x20);

			longitude_change = result & 1 ? ~(result >> 1) : result >> 1;

			lat += latitude_change;
			lng += longitude_change;

			coordinates.push([lat / factor, lng / factor]);
		}

		return coordinates;
	}

	onMount(async () => {
		if (browser && polyline) {
			const L = await import('leaflet');

			map = L.map(mapElement, {
				zoomControl: false,
				attributionControl: false,
				dragging: false,
				scrollWheelZoom: false,
				doubleClickZoom: false,
				boxZoom: false,
				keyboard: false
			});

			L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
				subdomains: 'abcd',
				maxZoom: 20
			}).addTo(map);

			const coordinates = decodePolyline(polyline);
			
			if (coordinates.length > 0) {
				const line = L.polyline(coordinates as L.LatLngExpression[], {
					color: '#22c55e', // forest-500
					weight: 4,
					opacity: 0.8,
					lineCap: 'round',
					lineJoin: 'round'
				}).addTo(map);

				map.fitBounds(line.getBounds(), { padding: [20, 20] });
			}
		}
	});

	onDestroy(() => {
		if (map) {
			map.remove();
		}
	});
</script>

<div bind:this={mapElement} class={className || "h-48 w-full rounded-xl bg-slate-900"}></div>
