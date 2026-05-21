import { classifyChatNotification, type ChatMessageForNotification } from '../dashboard/dashboard-chat-query';

describe('chat push classification', () => {
  it('detects mention for named user', () => {
    const msg: ChatMessageForNotification = {
      id: 'm2',
      threadId: null,
      parentId: null,
      authorName: '佐藤花子',
      authorUserId: 'uid-sato',
      mentions: [{ displayName: '山田太郎' }],
      bodyPlain: '@山田太郎 確認',
      createdAtIso: '2026-01-02T00:00:00.000Z',
    };
    expect(classifyChatNotification(msg, '山田太郎', 'uid-yamada', new Map())).toBe(
      'mention',
    );
  });

  it('detects reply to thread root author', () => {
    const root: ChatMessageForNotification = {
      id: 'r1',
      threadId: null,
      parentId: null,
      authorName: '山田太郎',
      authorUserId: 'uid-yamada',
      mentions: [],
      bodyPlain: 'root',
      createdAtIso: '2026-01-01T00:00:00.000Z',
    };
    const reply: ChatMessageForNotification = {
      id: 'm2',
      threadId: 'r1',
      parentId: 'r1',
      authorName: '佐藤花子',
      authorUserId: 'uid-sato',
      mentions: [],
      bodyPlain: 'reply',
      createdAtIso: '2026-01-02T00:00:00.000Z',
    };
    const byId = new Map([
      [root.id, root],
      [reply.id, reply],
    ]);
    expect(classifyChatNotification(reply, '山田太郎', 'uid-yamada', byId)).toBe('reply');
  });

  it('detects reply in thread where user was mentioned earlier', () => {
    const root: ChatMessageForNotification = {
      id: 'r1',
      threadId: null,
      parentId: null,
      authorName: '佐藤花子',
      authorUserId: 'uid-sato',
      mentions: [{ displayName: '山田太郎' }],
      bodyPlain: '@山田太郎 確認ください',
      createdAtIso: '2026-01-01T00:00:00.000Z',
    };
    const reply: ChatMessageForNotification = {
      id: 'm2',
      threadId: 'r1',
      parentId: 'r1',
      authorName: '鈴木一郎',
      authorUserId: 'uid-suzuki',
      mentions: [],
      bodyPlain: '対応します',
      createdAtIso: '2026-01-02T00:00:00.000Z',
    };
    const byId = new Map([
      [root.id, root],
      [reply.id, reply],
    ]);
    expect(classifyChatNotification(reply, '山田太郎', 'uid-yamada', byId)).toBe('reply');
  });
});
