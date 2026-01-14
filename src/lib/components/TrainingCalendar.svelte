<script lang="ts">
	import { CheckCircle2 } from 'lucide-svelte';

	interface CalendarRun {
		id: string;
		date: string; // YYYY-MM-DD
		type: string;
		distance: string | null;
		duration: string | null;
		status: 'Pending' | 'Completed' | 'Missed';
	}

	let {
		runs,
		onMove,
		onStatusChange
	}: {
		runs: CalendarRun[];
		onMove: (runId: string, newDate: string) => Promise<void>;
		onStatusChange: (runId: string, newStatus: 'Pending' | 'Completed') => Promise<void>;
	} = $props();

	let currentMonth = $state(new Date());
	let draggedRunId = $state<string | null>(null);

	// Get runs for a specific date
	function getRunsForDate(date: Date): CalendarRun[] {
		const dateStr = date.toISOString().split('T')[0];
		return runs.filter((r) => r.date === dateStr);
	}

	// Check if date is today
	function isToday(date: Date): boolean {
		const today = new Date();
		return (
			date.getDate() === today.getDate() &&
			date.getMonth() === today.getMonth() &&
			date.getFullYear() === today.getFullYear()
		);
	}

	// Check if date is in the past
	function isPast(date: Date): boolean {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const checkDate = new Date(date);
		checkDate.setHours(0, 0, 0, 0);
		return checkDate < today;
	}

	// Get color for run based on status
	function getRunColor(run: CalendarRun, date: Date): string {
		if (run.status === 'Completed') {
			return 'bg-forest-500 text-white border-forest-600';
		} else if (run.status === 'Missed' || (run.status === 'Pending' && isPast(date))) {
			return 'bg-amber-500/80 text-white border-amber-600';
		} else {
			return 'bg-slate-600 text-slate-200 border-slate-700';
		}
	}

	// Get calendar days for current month
	function getCalendarDays(): Date[] {
		const year = currentMonth.getFullYear();
		const month = currentMonth.getMonth();

		// First day of month
		const firstDay = new Date(year, month, 1);
		const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

		// Last day of month
		const lastDay = new Date(year, month + 1, 0);

		// Calendar grid starts on Sunday before first day
		const calendarStart = new Date(firstDay);
		calendarStart.setDate(calendarStart.getDate() - startingDayOfWeek);

		// Generate 42 days (6 weeks) for calendar grid
		const days: Date[] = [];
		for (let i = 0; i < 42; i++) {
			const day = new Date(calendarStart);
			day.setDate(calendarStart.getDate() + i);
			days.push(day);
		}

		return days;
	}

	// Check if date is in current month
	function isCurrentMonth(date: Date): boolean {
		return date.getMonth() === currentMonth.getMonth();
	}

	// Navigate months
	function previousMonth() {
		currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
	}

	function nextMonth() {
		currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
	}

	// Drag and drop handlers
	function handleDragStart(event: DragEvent, runId: string) {
		draggedRunId = runId;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', runId);
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function handleDrop(event: DragEvent, targetDate: Date) {
		event.preventDefault();
		if (draggedRunId) {
			const newDateStr = targetDate.toISOString().split('T')[0];
			onMove(draggedRunId, newDateStr);
			draggedRunId = null;
		}
	}

	// Click handler to toggle status
	function handleRunClick(run: CalendarRun, event: MouseEvent) {
		event.stopPropagation();
		if (run.status === 'Completed') {
			// Toggle completed -> pending
			onStatusChange(run.id, 'Pending');
		}
		// Don't allow pending -> completed via click (let Garmin sync handle that)
	}

	const days = $derived(getCalendarDays());
</script>

<div class="rounded-xl border border-slate-700/50 bg-slate-850 p-4">
	<!-- Month navigation -->
	<div class="mb-4 flex items-center justify-between">
		<button
			onclick={previousMonth}
			class="rounded-lg bg-slate-700 px-3 py-1 text-sm font-medium text-white hover:bg-slate-600 transition-colors"
		>
			← Prev
		</button>
		<h2 class="font-display text-xl font-bold text-white">
			{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
		</h2>
		<button
			onclick={nextMonth}
			class="rounded-lg bg-slate-700 px-3 py-1 text-sm font-medium text-white hover:bg-slate-600 transition-colors"
		>
			Next →
		</button>
	</div>

	<!-- Day headers -->
	<div class="mb-2 grid grid-cols-7 gap-1">
		{#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as day}
			<div class="p-2 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
				{day}
			</div>
		{/each}
	</div>

	<!-- Calendar grid -->
	<div class="grid grid-cols-7 gap-1">
		{#each days as date}
			{@const dateRuns = getRunsForDate(date)}
			{@const isCurrentMonthDate = isCurrentMonth(date)}
			{@const isTodayDate = isToday(date)}

		<div
			class="min-h-20 rounded-lg border p-2 transition-colors {isTodayDate
				? 'border-forest-500 bg-slate-800'
				: 'border-slate-700/50 bg-slate-900'} {isCurrentMonthDate
				? ''
				: 'opacity-40'}"
			ondragover={handleDragOver}
			ondrop={(e) => handleDrop(e, date)}
			role="button"
			tabindex="0"
		>
				<!-- Date number -->
				<div class="mb-1 flex items-center justify-between">
					<span
						class="text-xs font-medium {isTodayDate
							? 'text-forest-400'
							: isCurrentMonthDate
								? 'text-slate-300'
								: 'text-slate-600'}"
					>
						{date.getDate()}
					</span>
				</div>

				<!-- Runs on this date -->
				<div class="space-y-1">
					{#each dateRuns as run}
						<button
							draggable={run.status === 'Pending'}
							ondragstart={(e) => handleDragStart(e, run.id)}
							onclick={(e) => handleRunClick(run, e)}
							class="w-full rounded border px-2 py-1 text-left text-xs font-medium transition-all hover:scale-105 hover:shadow-lg {getRunColor(
								run,
								date
							)} {run.status === 'Pending' ? 'cursor-move' : 'cursor-pointer hover:ring-2 hover:ring-white/50'}"
							title="{run.status === 'Completed' ? '✓ Completed - Click to undo' : run.status === 'Pending' ? 'Drag to reschedule' : 'Overdue'}"
						>
							<div class="flex items-center gap-1">
								{#if run.status === 'Completed'}
									<CheckCircle2 class="h-3 w-3" />
								{/if}
								<span class="truncate">{run.type}</span>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<!-- Legend -->
	<div class="mt-4 flex items-center justify-center gap-4 text-xs text-slate-400">
		<div class="flex items-center gap-1.5">
			<div class="h-3 w-3 rounded border border-forest-600 bg-forest-500"></div>
			<span>Completed</span>
		</div>
		<div class="flex items-center gap-1.5">
			<div class="h-3 w-3 rounded border border-slate-700 bg-slate-600"></div>
			<span>Pending</span>
		</div>
		<div class="flex items-center gap-1.5">
			<div class="h-3 w-3 rounded border border-amber-600 bg-amber-500/80"></div>
			<span>Overdue</span>
		</div>
	</div>

	<!-- Instructions -->
	<div class="mt-4 space-y-2 rounded-lg bg-slate-800/50 p-3 text-xs text-slate-400">
		<p class="font-medium text-slate-300">How to use:</p>
		<ul class="space-y-1 pl-4">
			<li>• <span class="text-white">Drag gray runs</span> to reschedule</li>
			<li>• <span class="text-white">Click green runs</span> to undo completion</li>
			<li>• Hover over any run to see options</li>
		</ul>
	</div>
</div>
