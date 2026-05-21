import type { UrlTree } from '@angular/router';
import { Router } from '@angular/router';

import type { ProjectRow } from '../components/project-list/project-row';
import { projectMemberNames } from '../components/project-list/project-row';
import type { OrgRole } from '../services/permission/org-role.types';
import type { Permission } from '../services/permission/permission.types';

export interface PostLoginNavigationInput {
  can: (permission: Permission) => boolean;
  orgRole: OrgRole | null;
  projectRows: ProjectRow[];
  displayName: string;
}

/** ゲストが最後に開いたプロジェクト（設定画面から戻る用） */
export const GUEST_LAST_PROJECT_MN_KEY = 'taskmg-guest-last-project';

/** `:managementNumber` と衝突するパスセグメント */
const RESERVED_PROJECT_SEGMENTS = new Set([
  'list',
  'calendar',
  'register',
  'gantt',
  'kanban',
  'add',
]);

export function rememberGuestProject(managementNumber: string): void {
  const mn = managementNumber.trim();
  if (!mn || typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.setItem(GUEST_LAST_PROJECT_MN_KEY, mn);
}

/** ゲスト向けプロジェクト詳細へのルート（一覧権限がない場合のみ） */
export function guestProjectCommands(input: PostLoginNavigationInput): string[] | null {
  if (!input.can('project.detail.view') || input.can('list.projects')) {
    return null;
  }
  const lastMn =
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem(GUEST_LAST_PROJECT_MN_KEY)?.trim()
      : '';
  if (lastMn && !RESERVED_PROJECT_SEGMENTS.has(lastMn)) {
    return ['/projects', lastMn];
  }
  const first = firstProjectForPostLogin(input.projectRows, input.orgRole, input.displayName);
  return first ? ['/projects', first.managementNumber] : null;
}

/** ログイン後の `router.navigate` 用コマンド */
export function postLoginCommands(input: PostLoginNavigationInput): string[] {
  if (input.can('dashboard.my')) {
    return ['/dashboard/my'];
  }
  if (input.can('list.tasks')) {
    return ['/tasks/list'];
  }
  const guestProject = guestProjectCommands(input);
  if (guestProject) {
    return guestProject;
  }
  if (input.can('settings.profile')) {
    return ['/settings/profile'];
  }
  return ['/login'];
}

/** 権限不足時の `UrlTree` */
export function buildPostLoginUrlTree(
  input: PostLoginNavigationInput,
  router: Router,
): UrlTree {
  const commands = postLoginCommands(input);
  if (commands.length === 1 && commands[0] === '/login') {
    return router.createUrlTree(['/login']);
  }
  return router.createUrlTree(commands);
}

function firstProjectForPostLogin(
  rows: ProjectRow[],
  orgRole: OrgRole | null,
  displayName: string,
): ProjectRow | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  if (orgRole !== 'ゲスト' || !displayName.trim()) {
    return rows[0];
  }
  const name = displayName.trim();
  return rows.find((p) => projectMemberNames(p).includes(name));
}
