import type { OrgRole } from './org-role.types';

/** アプリ内の操作・画面アクセス単位 */
export type Permission =
  | 'chat.use'
  | 'project.detail.view'
  | 'list.projects'
  | 'list.tasks'
  | 'task.write'
  | 'file.write'
  | 'dashboard.my'
  | 'settings.profile'
  | 'settings.notifications'
  | 'settings.templates'
  | 'settings.issueTypes'
  | 'project.manage'
  | 'dashboard.project'
  | 'dashboard.org'
  | 'archive.restore'
  | 'trash.manage'
  | 'settings.users'
  | 'settings.auditHistory';

/** 各権限に必要な最低組織ロール */
export const PERMISSION_MIN_ROLE: Record<Permission, OrgRole> = {
  'chat.use': 'ゲスト',
  'project.detail.view': 'ゲスト',
  'list.projects': 'メンバー',
  'list.tasks': 'メンバー',
  'task.write': 'メンバー',
  'file.write': 'メンバー',
  'dashboard.my': 'メンバー',
  'settings.profile': 'ゲスト',
  'settings.notifications': 'ゲスト',
  'settings.templates': 'メンバー',
  'settings.issueTypes': 'メンバー',
  'project.manage': 'プロジェクト管理者',
  'dashboard.project': 'プロジェクト管理者',
  'dashboard.org': '管理者',
  'archive.restore': 'メンバー',
  'trash.manage': '管理者',
  'settings.users': 'マスター',
  'settings.auditHistory': 'マスター',
};
