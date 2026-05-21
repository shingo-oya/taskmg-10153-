import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BrowserPushService } from '../../../services/browser-push/browser-push.service';
import { NotificationPreferencesService } from '../../../services/browser-push/notification-preferences.service';

@Component({
  selector: 'app-settings-notifications',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './settings-notifications.component.html',
  styleUrl: './settings-notifications.component.scss',
})
export class SettingsNotificationsComponent {
  private readonly browserPush = inject(BrowserPushService);
  private readonly prefsService = inject(NotificationPreferencesService);

  readonly prefs = this.prefsService.preferences;
  readonly permission = this.browserPush.permission;
  readonly pushReady = this.browserPush.ready;

  readonly statusMessage = signal<string | null>(null);
  readonly busy = signal(false);

  readonly supported = computed(() => this.browserPush.isSupported());

  constructor() {
    this.browserPush.syncPermissionState();
  }

  onToggleBrowserPush(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      void this.enablePush();
    } else {
      this.browserPush.disableBrowserPush();
      this.statusMessage.set('ブラウザ通知をオフにしました。');
    }
  }

  onToggleMention(event: Event): void {
    void this.prefsService.update({ notifyMention: (event.target as HTMLInputElement).checked });
  }

  onToggleReply(event: Event): void {
    void this.prefsService.update({ notifyReply: (event.target as HTMLInputElement).checked });
  }

  permissionLabel(): string {
    const p = this.permission();
    switch (p) {
      case 'granted':
        return '許可済み';
      case 'denied':
        return 'ブロック（ブラウザ設定で解除してください）';
      case 'default':
        return '未設定';
      case 'unsupported':
        return '非対応';
      default:
        return String(p);
    }
  }

  private async enablePush(): Promise<void> {
    this.busy.set(true);
    this.statusMessage.set(null);
    try {
      const result = await this.browserPush.enableBrowserPush();
      if (result.ok) {
        this.statusMessage.set(
          'ブラウザ通知を有効にしました。',
        );
        return;
      }
      if (result.reason === 'unsupported') {
        this.statusMessage.set('このブラウザは通知に対応していません。');
      } else if (result.reason === 'denied') {
        this.statusMessage.set('通知が拒否されました。アドレスバーの設定から許可してください。');
      } else if (result.reason === 'subscribe-failed') {
        this.statusMessage.set('Push の登録に失敗しました。VAPID 設定と HTTPS を確認してください。');
      } else {
        this.statusMessage.set('ログイン後に再度お試しください。');
      }
    } finally {
      this.busy.set(false);
    }
  }
}
