import type { ProjectRow } from '../components/project-list/project-row';
import { postLoginCommands } from './post-login-navigation';

function project(mn: string, members: string[]): ProjectRow {
  return {
    managementNumber: mn,
    name: mn,
    description: '',
    departments: [],
    endDate: '',
    priority: '中',
    registeredAt: '',
    workStartDate: '',
    completedAt: '',
    status: '未着手',
    participants: members.map((name) => ({
      department: '営業部',
      name,
      role: 'ゲスト',
    })),
    members,
    progressPercent: 0,
    approver: '',
    milestones: [],
    relatedIssues: [],
    resourceFolders: [],
    lastUpdatedAt: '',
    lastUpdatedBy: '',
    updateHistory: [],
  };
}

describe('postLoginCommands', () => {
  it('prioritizes dashboard.my over list.tasks', () => {
    const cmds = postLoginCommands({
      can: (p) => p === 'dashboard.my' || p === 'list.tasks',
      orgRole: 'メンバー',
      projectRows: [],
      displayName: '山田太郎',
    });
    expect(cmds).toEqual(['/dashboard/my']);
  });

  it('sends guest to first participating project', () => {
    const rows = [project('PRJ-A', ['他人']), project('PRJ-B', ['ゲスト太郎'])];
    const cmds = postLoginCommands({
      can: (p) => p === 'project.detail.view',
      orgRole: 'ゲスト',
      projectRows: rows,
      displayName: 'ゲスト太郎',
    });
    expect(cmds).toEqual(['/projects', 'PRJ-B']);
  });
});
