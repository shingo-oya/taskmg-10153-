/** ログイン履歴 */
export interface LoginHistoryEntry {
  id: string;
  email: string;
  displayName: string;
  at: string;
}

/** 権限（組織ロール）の変更履歴 */
export interface RoleChangeHistoryEntry {
  id: string;
  targetEmail: string;
  targetName: string;
  previousRole: string;
  newRole: string;
  changedByEmail: string;
  changedByName: string;
  at: string;
}

export interface RecordLoginInput {
  email: string;
  displayName: string;
  /** Firebase Auth uid（省略時は現在のセッション） */
  uid?: string;
}

export interface RecordRoleChangeInput {
  targetUid?: string;
  targetEmail: string;
  targetName: string;
  previousRole: string;
  newRole: string;
  changedByUid?: string;
  changedByEmail: string;
  changedByName: string;
}
