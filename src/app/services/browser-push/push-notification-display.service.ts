import { Injectable } from '@angular/core';

const SW_URL = '/push-sw.js';

@Injectable({
  providedIn: 'root',
})
export class PushNotificationDisplayService {
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator
    );
  }

  getPermission(): NotificationPermission | 'unsupported' {
    if (!this.isSupported()) {
      return 'unsupported';
    }
    return Notification.permission;
  }

  async ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      return null;
    }
    try {
      return await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    } catch {
      return null;
    }
  }

}
