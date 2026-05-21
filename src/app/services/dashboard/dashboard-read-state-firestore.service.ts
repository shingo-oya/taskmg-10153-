import { inject, Injectable } from '@angular/core';
import {
  collection,
  doc,
  Firestore,
  getDocs,
  setDoc,
} from '@angular/fire/firestore';

import { FirestoreContextService } from '../firestore-context.service';
import { USERS_COLLECTION } from '../users-firestore/firestore-user.types';
import {
  DASHBOARD_READ_STATE_COLLECTION,
  dashboardReadStateDocId,
  type FirestoreDashboardReadState,
} from './dashboard-read-state.types';

@Injectable({
  providedIn: 'root',
})
export class DashboardReadStateFirestoreService {
  private readonly firestore = inject(Firestore);
  private readonly firestoreContext = inject(FirestoreContextService);

  async listForUser(uid: string): Promise<FirestoreDashboardReadState[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(
        collection(this.firestore, USERS_COLLECTION, uid, DASHBOARD_READ_STATE_COLLECTION),
      );
      return snap.docs.map((d) => d.data() as FirestoreDashboardReadState);
    });
  }

  async setLastReadAt(
    uid: string,
    kind: 'task' | 'project',
    scopeId: string,
    lastReadAtIso: string,
  ): Promise<void> {
    const scope = scopeId.trim();
    const at = lastReadAtIso.trim();
    if (!scope || !at) {
      return;
    }
    const payload: FirestoreDashboardReadState = { kind, scopeId: scope, lastReadAtIso: at };
    await this.firestoreContext.runAsync(async () => {
      await setDoc(
        doc(
          this.firestore,
          USERS_COLLECTION,
          uid,
          DASHBOARD_READ_STATE_COLLECTION,
          dashboardReadStateDocId(kind, scope),
        ),
        payload,
        { merge: true },
      );
    });
  }
}
