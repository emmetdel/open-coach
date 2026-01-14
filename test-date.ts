function getWeekStartDate(startDate: Date, weekNumber: number): Date {
  const weekStart = new Date(startDate);
  // Current implementation
  const dayOfWeek = weekStart.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(
    weekStart.getDate() + daysUntilMonday + (weekNumber - 1) * 7,
  );
  return weekStart;
}

const today = new Date('2026-01-14T12:00:00'); // Wednesday
console.log('Today:', today.toDateString());

const week1Start = getWeekStartDate(today, 1);
console.log('Week 1 Start:', week1Start.toDateString());

const week2Start = getWeekStartDate(today, 2);
console.log('Week 2 Start:', week2Start.toDateString());
