import type { OrgRole } from '../permission/org-role.types';

/**
 * ログインセッション上のユーザー（本番 API のユーザー DTO に寄せた最小形）。
 */
export interface AuthSessionUser {
  /** Firebase Authentication の uid */
  userId: string;
  email: string;
  /** チャット表示名（氏名） */
  displayName: string;
  /** 組織権限（Users マスタの role） */
  role: OrgRole;
}