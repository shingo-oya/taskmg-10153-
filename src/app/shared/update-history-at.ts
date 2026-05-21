import { formatDateTimeJapan, nowUtcIso } from './japan-datetime';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `updateHistory[].at` 用タイムスタンプ（UTC ISO）。
 * 新規追記は `nowUtcIso()` を渡す想定。日付のみの既存値は JST 0:00（その日の始まり）へ正規化する。
 */
export function normalizeUpdateHistoryAt(value?: string): string {
  const t = value?.trim() ?? '';
  if (!t) {
    return nowUtcIso();
  }
  if (DATE_ONLY.test(t)) {
    return dateOnlyStartOfDayUtcIsoInJapan(t);
  }
  if (t.includes('T')) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? nowUtcIso() : d.toISOString();
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString();
  }
  return nowUtcIso();
}

/** 日本時間の暦日 YYYY-MM-DD の 0:00:00.000 を UTC ISO に（DST なし JST 固定） */
function dateOnlyStartOfDayUtcIsoInJapan(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  const jstMidnightUtcMs = Date.UTC(y, m - 1, d) - 9 * 60 * 60 * 1000;
  return new Date(jstMidnightUtcMs).toISOString();
}

/** 詳細・マイページ表示用 */
export function formatUpdateHistoryAt(at: string): string {
  const t = at.trim();
  if (!t) {
    return '—';
  }
  if (DATE_ONLY.test(t)) {
    const [y, mo, d] = t.split('-');
    return `${y}/${mo}/${d}`;
  }
  return formatDateTimeJapan(t, 'ymdhm');
}
