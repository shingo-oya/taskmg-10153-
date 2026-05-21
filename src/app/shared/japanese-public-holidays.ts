import { parseIsoDateKey, toIsoDateKeyFromDate } from '../components/task-gantt/task-gantt-date';

const holidayCache = new Map<number, Set<string>>();

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  nth: number,
): number | null {
  let count = 0;
  const last = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const dt = new Date(year, monthIndex, d);
    if (dt.getDay() === weekday) {
      count++;
      if (count === nth) {
        return d;
      }
    }
  }
  return null;
}

function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function addSubstituteHolidays(keys: Set<string>, year: number): void {
  const sorted = [...keys].filter((k) => k.startsWith(`${year}-`)).sort();
  for (const key of sorted) {
    const d = parseIsoDateKey(key);
    if (!d || d.getDay() !== 0) {
      continue;
    }
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const nextKey = toIsoDateKeyFromDate(next);
    if (!keys.has(nextKey)) {
      keys.add(nextKey);
    }
  }
}

function addCitizensHoliday(keys: Set<string>, year: number): void {
  const sorted = [...keys].filter((k) => k.startsWith(`${year}-`)).sort();
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = parseIsoDateKey(sorted[i]);
    const b = parseIsoDateKey(sorted[i + 1]);
    if (!a || !b) {
      continue;
    }
    const gap = (b.getTime() - a.getTime()) / 86_400_000;
    if (gap === 2) {
      const between = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1);
      keys.add(toIsoDateKeyFromDate(between));
    }
  }
}

function buildHolidaysForYear(year: number): Set<string> {
  const keys = new Set<string>();
  const add = (monthIndex: number, day: number): void => {
    keys.add(dateKey(year, monthIndex, day));
  };

  add(0, 1);
  add(1, 11);
  add(1, 23);
  add(3, vernalEquinoxDay(year));
  add(3, 29);
  add(4, 3);
  add(4, 4);
  add(4, 5);
  add(7, 11);
  add(8, autumnalEquinoxDay(year));
  add(10, 3);
  add(10, 23);

  const happyMondays: [number, number, number][] = [
    [0, 1, 2],
    [6, 1, 3],
    [8, 1, 3],
    [9, 1, 2],
  ];
  for (const [monthIndex, weekday, nth] of happyMondays) {
    const day = nthWeekdayOfMonth(year, monthIndex, weekday, nth);
    if (day !== null) {
      add(monthIndex, day);
    }
  }

  addSubstituteHolidays(keys, year);
  addCitizensHoliday(keys, year);
  addSubstituteHolidays(keys, year);

  return keys;
}

export function japanesePublicHolidaysForYear(year: number): ReadonlySet<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = buildHolidaysForYear(year);
    holidayCache.set(year, set);
  }
  return set;
}

export function isJapanesePublicHoliday(dateKey: string): boolean {
  const d = parseIsoDateKey(dateKey);
  if (!d) {
    return false;
  }
  return japanesePublicHolidaysForYear(d.getFullYear()).has(dateKey.trim());
}
