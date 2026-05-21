/** アプリ全体の表示・「今日」判定に使うタイムゾーン */
export const APP_TIME_ZONE = 'Asia/Tokyo';

type ZonedParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

/** Firestore 等への保存用（UTC ISO のまま） */
export function nowUtcIso(): string {
  return new Date().toISOString();
}

/** 日本時間の暦日（年・月・日） */
export function calendarYmdInJapan(ref: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const p = getZonedParts(ref, APP_TIME_ZONE);
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}

/** カレンダー表示用: 日本の暦でその月1日（Date コンストラクタは暦成分のみ使用） */
export function monthAnchorDateInJapan(ref: Date = new Date()): Date {
  const { year, month } = calendarYmdInJapan(ref);
  return new Date(year, month - 1, 1);
}

/** 日本時間の今日 YYYY-MM-DD */
export function todayIsoDateInJapan(ref: Date = new Date()): string {
  return formatIsoDateInJapan(ref);
}

/** 日本時間で日付のみ YYYY-MM-DD */
export function formatIsoDateInJapan(ref: Date): string {
  const p = getZonedParts(ref, APP_TIME_ZONE);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 日本時間の年（管理番号採番など） */
export function currentYearInJapan(ref: Date = new Date()): number {
  return Number(getZonedParts(ref, APP_TIME_ZONE).year);
}

/** チャット用 M/d HH:mm（日本時間） */
export function formatChatTimeShortJapan(iso: string): string {
  return formatDateTimeJapan(iso, 'mdhm');
}

/** 日本時間の日時表示 */
export function formatDateTimeJapan(
  iso: string,
  mode: 'mdhm' | 'ymdhm' = 'ymdhm',
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso.trim();
  }
  const p = getZonedParts(d, APP_TIME_ZONE);
  if (mode === 'mdhm') {
    return `${Number(p.month)}/${Number(p.day)} ${Number(p.hour)}:${p.minute}`;
  }
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

/** 日付のみ YYYY-MM-DD に日数を加算（暦日・日本の業務日付想定） */
export function addCalendarDaysIso(isoDate: string, days: number): string {
  const parsed = parseIsoDateOnly(isoDate);
  if (!parsed) {
    return isoDate;
  }
  const [y, m, d] = parsed;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function parseIsoDateOnly(iso: string): [number, number, number] | null {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return null;
  }
  const [y, m, d] = t.split('-').map((x) => Number(x));
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return [y, m, d];
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
  };
}
