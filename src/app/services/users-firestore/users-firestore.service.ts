import { inject, Injectable } from '@angular/core';
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';

import { firebaseConfig } from '../../firebase-config';
import type { UsersRow } from '../../components/users/users-row';
import type { NotificationPreferences } from '../browser-push/browser-push.types';
import { FirestoreContextService } from '../firestore-context.service';
import { type FirestoreUserProfile, USERS_COLLECTION } from './firestore-user.types';

@Injectable({
  providedIn: 'root',
})
export class UsersFirestoreService {
  private readonly firestore = inject(Firestore);
  private readonly firestoreContext = inject(FirestoreContextService);

  async getProfileByUid(uid: string): Promise<FirestoreUserProfile | null> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDoc(doc(this.firestore, USERS_COLLECTION, uid));
      if (!snap.exists()) {
        return null;
      }
      return snap.data() as FirestoreUserProfile;
    });
  }

  async listAll(): Promise<{ uid: string; profile: FirestoreUserProfile }[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, USERS_COLLECTION));
      return snap.docs.map((d) => ({
        uid: d.id,
        profile: d.data() as FirestoreUserProfile,
      }));
    });
  }

  async findUidByEmail(email: string): Promise<string | null> {
    return this.firestoreContext.runAsync(async () => {
      const normalized = email.trim().toLowerCase();
      const q = query(
        collection(this.firestore, USERS_COLLECTION),
        where('email', '==', normalized),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        return null;
      }
      return snap.docs[0].id;
    });
  }

  async setProfile(uid: string, profile: FirestoreUserProfile): Promise<void> {
    await this.firestoreContext.runAsync(async () => {
      await setDoc(doc(this.firestore, USERS_COLLECTION, uid), profile);
    });
  }

  async updateProfile(uid: string, profile: FirestoreUserProfile): Promise<void> {
    await this.firestoreContext.runAsync(async () => {
      await updateDoc(
        doc(this.firestore, USERS_COLLECTION, uid),
        firestoreUpdatePayload(profile),
      );
    });
  }

  /** 自分のプロフィール（表示名・部署・メール）。role/status は既存値を維持 */
  async updateOwnProfileFields(
    uid: string,
    fields: Pick<FirestoreUserProfile, 'email' | 'displayName' | 'department' | 'role' | 'status'>,
  ): Promise<void> {
    await this.firestoreContext.runAsync(async () => {
      await updateDoc(doc(this.firestore, USERS_COLLECTION, uid), { ...fields });
    });
  }

  async updateNotificationPreferences(
    uid: string,
    preferences: NotificationPreferences,
  ): Promise<void> {
    await this.firestoreContext.runAsync(async () => {
      await updateDoc(doc(this.firestore, USERS_COLLECTION, uid), {
        notificationPreferences: preferences,
      });
    });
  }

  async createAuthUserWithProfile(
    row: UsersRow,
  ): Promise<{ ok: true; uid: string } | { ok: false; reason: string }> {
    const email = row.email.trim();
    const password = row.password.trim();
    const secondary = initializeApp(firebaseConfig, `user-create-${Date.now()}`);
    try {
      const secondaryAuth = getAuth(secondary);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const profile = usersRowToFirestoreProfile(row, email);
      await this.setProfile(cred.user.uid, profile);
      return { ok: true, uid: cred.user.uid };
    } catch {
      return {
        ok: false,
        reason:
          'ユーザーの作成に失敗しました。メールが既に登録済みの場合は別のアドレスを使用してください。',
      };
    } finally {
      await deleteApp(secondary);
    }
  }
}

/** updateDoc / setDoc 用（undefined フィールドは Firebase が拒否する） */
export function firestoreUpdatePayload<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

export function usersRowToFirestoreProfile(row: UsersRow, email?: string): FirestoreUserProfile {
  return {
    email: (email ?? row.email).trim().toLowerCase(),
    displayName: row.name.trim(),
    department: row.department.trim(),
    role: row.role.trim(),
    status: row.status.trim(),
  };
}

export function usersRowFromFirestore(uid: string, profile: FirestoreUserProfile): UsersRow {
  return {
    uid,
    department: profile.department,
    name: profile.displayName,
    email: profile.email,
    password: '',
    confirmPassword: '',
    role: profile.role,
    status: profile.status,
  };
}
