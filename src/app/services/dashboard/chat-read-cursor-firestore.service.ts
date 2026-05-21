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
  CHAT_READ_CURSOR_COLLECTION,
  chatReadCursorDocId,
  type FirestoreChatReadCursor,
} from './chat-read-cursor.types';

@Injectable({
  providedIn: 'root',
})
export class ChatReadCursorFirestoreService {
  private readonly firestore = inject(Firestore);
  private readonly firestoreContext = inject(FirestoreContextService);

  async listForUser(uid: string): Promise<FirestoreChatReadCursor[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, USERS_COLLECTION, uid, CHAT_READ_CURSOR_COLLECTION));
      return snap.docs.map((d) => d.data() as FirestoreChatReadCursor);
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
    const payload: FirestoreChatReadCursor = { kind, scopeId: scope, lastReadAtIso: at };
    await this.firestoreContext.runAsync(async () => {
      await setDoc(
        doc(this.firestore, USERS_COLLECTION, uid, CHAT_READ_CURSOR_COLLECTION, chatReadCursorDocId(kind, scope)),
        payload,
        { merge: true },
      );
    });
  }
}
