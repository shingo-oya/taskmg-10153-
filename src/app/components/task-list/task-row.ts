import type { ProjectResourceFolder } from '../project-list/project-row';

export type TaskRowStatus = '未着手' | '着手中' | '確認待ち' | '完了' | '保留';

export type PriorityStatus = '急' | '高' | '中' | '低';

/** フィルタ候補に常に含める種別 */
export const TASK_TYPE_OPTIONS = ['課題', 'バグ', '改善'] as const;

export const TASK_STATUS_OPTIONS: TaskRowStatus[] = ['未着手', '着手中', '確認待ち', '完了', '保留'];

export const PRIORITY_OPTIONS: PriorityStatus[] = ['急', '高', '中', '低'];

/** 課題ステータスに応じた進捗率（完了100・確認待ち90・着手中0〜89・未着手/保留0） */
export function taskProgressPercentForStatus(status: TaskRowStatus, rawPercent: number): number {
  const n = Math.round(Number(rawPercent));
  switch (status) {
    case '完了':
      return 100;
    case '確認待ち':
      return 90;
    case '着手中':
      return Math.min(89, Math.max(0, n));
    case '未着手':
    case '保留':
      return 0;
  }
}

export interface TaskParticipant {
  department: string;
  name: string;
  /** 未設定時は詳細画面では「メンバー」として表示 */
  role?: string;
}

export type TaskUpdateLogChange = { kind: 'field'; fieldLabel: string; newValue: string };

export interface TaskUpdateLog {
  /** 既読管理・履歴識別用（新規追記時に付与） */
  logId?: string;
  at: string;
  by: string;
  summary?: string;
  changes?: TaskUpdateLogChange[];
}

/** 更新情報パネル用の1行文言（プロジェクト詳細と同様の表現） */
export function formatTaskUpdateLogLine(entry: TaskUpdateLog): string {
  if (!entry.changes?.length) {
    return entry.summary ?? '';
  }
  const segments: string[] = [];
  let fieldLabels: string[] = [];

  const flushFields = (): void => {
    if (fieldLabels.length === 0) {
      return;
    }
    if (fieldLabels.length === 1) {
      segments.push(`「${fieldLabels[0]}」を変更しました。`);
    } else {
      segments.push(`${fieldLabels.map((l) => `「${l}」`).join('、')}を変更しました。`);
    }
    fieldLabels = [];
  };

  for (const c of entry.changes) {
    if (c.kind === 'field') {
      fieldLabels.push(c.fieldLabel);
    }
  }
  flushFields();
  return segments.join('');
}

/** 課題一覧・登録で共有する行データ */
export interface TaskRow {
  managementNumber: string;
  name: string;
  type: string;
  managementNo: string;
  taskname: string;
  taskContent: string;
  creator: string;
  departments: string[];
  members: string;
  endDate: string;
  priority: PriorityStatus;
  status: TaskRowStatus;
  registeredOn: string;
  startedOn: string;
  completedOn: string;
  approver: string;
  progressPercent: number;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  participants: TaskParticipant[];
  /** 資料用フォルダ（プロジェクト詳細と同一仕様） */
  resourceFolders: ProjectResourceFolder[];
  /** 更新履歴（新しい順） */
  updateHistory: TaskUpdateLog[];
  /** 親課題の managementNo（子課題のみ。親・孫なし） */
  parentTaskManagementNo?: string;
}

export function taskMemberNames(row: TaskRow): string[] {
  if (row.participants.length > 0) {
    return [...new Set(row.participants.map((p) => p.name))];
  }
  return row.members
    .split(/[、,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface TaskMultiFilterCriteria {
  types: ReadonlySet<string>;
  departments: ReadonlySet<string>;
  members: ReadonlySet<string>;
  endDateFrom: string;
  endDateTo: string;
  priorities: ReadonlySet<string>;
  statuses: ReadonlySet<string>;
}
