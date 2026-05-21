import { isJapanesePublicHoliday } from './japanese-public-holidays';
import { calendarDayTone } from './calendar-day-style';

describe('japanese-public-holidays', () => {
  it('treats Constitution Memorial Day as holiday', () => {
    expect(isJapanesePublicHoliday('2026-05-03')).toBe(true);
    expect(calendarDayTone('2026-05-03')).toBe('holiday');
  });

  it('colors Saturday blue and Sunday red when not holiday', () => {
    expect(calendarDayTone('2026-05-09')).toBe('sat');
    expect(calendarDayTone('2026-05-10')).toBe('sun');
  });
});
