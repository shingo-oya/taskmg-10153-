import {
  formatProjectUpdateLogLine,
  type ProjectRow,
} from '../../components/project-list/project-row';
import {
  tasksBelongingToProject,
  tasksForProject,
} from '../../shared/task-hierarchy';
import { dashboardUpdateItemId } from '../../shared/update-log-id';
import { calculateDisplayedProjectProgress } from '../../components/project-list/project-display-progress';
import {
  formatTaskUpdateLogLine,
  taskMemberNames,
  type TaskRow,
  type TaskRowStatus,
} from '../../components/task-list/task-row';
import {
  addCalendarDaysIso,
  parseIsoDateOnly,
  todayIsoDateInJapan,
} from '../../shared/japan-datetime';

export function todayIsoDate(ref: Date = new Date()): string {
  return todayIsoDateInJapan(ref);
}

export function addCalendarDays(isoDate: string, days: number): string {
  return addCalendarDaysIso(isoDate, days);
}

export function parseIsoDate(iso: string): Date | null {
  const parts = parseIsoDateOnly(iso);
  if (!parts) {
    return null;
  }
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

export function daysBetweenInclusiveStart(isoStart: string, isoEnd: string): number {
  const a = parseIsoDate(isoStart);
  const b = parseIsoDate(isoEnd);
  if (!a || !b) {
    return 0;
  }
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86_400_000);
}

export function isTaskOpen(task: TaskRow): boolean {
  return task.status !== '完了';
}

export function isUserTaskAssignee(task: TaskRow, displayName: string): boolean {
  const me = displayName.trim();
  if (!me) {
    return false;
  }
  return taskMemberNames(task).includes(me);
}

export function isProjectOpen(project: ProjectRow): boolean {
  return project.status !== '完了';
}

export function filterProjectsDue(
  projects: readonly ProjectRow[],
  today: string,
  bucket: 'today' | 'soon' | 'overdue',
): ProjectRow[] {
  return projects
    .filter((p) => isProjectOpen(p))
    .filter((p) => classifyTaskDueBucket(p.endDate, today) === bucket)
    .sort(
      (a, b) =>
        a.endDate.localeCompare(b.endDate, 'ja') ||
        a.managementNumber.localeCompare(b.managementNumber, 'ja'),
    );
}

export function filterProjectsForOrg(
  projects: readonly ProjectRow[],
  filters: { department: string; projectManagementNumber: string },
): ProjectRow[] {
  const dept = filters.department.trim();
  const pmn = filters.projectManagementNumber.trim();
  return projects
    .filter((p) => {
      if (dept && !p.departments.some((d) => d.trim() === dept)) {
        return false;
      }
      if (pmn && p.managementNumber.trim() !== pmn) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.managementNumber.localeCompare(b.managementNumber, 'ja'));
}

export function countDelayedProjects(
  projects: readonly ProjectRow[],
  allTasks: readonly TaskRow[],
  today: string,
): number {
  return projects.filter((p) => isProjectDelayed(p, allTasks, today)).length;
}

export interface MemberLoadBuildOptions {
  /** 指定時は UsersRow.department が一致する担当者のみ集計（③の部署フィルタ用） */
  memberDepartment?: string;
  nameToDepartment?: ReadonlyMap<string, string>;
}

/** 未完了課題を担当者ごとに件数集計 */
export function buildMemberLoadFromTasks(
  tasks: readonly TaskRow[],
  options?: MemberLoadBuildOptions,
): import('./dashboard.types').MemberLoadRow[] {
  const deptFilter = options?.memberDepartment?.trim() ?? '';
  const nameToDept = options?.nameToDepartment;
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (!isTaskOpen(t)) {
      continue;
    }
    for (const name of taskMemberNames(t)) {
      const n = name.trim();
      if (!n) {
        continue;
      }
      if (deptFilter && nameToDept) {
        if (nameToDept.get(n) !== deptFilter) {
          continue;
        }
      }
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([memberName, openTaskCount]) => ({ memberName, openTaskCount }))
    .sort(
      (a, b) =>
        b.openTaskCount - a.openTaskCount ||
        a.memberName.localeCompare(b.memberName, 'ja'),
    );
}

export function filterProjectTasksDue(
  tasks: readonly TaskRow[],
  projectManagementNumber: string,
  today: string,
  bucket: 'today' | 'soon' | 'overdue',
): TaskRow[] {
  return tasksBelongingToProject([...tasks], projectManagementNumber)
    .filter((t) => isTaskOpen(t) && classifyTaskDueBucket(t.endDate, today) === bucket)
    .sort(
      (a, b) =>
        a.endDate.localeCompare(b.endDate, 'ja') ||
        a.managementNo.localeCompare(b.managementNo, 'ja'),
    );
}

export function sortProjectTasks(tasks: readonly TaskRow[]): TaskRow[] {
  return [...tasks].sort(
    (a, b) =>
      a.managementNo.localeCompare(b.managementNo, 'ja') ||
      a.endDate.localeCompare(b.endDate, 'ja'),
  );
}

export function isUserProjectMember(project: ProjectRow, displayName: string): boolean {
  const me = displayName.trim();
  if (!me) {
    return false;
  }
  return project.participants.some((p) => p.name.trim() === me);
}

/** 今日 / 近日7日（今日除く） / 期限切れ。対象外は null */
export function classifyTaskDueBucket(
  endDate: string,
  today: string,
  soonDays = 7,
): 'today' | 'soon' | 'overdue' | null {
  const e = endDate.trim();
  if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    return null;
  }
  if (e < today) {
    return 'overdue';
  }
  if (e === today) {
    return 'today';
  }
  const soonEnd = addCalendarDays(today, soonDays);
  if (e > today && e <= soonEnd) {
    return 'soon';
  }
  return null;
}

export function filterMyTasksDue(
  tasks: readonly TaskRow[],
  displayName: string,
  today: string,
  bucket: 'today' | 'soon' | 'overdue',
): TaskRow[] {
  return tasks
    .filter((t) => isUserTaskAssignee(t, displayName) && isTaskOpen(t))
    .filter((t) => classifyTaskDueBucket(t.endDate, today) === bucket)
    .sort((a, b) => a.endDate.localeCompare(b.endDate, 'ja') || a.managementNo.localeCompare(b.managementNo, 'ja'));
}

/** 自分が担当かつ確認待ち */
export function filterMyReviewPendingAsAssignee(tasks: readonly TaskRow[], displayName: string): TaskRow[] {
  return tasks
    .filter(
      (t) => isUserTaskAssignee(t, displayName) && (t.status as TaskRowStatus) === '確認待ち',
    )
    .sort((a, b) => a.endDate.localeCompare(b.endDate, 'ja'));
}

/** 自分が承認者かつ確認待ち */
export function filterApproverReviewPending(tasks: readonly TaskRow[], displayName: string): TaskRow[] {
  const me = displayName.trim();
  if (!me) {
    return [];
  }
  return tasks
    .filter((t) => t.approver.trim() === me && (t.status as TaskRowStatus) === '確認待ち')
    .sort((a, b) => a.endDate.localeCompare(b.endDate, 'ja'));
}

/**
 * ③向け: 進捗の割合 ＜ 過ぎた日数の割合 → 遅延
 */
export function isProjectDelayed(
  project: ProjectRow,
  allTasks: readonly TaskRow[],
  today: string,
): boolean {
  if (project.status === '完了') {
    return false;
  }
  const start = (project.workStartDate || project.registeredAt).trim();
  const end = project.endDate.trim();
  if (!parseIsoDate(start) || !parseIsoDate(end)) {
    return false;
  }
  const totalDays = Math.max(1, daysBetweenInclusiveStart(start, end));
  const elapsedDays = Math.min(
    Math.max(0, daysBetweenInclusiveStart(start, today)),
    totalDays,
  );
  const elapsedRatio = elapsedDays / totalDays;
  const progressRatio = calculateDisplayedProjectProgress(project, [...allTasks]) / 100;
  return progressRatio < elapsedRatio;
}

export function buildTaskUpdateItems(
  tasks: readonly TaskRow[],
  displayName: string,
): import('./dashboard.types').DashboardUpdateItem[] {
  const items: import('./dashboard.types').DashboardUpdateItem[] = [];
  for (const t of tasks) {
    if (!isUserTaskAssignee(t, displayName)) {
      continue;
    }
    const history = t.updateHistory ?? [];
    for (const entry of history) {
      const line = formatTaskUpdateLogLine(entry).trim() || entry.summary?.trim() || '更新がありました';
      items.push({
        id: dashboardUpdateItemId('task', t.managementNo, entry),
        kind: 'task',
        scopeId: t.managementNo,
        scopeLabel: t.taskname,
        at: entry.at,
        by: entry.by,
        line,
        routerLink: ['/tasks', t.managementNo],
        read: false,
      });
    }
  }
  return sortUpdates(items);
}

export function buildProjectUpdateItems(
  projects: readonly ProjectRow[],
  displayName: string,
): import('./dashboard.types').DashboardUpdateItem[] {
  const items: import('./dashboard.types').DashboardUpdateItem[] = [];
  for (const p of projects) {
    if (!isUserProjectMember(p, displayName)) {
      continue;
    }
    const history = p.updateHistory ?? [];
    for (const entry of history) {
      const line =
        formatProjectUpdateLogLine(entry).trim() || entry.summary?.trim() || '更新がありました';
      items.push({
        id: dashboardUpdateItemId('project', p.managementNumber, entry),
        kind: 'project',
        scopeId: p.managementNumber,
        scopeLabel: p.name,
        at: entry.at,
        by: entry.by,
        line,
        routerLink: ['/projects', p.managementNumber],
        read: false,
      });
    }
  }
  return sortUpdates(items);
}

function sortUpdates(items: import('./dashboard.types').DashboardUpdateItem[]): import('./dashboard.types').DashboardUpdateItem[] {
  return [...items].sort((a, b) => {
    const d = b.at.localeCompare(a.at, 'ja');
    if (d !== 0) {
      return d;
    }
    return a.scopeLabel.localeCompare(b.scopeLabel, 'ja');
  });
}
