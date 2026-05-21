import {
  buildChatNotificationItem,
  classifyChatNotification,
  type ChatMessageForNotification,
} from './dashboard-chat-query';

describe('dashboard-chat-query', () => {
  const me = '山田太郎';
  const meId = 'yamada@example.com';

  function msg(
    partial: Partial<ChatMessageForNotification> & Pick<ChatMessageForNotification, 'id'>,
  ): ChatMessageForNotification {
    return {
      threadId: null,
      parentId: null,
      authorName: '佐藤花子',
      mentions: [],
      bodyPlain: 'test',
      createdAtIso: '2026-05-10T10:00:00.000Z',
      ...partial,
    };
  }

  it('classifies @mention on root message', () => {
    const root = msg({
      id: 'r1',
      bodyPlain: '@山田太郎 確認ください',
      mentions: [{ displayName: '山田太郎' }],
    });
    const byId = new Map([[root.id, root]]);
    expect(classifyChatNotification(root, me, meId, byId)).toBe('mention');
  });

  it('classifies reply in thread where I was mentioned on root', () => {
    const root = msg({
      id: 'root',
      authorName: '佐藤花子',
      bodyPlain: '@山田太郎 確認ください',
      mentions: [{ displayName: '山田太郎' }],
    });
    const reply = msg({
      id: 'reply',
      threadId: 'root',
      parentId: 'root',
      authorName: '鈴木一郎',
      bodyPlain: '対応します',
    });
    const byId = new Map([
      [root.id, root],
      [reply.id, reply],
    ]);
    expect(classifyChatNotification(reply, me, meId, byId)).toBe('reply');
  });

  it('classifies reply in thread where I was mentioned in earlier reply', () => {
    const root = msg({
      id: 'root',
      authorName: '佐藤花子',
      bodyPlain: '質問です',
    });
    const mid = msg({
      id: 'mid',
      threadId: 'root',
      parentId: 'root',
      authorName: '佐藤花子',
      bodyPlain: '@山田太郎 こちらも見てください',
      mentions: [{ displayName: '山田太郎' }],
    });
    const later = msg({
      id: 'later',
      threadId: 'root',
      parentId: 'mid',
      authorName: '鈴木一郎',
      bodyPlain: '承知しました',
    });
    const byId = new Map([
      [root.id, root],
      [mid.id, mid],
      [later.id, later],
    ]);
    expect(classifyChatNotification(later, me, meId, byId)).toBe('reply');
  });

  it('does not notify non-mentioned user on thread activity', () => {
    const root = msg({
      id: 'root',
      authorName: '佐藤花子',
      bodyPlain: '@山田太郎 確認ください',
      mentions: [{ displayName: '山田太郎' }],
    });
    const reply = msg({
      id: 'reply',
      threadId: 'root',
      parentId: 'root',
      authorName: '鈴木一郎',
      bodyPlain: '補足です',
    });
    const byId = new Map([
      [root.id, root],
      [reply.id, reply],
    ]);
    expect(classifyChatNotification(reply, '鈴木一郎', 'uid-suzuki', byId)).toBeNull();
  });

  it('classifies reply to my thread root', () => {
    const root = msg({
      id: 'root',
      authorName: '山田太郎',
      authorUserId: meId,
      bodyPlain: '質問です',
    });
    const reply = msg({
      id: 'reply',
      threadId: 'root',
      parentId: 'root',
      authorName: '佐藤花子',
      bodyPlain: '返信です',
    });
    const byId = new Map([
      [root.id, root],
      [reply.id, reply],
    ]);
    expect(classifyChatNotification(reply, me, meId, byId)).toBe('reply');
  });

  it('ignores own messages', () => {
    const own = msg({
      id: 'own',
      authorName: me,
      authorUserId: meId,
      mentions: [{ displayName: me }],
    });
    const byId = new Map([[own.id, own]]);
    expect(classifyChatNotification(own, me, meId, byId)).toBeNull();
  });

  it('buildChatNotificationItem includes query params for thread', () => {
    const reply = msg({
      id: 'reply',
      threadId: 'root',
      parentId: 'root',
    });
    const item = buildChatNotificationItem('task', 'TK-1', '課題A', reply, 'reply');
    expect(item.queryParams).toEqual({
      chatMsg: 'reply',
      chatThread: 'root',
      chatFrom: 'dashboard',
    });
    expect(item.id).toBe('chat:task:reply');
  });
});
