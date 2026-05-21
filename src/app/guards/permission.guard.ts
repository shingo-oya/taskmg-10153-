import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth-service/auth.service';
import { ProjectService } from '../services/project-service/project-service';
import { normalizeOrgRole, type OrgRole } from '../services/permission/org-role.types';
import { PermissionService } from '../services/permission/permission.service';
import type { Permission } from '../services/permission/permission.types';
import { buildPostLoginUrlTree, guestProjectCommands, type PostLoginNavigationInput } from '../shared/post-login-navigation';

function postLoginInput(): PostLoginNavigationInput {
  const permissions = inject(PermissionService);
  const projectService = inject(ProjectService);
  const auth = inject(AuthService);
  return {
    can: (p) => permissions.can(p),
    orgRole: permissions.orgRole(),
    projectRows: projectService.getProjectRows(),
    displayName: auth.currentUser()?.displayName ?? '',
  };
}

function forbiddenRedirect(router: Router) {
  const guest = guestProjectCommands(postLoginInput());
  if (guest) {
    return router.createUrlTree(guest);
  }
  return buildPostLoginUrlTree(postLoginInput(), router);
}

export const permissionGuard: CanActivateFn = (route) => {
  const permissions = inject(PermissionService);
  const router = inject(Router);

  const single = route.data['permission'] as Permission | undefined;
  if (single && !permissions.has(single)) {
    return forbiddenRedirect(router);
  }

  const list = route.data['permissions'] as Permission[] | undefined;
  if (list?.length) {
    const ok = list.every((p) => permissions.has(p));
    if (!ok) {
      return forbiddenRedirect(router);
    }
  }

  const anyList = route.data['permissionsAny'] as Permission[] | undefined;
  if (anyList?.length) {
    const ok = anyList.some((p) => permissions.has(p));
    if (!ok) {
      return forbiddenRedirect(router);
    }
  }

  const minRole = route.data['minRole'] as OrgRole | string | undefined;
  if (minRole && !permissions.hasMinRole(normalizeOrgRole(minRole))) {
    return forbiddenRedirect(router);
  }

  return true;
};
