import { maxCreatedAtIso } from './chat-read-cursor.types';

describe('chat-read-cursor', () => {
  it('maxCreatedAtIso picks latest ISO string', () => {
    expect(
      maxCreatedAtIso([
        { createdAtIso: '2026-05-01T10:00:00.000Z' },
        { createdAtIso: '2026-05-02T09:00:00.000Z' },
        { createdAtIso: '2026-05-02T15:00:00.000Z' },
      ]),
    ).toBe('2026-05-02T15:00:00.000Z');
  });
});
