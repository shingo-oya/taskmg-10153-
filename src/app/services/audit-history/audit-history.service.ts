import { inject, Injectable, signal } from '@angular/core';

import { AuditFirestoreService } from './audit-firestore.service';
import type {
  LoginHistoryEntry,
  RecordLoginInput,
  RecordRoleChangeInput,
  RoleChangeHistoryEntry,
} from './audit-history.types';

/**
 * 監査履歴（Firestore `auditLogins` / `auditRoleChanges`）。
 * 管理者は設定画面から組織全体の履歴を参照できます。
 */
@Injectable({
  providedIn: 'root',
})
export class AuditHistoryService {
  private readonly auditFirestore = inject(AuditFirestoreService);

  private readonly loginHistory = signal<LoginHistoryEntry[]>([]);
  private readonly roleChangeHistory = signal<RoleChangeHistoryEntry[]>([]);
  private readonly loaded = signal(false);
  private readonly revision = signal(0);

  readonly historyLoaded = this.loaded.asReadonly();

  listLoginHistory(): LoginHistoryEntry[] {
    this.revision();
    return this.loginHistory();
  }

  listRoleChangeHistory(): RoleChangeHistoryEntry[] {
    this.revision();
    return this.roleChangeHistory();
  }

  async refreshFromFirestore(): Promise<void> {
    const [logins, roles] = await Promise.all([
      this.auditFirestore.listLogins(),
      this.auditFirestore.listRoleChanges(),
    ]);
    this.loginHistory.set(logins);
    this.roleChangeHistory.set(roles);
    this.loaded.set(true);
    this.revision.update((v) => v + 1);
  }

  recordLogin(input: RecordLoginInput): void {
    const email = input.email.trim();
    if (!email) {
      return;
    }
    const uid = input.uid?.trim() || '';
    const at = new Date().toISOString();
    void this.auditFirestore
      .appendLogin({
        uid,
        email,
        displayName: input.displayName.trim(),
        at,
      })
      .then(() => {
        const entry: LoginHistoryEntry = {
          id: `local-${at}`,
          email,
          displayName: input.displayName.trim(),
          at,
        };
        this.loginHistory.update((list) => [entry, ...list].slice(0, 500));
        this.revision.update((v) => v + 1);
      })
      .catch(() => {
        /* 監査書き込み失敗はログイン自体は継続 */
      });
  }

  recordRoleChange(input: RecordRoleChangeInput): void {
    const previousRole = input.previousRole.trim();
    const newRole = input.newRole.trim();
    if (!input.targetEmail.trim() || previousRole === newRole) {
      return;
    }
    const at = new Date().toISOString();
    void this.auditFirestore
      .appendRoleChange({
        targetUid: input.targetUid?.trim() || undefined,
        targetEmail: input.targetEmail.trim(),
        targetName: input.targetName.trim(),
        previousRole,
        newRole,
        changedByUid: input.changedByUid?.trim() || undefined,
        changedByEmail: input.changedByEmail.trim(),
        changedByName: input.changedByName.trim(),
        at,
      })
      .then(() => {
        const entry: RoleChangeHistoryEntry = {
          id: `local-${at}`,
          targetEmail: input.targetEmail.trim(),
          targetName: input.targetName.trim(),
          previousRole,
          newRole,
          changedByEmail: input.changedByEmail.trim(),
          changedByName: input.changedByName.trim(),
          at,
        };
        this.roleChangeHistory.update((list) => [entry, ...list].slice(0, 500));
        this.revision.update((v) => v + 1);
      })
      .catch(() => {
        /* ignore */
      });
  }
}
