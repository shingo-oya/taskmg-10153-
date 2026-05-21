import {
  isMentionedInBody,
  projectChatMentionCandidates,
  resolveChatMentions,
} from './chat-mentions';

describe('chat-mentions', () => {
  it('resolveChatMentions picks @name from candidate list', () => {
    const mentions = resolveChatMentions('こんにちは @山田太郎 さん', ['山田太郎', '鈴木']);
    expect(mentions).toEqual([{ displayName: '山田太郎' }]);
  });

  it('isMentionedInBody supports full-width ＠', () => {
    expect(isMentionedInBody('＠山田太郎', '山田太郎')).toBe(true);
    expect(isMentionedInBody('@他人', '山田太郎')).toBe(false);
  });

  it('projectChatMentionCandidates uses participants', () => {
    const names = projectChatMentionCandidates({
      managementNumber: 'P1',
      name: 'P',
      description: '',
      departments: [],
      endDate: '2026-01-01',
      priority: '中',
      registeredAt: '2026-01-01',
      workStartDate: '',
      completedAt: '',
      status: '着手中',
      participants: [{ department: '営業', name: '山田太郎', role: 'メンバー' }],
      members: ['山田太郎'],
      progressPercent: 0,
      approver: '高橋',
      milestones: [],
      relatedIssues: [],
      resourceFolders: [],
      lastUpdatedAt: '2026-01-01',
      lastUpdatedBy: '山田太郎',
      updateHistory: [],
    });
    expect(names).toContain('山田太郎');
    expect(names).toContain('高橋');
  });
});
