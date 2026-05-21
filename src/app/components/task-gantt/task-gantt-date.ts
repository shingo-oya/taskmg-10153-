/** YYYY-MM-DD を暦日として解釈（業務日付・タイムゾーン非依存） */
export function parseIsoDateKey(key: string): Date | null {
  const t = key.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return null;
  }
  const [y, m, d] = t.split('-').map((x) => Number.parseInt(x, 10));
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    return null;
  }
  return new Date(y, m - 1, d);
}

export function toIsoDateKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysToIsoDateKey(key: string, deltaDays: number): string | null {
  const d = parseIsoDateKey(key);
  if (!d) {
    return null;
  }
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + deltaDays);
  return toIsoDateKeyFromDate(next);
}

export function daysBetweenInclusive(startKey: string, endKey: string): number {
  const a = parseIsoDateKey(startKey);
  const b = parseIsoDateKey(endKey);
  if (!a || !b) {
    return 0;
  }
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.round(ms / 86_400_000)) + 1;
}

export interface MonthSegmentStyle {
  left: number;
  width: number;
  visible: boolean;
}

/** 表示月内での left%/width%（1日単位・両端含む） */
export function monthSegmentStyle(
  startKey: string,
  endKey: string,
  year: number,
  monthIndex: number,
  daysInMonth: number,
): MonthSegmentStyle {
  const start = parseIsoDateKey(startKey);
  const end = parseIsoDateKey(endKey);
  if (!start || !end) {
    return { left: 0, width: 0, visible: false };
  }

  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex, daysInMonth);

  let segStart = start;
  let segEnd = end;
  if (segEnd < segStart) {
    segEnd = segStart;
  }

  if (segEnd < monthStart || segStart > monthEnd) {
    return { left: 0, width: 0, visible: false };
  }

  if (segStart < monthStart) {
    segStart = monthStart;
  }
  if (segEnd > monthEnd) {
    segEnd = monthEnd;
  }

  const startIdx = segStart.getDate() - 1;
  const endIdx = segEnd.getDate() - 1;
  const span = endIdx - startIdx + 1;

  return {
    left: (startIdx / daysInMonth) * 100,
    width: (span / daysInMonth) * 100,
    visible: span > 0,
  };
}

/** 単日マーカー（幅は1日分） */
export function monthDayMarkerStyle(
  dateKey: string,
  year: number,
  monthIndex: number,
  daysInMonth: number,
): MonthSegmentStyle {
  return monthSegmentStyle(dateKey, dateKey, year, monthIndex, daysInMonth);
}
