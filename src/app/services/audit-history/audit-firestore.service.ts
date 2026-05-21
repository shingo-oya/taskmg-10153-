import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  Firestore,
  getDocs,
  limit,
  orderBy,
  query,
} from '@angular/fire/firestore';

import { FirestoreContextService } from '../firestore-context.service';
import type { LoginHistoryEntry, RoleChangeHistoryEntry } from './audit-history.types';
import {
  AUDIT_LOGINS_COLLECTION,
  AUDIT_ROLE_CHANGES_COLLECTION,
  type FirestoreAuditLoginDoc,
  type FirestoreAuditRoleChangeDoc,
} from './audit-firestore.types';

const LIST_LIMIT = 500;

@Injectable({
  providedIn: 'root',
})
export class AuditFirestoreService {
  private readonly firestore = inject(Firestore);
  private readonly firestoreContext = inject(FirestoreContextService);

  async appendLogin(doc: FirestoreAuditLoginDoc): Promise<void> {
    await this.firestoreContext.runAsync(async () => {
      await addDoc(collection(this.firestore, AUDIT_LOGINS_COLLECTION), doc);
    });
  }

  async appendRoleChange(doc: FirestoreAuditRoleChangeDoc): Promise<void> {
    await this.firestoreContext.runAsync(async () => {
      await addDoc(collection(this.firestore, AUDIT_ROLE_CHANGES_COLLECTION), doc);
    });
  }

  async listLogins(max = LIST_LIMIT): Promise<LoginHistoryEntry[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(
        query(
          collection(this.firestore, AUDIT_LOGINS_COLLECTION),
          orderBy('at', 'desc'),
          limit(max),
        ),
      );
      return snap.docs.map((d) => {
        const data = d.data() as FirestoreAuditLoginDoc;
        return {
          id: d.id,
          email: data.email,
          displayName: data.displayName,
          at: data.at,
        };
      });
    });
  }

  async listRoleChanges(max = LIST_LIMIT): Promise<RoleChangeHistoryEntry[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(
        query(
          collection(this.firestore, AUDIT_ROLE_CHANGES_COLLECTION),
          orderBy('at', 'desc'),
          limit(max),
        ),
      );
      return snap.docs.map((d) => {
        const data = d.data() as FirestoreAuditRoleChangeDoc;
        return {
          id: d.id,
          targetEmail: data.targetEmail,
          targetName: data.targetName,
          previousRole: data.previousRole,
          newRole: data.newRole,
          changedByEmail: data.changedByEmail,
          changedByName: data.changedByName,
          at: data.at,
        };
      });
    });
  }
}
