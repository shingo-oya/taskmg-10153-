import { parseIsoDateKey } from '../components/task-gantt/task-gantt-date';
import { isJapanesePublicHoliday } from './japanese-public-holidays';

/** カレンダー・ガントの日付セル配色 */
export type CalendarDayTone = 'weekday' | 'sat' | 'sun' | 'holiday';

export function calendarDayTone(dateKey: string): CalendarDayTone {
  const key = dateKey.trim();
  if (!key) {
    return 'weekday';
  }
  if (isJapanesePublicHoliday(key)) {
    return 'holiday';
  }
  const d = parseIsoDateKey(key);
  if (!d) {
    return 'weekday';
  }
  const dow = d.getDay();
  if (dow === 0) {
    return 'sun';
  }
  if (dow === 6) {
    return 'sat';
  }
  return 'weekday';
}

export function isCalendarSunTone(tone: CalendarDayTone): boolean {
  return tone === 'sun' || tone === 'holiday';
}

export function isCalendarSatTone(tone: CalendarDayTone): boolean {
  return tone === 'sat';
}
