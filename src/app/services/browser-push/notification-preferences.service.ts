import { effect, EnvironmentInjector, inject, Injectable, runInInjectionContext, signal } from '@angular/core';

import { AuthService } from '../auth-service/auth.service';
import { UsersFirestoreService } from '../users-firestore/users-firestore.service';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from './browser-push.types';

function normalizePreferences(
  raw: Partial<NotificationPreferences> | undefined,
): NotificationPreferences {
  if (!raw) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  return {
    browserPushEnabled: !!raw.browserPushEnabled,
    notifyMention: raw.notifyMention !== false,
    notifyReply: raw.notifyReply !== false,
  };
}

/**
 * 通知設定（Firestore `users/{uid}.notificationPreferences`）。
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationPreferencesService {
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(AuthService);
  private readonly usersFirestore = inject(UsersFirestoreService);

  private readonly _prefs = signal<NotificationPreferences>({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  });
  private readonly _synced = signal(false);

  readonly preferences = this._prefs.asReadonly();
  readonly synced = this._synced.asReadonly();

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        runInInjectionContext(this.injector, () => {
          void this.loadForUser(user.userId);
        });
      } else {
        this._prefs.set({ ...DEFAULT_NOTIFICATION_PREFERENCES });
        this._synced.set(false);
      }
    });
  }

  get(): NotificationPreferences {
    return this._prefs();
  }

  async update(patch: Partial<NotificationPreferences>): Promise<void> {
    const next = { ...this._prefs(), ...patch };
    this._prefs.set(next);
    const uid = this.auth.currentUser()?.userId;
    if (!uid) {
      return;
    }
    try {
      await this.usersFirestore.updateNotificationPreferences(uid, next);
      this._synced.set(true);
    } catch {
      this._synced.set(false);
    }
  }

  shouldNotify(kind: 'mention' | 'reply'): boolean {
    const p = this._prefs();
    if (!p.browserPushEnabled) {
      return false;
    }
    if (kind === 'mention') {
      return p.notifyMention;
    }
    return p.notifyReply;
  }

  private async loadForUser(uid: string): Promise<void> {
    try {
      const profile = await this.usersFirestore.getProfileByUid(uid);
      this._prefs.set(normalizePreferences(profile?.notificationPreferences));
      this._synced.set(true);
    } catch {
      this._prefs.set({ ...DEFAULT_NOTIFICATION_PREFERENCES });
      this._synced.set(false);
    }
  }
}
