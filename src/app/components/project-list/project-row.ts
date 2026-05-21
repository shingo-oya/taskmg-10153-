export type ProjectMemberRole = '責任者' | 'PM' | 'メンバー' | 'ゲスト';

export const PROJECT_MEMBER_ROLES: readonly ProjectMemberRole[] = [
  '責任者',
  'PM',
  'メンバー',
  'ゲスト',
] as const;

export const PROJECT_PRIORITY_OPTIONS = ['急', '高', '中', '低'] as const;

export const PROJECT_STATUS_OPTIONS = [
  '未着手',
  '着手中',
  '確認待ち',
  '完了',
  '保留',
] as const;

export interface ProjectParticipant {
  /** 選択した担当部署のいずれか */
  department: string;
  name: string;
  role: ProjectMemberRole;
}

export interface ProjectMilestone {
  title: string;
  /** YYYY-MM-DD（任意） */
  targetDate?: string;
}

/** フォルダ内のリンクまたはファイル参照 */
export interface ProjectResourceEntry {
  id: string;
  kind: 'url' | 'file';
  /** 表示名 */
  title: string;
  /** リンク先（file のときは空でも可） */
  href: string;
}

/** ファイル・URL をまとめるフォルダ */
export interface ProjectResourceFolder {
  id: string;
  name: string;
  entries: ProjectResourceEntry[];
}

/** プロジェクトに関連する課題（親課題のみ登録） */
export interface ProjectRelatedIssue {
  /** 課題管理番号（TaskRow.managementNo） */
  taskManagementNo: string;
  /** 課題名 */
  name: string;
}

/** 更新ログ用の1件分の変更（画面では1行にまとめて表示） */
export type ProjectUpdateLogChange =
  | { kind: 'field'; fieldLabel: string; newValue: string }
  | { kind: 'milestone_date'; milestoneTitle: string; newDate: string };

/** プロジェクト更新履歴（新しい順に並べる想定） */
export interface ProjectUpdateLog {
  /** 既読管理・履歴識別用（新規追記時に付与） */
  logId?: string;
  /** YYYY-MM-DD */
  at: string;
  by: string;
  /** 自由文（新規登録など） */
  summary?: string;
  /** 構造化された変更（まとめ1行表示） */
  changes?: ProjectUpdateLogChange[];
}

/** 更新情報パネル用の1行文言 */
export function formatProjectUpdateLogLine(entry: ProjectUpdateLog): string {
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
    } else {
      flushFields();
      segments.push(`「${c.milestoneTitle}」の予定日を変更しました。`);
    }
  }
  flushFields();
  return segments.join('');
}

export interface ProjectRow {
  managementNumber: string;
  name: string;
  /** プロジェクト内容 */
  description: string;
  /** 担当部署（複数） */
  departments: string[];
  /** YYYY-MM-DD */
  endDate: string;
  priority: string;
  /** 登録日 YYYY-MM-DD */
  registeredAt: string;
  /** 着手開始日（任意） */
  workStartDate: string;
  /** 完了日（任意） */
  completedAt: string;
  status: string;
  participants: ProjectParticipant[];
  /** フィルタ用（参加メンバー名。participants と同期） */
  members: string[];
  progressPercent: number;
  approver: string;
  milestones: ProjectMilestone[];
  relatedIssues: ProjectRelatedIssue[];
  /** 資料用フォルダ（URL・ファイル名の参照） */
  resourceFolders: ProjectResourceFolder[];
  /** YYYY-MM-DD */
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  /** 更新内容・日付・更新者の履歴（新しい順） */
  updateHistory: ProjectUpdateLog[];
}

/** フィルタ・表示用の参加メンバー名 */
export function projectMemberNames(row: ProjectRow): string[] {
  if (row.participants.length > 0) {
    return [...new Set(row.participants.map((p) => p.name))];
  }
  return [...row.members];
}

/** 部署・メンバー・優先度・ステータスは空 Set のとき「すべて」。終了予定日は前後空白除去後、空文字はその境界なし */
export interface ProjectMultiFilterCriteria {
  departments: ReadonlySet<string>;
  members: ReadonlySet<string>;
  endDateFrom: string;
  endDateTo: string;
  priorities: ReadonlySet<string>;
  statuses: ReadonlySet<string>;
}
