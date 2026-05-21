import { effect, inject, Injectable, signal } from '@angular/core';

import { AuthService } from '../auth-service/auth.service';
import { nowUtcIso } from '../../shared/japan-datetime';
import { normalizeUpdateHistoryAt } from '../../shared/update-history-at';
import type { DashboardUpdateItem } from './dashboard.types';
import { DashboardReadStateFirestoreService } from './dashboard-read-state-firestore.service';
import {
  dashboardUpdateScopeKey,
  parseDashboardUpdateScopeKey,
} from './dashboard-read-state.types';

const SESSION_CACHE_PREFIX = 'taskmg-dashboard-read-cache:';

/**
 * マイページ「更新通知」の既読（課題・プロジェクト単位 lastReadAt・Firestore 永続化）。
 * sessionStorage は UI キャッシュのみ。詳細を開いたスコープのみ既読化する。
 */
@Injectable({
  providedIn: 'root',
})
export class DashboardReadStateService {
  private readonly auth = inject(AuthService);
  private readonly firestore = inject(DashboardReadStateFirestoreService);

  private readonly cursors = signal<ReadonlyMap<string, string>>(new Map());
  private readonly revision = signal(0);
  private loadPromise: Promise<void> | null = null;
  private loadedForUid = '';

  readonly readRevision = this.revision.asReadonly();

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (user?.userId) {
        void this.ensureLoaded(user.userId);
      } else {
        this.cursors.set(new Map());
        this.loadedForUid = '';
        this.revision.update((n) => n + 1);
      }
    });
  }

  async ensureLoaded(uid: string): Promise<void> {
    const id = uid.trim();
    if (!id) {
      return;
    }
    if (this.loadedForUid === id && this.loadPromise === null) {
      return;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }
    this.loadPromise = this.loadFromFirestore(id).finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  isLoadedFor(uid: string): boolean {
    const id = uid.trim();
    return !!id && this.loadedForUid === id && this.loadPromise === null;
  }

  /** 更新通知: 当該スコープで `at` が lastReadAt 以前なら既読 */
  isUpdateRead(
    uid: string,
    kind: 'task' | 'project',
    scopeId: string,
    atIso: string,
  ): boolean {
    if (this.loadedForUid !== uid.trim()) {
      return false;
    }
    this.revision();
    const last = this.cursors().get(dashboardUpdateScopeKey(kind, scopeId));
    if (!last) {
      return false;
    }
    const at = atIso.trim();
    if (!at) {
      return true;
    }
    return (
      normalizeUpdateHistoryAt(at).localeCompare(normalizeUpdateHistoryAt(last), 'en') <= 0
    );
  }

  /** 詳細画面を開いたスコープを現在時刻まで既読 */
  async markScopeReadThroughNow(
    uid: string,
    kind: 'task' | 'project',
    scopeId: string,
    lastReadAtIso?: string,
  ): Promise<void> {
    await this.markScopeRead(uid, kind, scopeId, (lastReadAtIso ?? nowUtcIso()).trim());
  }

  async markAllUpdatesRead(uid: string, updates: readonly DashboardUpdateItem[]): Promise<void> {
    const byScope = new Map<string, string>();
    for (const u of updates) {
      const key = dashboardUpdateScopeKey(u.kind, u.scopeId);
      const cur = byScope.get(key);
      const at = u.at.trim();
      if (!at) {
        continue;
      }
      if (!cur || at.localeCompare(cur, 'en') > 0) {
        byScope.set(key, at);
      }
    }
    const now = nowUtcIso();
    await Promise.all(
      [...byScope.entries()].map(([key, at]) => {
        const parsed = parseDashboardUpdateScopeKey(key);
        if (!parsed) {
          return Promise.resolve();
        }
        const lastRead = at.localeCompare(now, 'en') > 0 ? at : now;
        return this.markScopeRead(uid, parsed.kind, parsed.scopeId, lastRead);
      }),
    );
  }

  private async markScopeRead(
    uid: string,
    kind: 'task' | 'project',
    scopeId: string,
    lastReadAtIso: string,
  ): Promise<void> {
    const at = lastReadAtIso.trim();
    if (!uid.trim() || !scopeId.trim() || !at) {
      return;
    }
    const key = dashboardUpdateScopeKey(kind, scopeId);
    const prev = this.cursors().get(key);
    if (prev && prev.localeCompare(at, 'en') >= 0) {
      return;
    }
    this.patchLocal(key, at);
    try {
      await this.firestore.setLastReadAt(uid, kind, scopeId, at);
      this.patchSessionCache(uid);
    } catch {
      if (prev) {
        this.patchLocal(key, prev);
      } else {
        this.removeLocal(key);
      }
      this.patchSessionCache(uid);
    }
  }

  private async loadFromFirestore(uid: string): Promise<void> {
    const cached = this.readSessionCache(uid);
    if (cached) {
      this.cursors.set(cached);
    }
    try {
      const rows = await this.firestore.listForUser(uid);
      const map = new Map<string, string>();
      for (const row of rows) {
        const at = row.lastReadAtIso?.trim();
        if (at) {
          map.set(dashboardUpdateScopeKey(row.kind, row.scopeId), at);
        }
      }
      this.cursors.set(map);
      this.loadedForUid = uid;
      this.patchSessionCache(uid);
    } catch {
      this.cursors.set(cached ?? new Map());
      this.loadedForUid = uid;
    }
    this.revision.update((n) => n + 1);
  }

  private patchLocal(key: string, lastReadAtIso: string): void {
    const next = new Map(this.cursors());
    next.set(key, lastReadAtIso);
    this.cursors.set(next);
    this.revision.update((n) => n + 1);
  }

  private removeLocal(key: string): void {
    const next = new Map(this.cursors());
    next.delete(key);
    this.cursors.set(next);
    this.revision.update((n) => n + 1);
  }

  private patchSessionCache(uid: string): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of this.cursors()) {
        obj[k] = v;
      }
      sessionStorage.setItem(SESSION_CACHE_PREFIX + uid, JSON.stringify(obj));
    } catch {
      /* quota */
    }
  }

  private readSessionCache(uid: string): Map<string, string> | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    try {
      const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + uid);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const map = new Map<string, string>();
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.trim()) {
          map.set(k, v.trim());
        }
      }
      return map;
    } catch {
      return null;
    }
  }
}
