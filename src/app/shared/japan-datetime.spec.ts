import {
  formatChatTimeShortJapan,
  formatDateTimeJapan,
  monthAnchorDateInJapan,
  todayIsoDateInJapan,
} from './japan-datetime';

describe('japan-datetime', () => {
  it('formatChatTimeShortJapan uses Asia/Tokyo', () => {
    // 2026-05-09 15:30 UTC = 2026-05-10 00:30 JST
    expect(formatChatTimeShortJapan('2026-05-09T15:30:00.000Z')).toBe('5/10 0:30');
  });

  it('formatDateTimeJapan uses Asia/Tokyo', () => {
    expect(formatDateTimeJapan('2026-05-09T15:30:00.000Z', 'ymdhm')).toBe('2026/05/10 00:30');
  });

  it('todayIsoDateInJapan uses Asia/Tokyo calendar date', () => {
    const ref = new Date('2026-05-09T15:30:00.000Z');
    expect(todayIsoDateInJapan(ref)).toBe('2026-05-10');
  });

  it('monthAnchorDateInJapan uses Asia/Tokyo month', () => {
    const ref = new Date('2026-05-09T15:30:00.000Z');
    const anchor = monthAnchorDateInJapan(ref);
    expect(anchor.getFullYear()).toBe(2026);
    expect(anchor.getMonth()).toBe(4);
    expect(anchor.getDate()).toBe(1);
  });
});
