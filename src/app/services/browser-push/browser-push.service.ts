import { inject, Injectable, signal } from '@angular/core';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth-service/auth.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { PushNotificationDisplayService } from './push-notification-display.service';
import { WebPushSubscriptionFirestoreService } from './web-push-subscription-firestore.service';
import { urlBase64ToUint8Array } from './web-push-vapid.util';

@Injectable({
  providedIn: 'root',
})
export class BrowserPushService {
  private readonly auth = inject(AuthService);
  private readonly preferences = inject(NotificationPreferencesService);
  private readonly display = inject(PushNotificationDisplayService);
  private readonly subscriptionStore = inject(WebPushSubscriptionFirestoreService);

  private readonly _permission = signal<NotificationPermission | 'unsupported'>('default');
  private readonly _ready = signal(false);
  private activeSubscription: PushSubscription | null = null;

  readonly permission = this._permission.asReadonly();
  readonly ready = this._ready.asReadonly();

  isSupported(): boolean {
    return (
      this.display.isSupported() &&
      !!environment.webPushVapidPublicKey &&
      'PushManager' in window
    );
  }

  syncPermissionState(): void {
    this._permission.set(this.display.getPermission());
  }

  async restoreIfEnabled(): Promise<void> {
    this.syncPermissionState();
    if (!this.isSupported()) {
      return;
    }
    const prefs = this.preferences.get();
    const user = this.auth.currentUser();
    if (!prefs.browserPushEnabled || !user || Notification.permission !== 'granted') {
      this._ready.set(false);
      return;
    }
    const reg = await this.display.ensureServiceWorker();
    if (!reg?.pushManager) {
      return;
    }
    try {
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        this.activeSubscription = existing;
        await this.subscriptionStore.save(user.userId, existing);
        this._ready.set(true);
        return;
      }
      const sub = await this.subscribeOnRegistration(reg);
      if (sub) {
        this.activeSubscription = sub;
        await this.subscriptionStore.save(user.userId, sub);
        this._ready.set(true);
      }
    } catch {
      this._ready.set(false);
    }
  }

  async enableBrowserPush(): Promise<
    | { ok: true }
    | { ok: false; reason: 'unsupported' | 'denied' | 'no-user' | 'subscribe-failed' }
  > {
    if (!this.isSupported()) {
      return { ok: false, reason: 'unsupported' };
    }
    const user = this.auth.currentUser();
    if (!user) {
      return { ok: false, reason: 'no-user' };
    }

    const permission = await Notification.requestPermission();
    this._permission.set(permission);
    if (permission !== 'granted') {
      return { ok: false, reason: 'denied' };
    }

    const reg = await this.display.ensureServiceWorker();
    if (!reg?.pushManager) {
      return { ok: false, reason: 'subscribe-failed' };
    }

    try {
      const sub = await this.subscribeOnRegistration(reg);
      if (!sub) {
        return { ok: false, reason: 'subscribe-failed' };
      }
      this.activeSubscription = sub;
      await this.subscriptionStore.save(user.userId, sub);
      await this.preferences.update({ browserPushEnabled: true });
      this._ready.set(true);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'subscribe-failed' };
    }
  }

  disableBrowserPush(): void {
    const user = this.auth.currentUser();
    void (async () => {
      if (user) {
        await this.subscriptionStore.removeAllForUser(user.userId);
      }
      const reg = await this.display.ensureServiceWorker();
      const sub = this.activeSubscription ?? (await reg?.pushManager?.getSubscription());
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        if (user && endpoint) {
          await this.subscriptionStore.remove(user.userId, endpoint);
        }
      }
      this.activeSubscription = null;
      await this.preferences.update({ browserPushEnabled: false });
      this._ready.set(false);
    })();
  }

  private async subscribeOnRegistration(
    reg: ServiceWorkerRegistration,
  ): Promise<PushSubscription | null> {
    const key = environment.webPushVapidPublicKey?.trim();
    if (!key || !reg.pushManager) {
      return null;
    }
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
  }
}
