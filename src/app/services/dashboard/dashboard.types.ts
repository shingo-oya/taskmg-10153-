import type { ProjectRow } from '../../components/project-list/project-row';
import type { TaskRow } from '../../components/task-list/task-row';

/** 課題の期限区分（今日は近日に含めない） */
export type TaskDueBucket = 'today' | 'soon' | 'overdue';

export interface DashboardChatNotificationItem {
  /** 一覧の track 用（表示上の既読はスコープ lastReadAt で判定） */
  id: string;
  notificationKind: 'mention' | 'reply';
  kind: 'task' | 'project';
  scopeId: string;
  scopeLabel: string;
  messageId: string;
  threadRootId: string | null;
  authorName: string;
  bodyPreview: string;
  createdAtIso: string;
  routerLink: string[];
  queryParams: Record<string, string>;
  read: boolean;
}

/** @deprecated DashboardChatNotificationItem を使用 */
export type DashboardMentionItem = DashboardChatNotificationItem;

export interface DashboardUpdateItem {
  /** 既読管理用の安定 ID */
  id: string;
  kind: 'task' | 'project';
  scopeId: string;
  scopeLabel: string;
  at: string;
  by: string;
  line: string;
  routerLink: string[];
  read: boolean;
}

export interface MyDashboardSnapshot {
  displayName: string;
  today: string;
  chatNotifications: DashboardChatNotificationItem[];
  updates: DashboardUpdateItem[];
  dueToday: TaskRow[];
  dueSoon: TaskRow[];
  overdue: TaskRow[];
  myReviewPending: TaskRow[];
  approverReviewPending: TaskRow[];
}

export interface MemberLoadRow {
  memberName: string;
  openTaskCount: number;
}

export interface ProjectDashboardSnapshot {
  project: ProjectRow;
  today: string;
  progressPercent: number;
  tasks: TaskRow[];
  dueToday: TaskRow[];
  dueSoon: TaskRow[];
  overdue: TaskRow[];
  memberLoad: MemberLoadRow[];
}

export interface OrgDashboardFilters {
  /** 空文字はすべて */
  department: string;
  /** 空文字はすべて（部署フィルタ後） */
  projectManagementNumber: string;
}

export interface OrgDashboardSnapshot {
  today: string;
  filters: OrgDashboardFilters;
  delayedCount: number;
  projects: ProjectRow[];
  dueTodayProjects: ProjectRow[];
  dueSoonProjects: ProjectRow[];
  overdueProjects: ProjectRow[];
  memberLoad: MemberLoadRow[];
}
