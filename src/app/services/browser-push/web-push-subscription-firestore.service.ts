import { inject, Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocs,
  setDoc,
} from '@angular/fire/firestore';

import { FirestoreContextService } from '../firestore-context.service';
import {
  USERS_COLLECTION,
  WEB_PUSH_SUBSCRIPTIONS_COLLECTION,
  type FirestoreWebPushSubscriptionDoc,
} from '../users-firestore/firestore-user.types';

@Injectable({
  providedIn: 'root',
})
export class WebPushSubscriptionFirestoreService {
  private readonly firestore = inject(Firestore);
  private readonly firestoreContext = inject(FirestoreContextService);

  subscriptionDocId(endpoint: string): string {
    const safe = endpoint.replace(/[^a-zA-Z0-9]/g, '_');
    return safe.length > 120 ? safe.slice(-120) : safe;
  }

  async save(uid: string, subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    const endpoint = json.endpoint?.trim();
    const p256dh = json.keys?.['p256dh'];
    const auth = json.keys?.['auth'];
    if (!endpoint || !p256dh || !auth) {
      return;
    }
    const now = new Date().toISOString();
    const payload: FirestoreWebPushSubscriptionDoc = {
      endpoint,
      keys: { p256dh, auth },
      createdAtIso: now,
      updatedAtIso: now,
      ...(typeof navigator !== 'undefined' && navigator.userAgent
        ? { userAgent: navigator.userAgent }
        : {}),
    };
    await this.firestoreContext.runAsync(async () => {
      await setDoc(
        doc(
          this.firestore,
          USERS_COLLECTION,
          uid,
          WEB_PUSH_SUBSCRIPTIONS_COLLECTION,
          this.subscriptionDocId(endpoint),
        ),
        payload,
        { merge: true },
      );
    });
  }

  async remove(uid: string, endpoint: string): Promise<void> {
    const id = endpoint.trim();
    if (!id) {
      return;
    }
    await this.firestoreContext.runAsync(async () => {
      await deleteDoc(
        doc(
          this.firestore,
          USERS_COLLECTION,
          uid,
          WEB_PUSH_SUBSCRIPTIONS_COLLECTION,
          this.subscriptionDocId(id),
        ),
      );
    });
  }

  async removeAllForUser(uid: string): Promise<void> {
    await this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(
        collection(
          this.firestore,
          USERS_COLLECTION,
          uid,
          WEB_PUSH_SUBSCRIPTIONS_COLLECTION,
        ),
      );
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    });
  }
}
