import { computed, inject, Injectable } from '@angular/core';

import { AuthService } from '../auth-service/auth.service';
import { hasMinOrgRole, normalizeOrgRole, type OrgRole } from './org-role.types';
import { PERMISSION_MIN_ROLE, type Permission } from './permission.types';

@Injectable({
  providedIn: 'root',
})
export class PermissionService {
  private readonly auth = inject(AuthService);

  readonly orgRole = computed<OrgRole | null>(() => {
    const user = this.auth.currentUser();
    if (!user) {
      return null;
    }
    return normalizeOrgRole(user.role);
  });

  has(permission: Permission): boolean {
    const role = this.orgRole();
    if (!role) {
      return false;
    }
    const required = PERMISSION_MIN_ROLE[permission];
    return hasMinOrgRole(role, required);
  }

  hasMinRole(minRole: OrgRole): boolean {
    const role = this.orgRole();
    if (!role) {
      return false;
    }
    return hasMinOrgRole(role, minRole);
  }

  /** テンプレート用エイリアス */
  can(permission: Permission): boolean {
    return this.has(permission);
  }
}
