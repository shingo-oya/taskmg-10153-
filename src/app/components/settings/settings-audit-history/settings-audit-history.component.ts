import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuditHistoryService } from '../../../services/audit-history/audit-history.service';
import { formatDateTimeJapan } from '../../../shared/japan-datetime';
import type {
  LoginHistoryEntry,
  RoleChangeHistoryEntry,
} from '../../../services/audit-history/audit-history.types';

type HistoryTab = 'login' | 'role';

@Component({
  selector: 'app-settings-audit-history',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './settings-audit-history.component.html',
  styleUrl: './settings-audit-history.component.scss',
})
export class SettingsAuditHistoryComponent implements OnInit {
  private readonly auditHistory = inject(AuditHistoryService);

  readonly activeTab = signal<HistoryTab>('login');
  readonly loadError = signal<string | null>(null);
  readonly loading = signal(true);

  ngOnInit(): void {
    void this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      await this.auditHistory.refreshFromFirestore();
    } catch {
      this.loadError.set('履歴の読み込みに失敗しました。');
    } finally {
      this.loading.set(false);
    }
  }

  setTab(tab: HistoryTab): void {
    this.activeTab.set(tab);
  }

  loginEntries(): LoginHistoryEntry[] {
    return this.auditHistory.listLoginHistory();
  }

  roleChangeEntries(): RoleChangeHistoryEntry[] {
    return this.auditHistory.listRoleChangeHistory();
  }

  formatAt(iso: string): string {
    return formatDateTimeJapan(iso, 'ymdhm');
  }
}
