import {
  isChatMessageUnreadInDetail,
  threadHasUnreadInDetail,
} from './chat-detail-read-ui';

describe('chat-detail-read-ui', () => {
  const lastRead = '2026-05-10T10:00:00.000Z';

  it('marks message after lastReadAt as unread', () => {
    expect(
      isChatMessageUnreadInDetail('2026-05-10T11:00:00.000Z', lastRead, new Set(), 'root'),
    ).toBe(true);
  });

  it('clears unread when thread is acked', () => {
    expect(
      isChatMessageUnreadInDetail(
        '2026-05-10T11:00:00.000Z',
        lastRead,
        new Set(['root']),
        'root',
      ),
    ).toBe(false);
  });

  it('treats all as unread when lastReadAt is missing', () => {
    expect(
      isChatMessageUnreadInDetail('2026-05-09T09:00:00.000Z', undefined, new Set(), 'root'),
    ).toBe(true);
  });

  it('threadHasUnread when a reply is newer than lastReadAt', () => {
    const root = { id: 'root', createdAtIso: '2026-05-09T10:00:00.000Z' };
    const replies = [{ createdAtIso: '2026-05-10T11:00:00.000Z' }];
    expect(threadHasUnreadInDetail(root, replies, lastRead, new Set())).toBe(true);
  });
});
