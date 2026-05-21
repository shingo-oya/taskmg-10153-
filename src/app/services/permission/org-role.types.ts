/** ユーザー管理で設定する組織権限 */
export const ORG_ROLES = [
  'ゲスト',
  'メンバー',
  'プロジェクト管理者',
  '管理者',
  'マスター',
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

const ROLE_RANK: Record<OrgRole, number> = {
  ゲスト: 0,
  メンバー: 1,
  プロジェクト管理者: 2,
  管理者: 3,
  マスター: 4,
};

export function orgRoleRank(role: OrgRole): number {
  return ROLE_RANK[role];
}

export function normalizeOrgRole(value: string | undefined | null): OrgRole {
  const v = (value ?? '').trim();
  if ((ORG_ROLES as readonly string[]).includes(v)) {
    return v as OrgRole;
  }
  return 'メンバー';
}

export function hasMinOrgRole(current: OrgRole, required: OrgRole): boolean {
  return orgRoleRank(current) >= orgRoleRank(required);
}
