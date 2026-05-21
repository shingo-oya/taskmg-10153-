import { formatUpdateHistoryAt, normalizeUpdateHistoryAt } from './update-history-at';

describe('update-history-at', () => {
  it('normalizeUpdateHistoryAt uses now for empty', () => {
    const before = Date.now();
    const iso = normalizeUpdateHistoryAt();
    const after = Date.now();
    const ms = new Date(iso).getTime();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after + 50);
  });

  it('normalizeUpdateHistoryAt converts date-only to start of JST day UTC', () => {
    expect(normalizeUpdateHistoryAt('2026-05-20')).toBe('2026-05-19T15:00:00.000Z');
  });

  it('date-only history on same calendar day is not after midday lastRead', () => {
    const historyAt = normalizeUpdateHistoryAt('2026-05-20');
    const lastRead = '2026-05-20T03:00:00.000Z';
    expect(historyAt.localeCompare(lastRead, 'en')).toBeLessThanOrEqual(0);
  });

  it('normalizeUpdateHistoryAt preserves ISO input', () => {
    const inIso = '2026-05-10T11:00:00.000Z';
    expect(normalizeUpdateHistoryAt(inIso)).toBe(inIso);
  });

  it('formatUpdateHistoryAt formats ISO and date-only', () => {
    expect(formatUpdateHistoryAt('2026-05-01')).toBe('2026/05/01');
    expect(formatUpdateHistoryAt('2026-05-10T11:00:00.000Z')).toContain('2026');
  });
});
