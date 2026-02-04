export type DayToken = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export const DAY_ORDER: DayToken[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

export const DAY_LABELS: Record<DayToken, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

export const DAY_OPTIONS = DAY_ORDER.map((value) => ({
  value,
  label: DAY_LABELS[value],
}));

const DAY_MAP: Record<string, DayToken> = {
  mon: "Mon",
  monday: "Mon",
  tue: "Tue",
  tues: "Tue",
  tuesday: "Tue",
  wed: "Wed",
  weds: "Wed",
  wednesday: "Wed",
  thu: "Thu",
  thur: "Thu",
  thurs: "Thu",
  thursday: "Thu",
  fri: "Fri",
  friday: "Fri",
  sat: "Sat",
  saturday: "Sat",
  sun: "Sun",
  sunday: "Sun",
};

export function normalizeDayToken(day: string): DayToken | null {
  if (!day) return null;
  const trimmed = day.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  return DAY_MAP[key] ?? null;
}

export function normalizeAvailableDays(
  days: string[] | null | undefined,
  options?: { sort?: boolean },
): DayToken[] {
  if (!Array.isArray(days)) return [];
  const seen = new Set<DayToken>();
  const normalized: DayToken[] = [];

  for (const day of days) {
    const token = normalizeDayToken(day);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    normalized.push(token);
  }

  if (options?.sort) {
    normalized.sort(
      (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b),
    );
  }

  return normalized;
}

export function parseAvailableDays(
  value: string | null | undefined,
  options?: { sort?: boolean },
): DayToken[] {
  if (!value) return [];
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = value.split(",");
  }
  if (Array.isArray(parsed)) {
    return normalizeAvailableDays(parsed as string[], options);
  }
  if (typeof parsed === "string") {
    return normalizeAvailableDays([parsed], options);
  }
  return [];
}
