import { effect, inject, Injectable, signal } from '@angular/core';

import { AuthService } from '../auth-service/auth.service';
import { nowUtcIso } from '../../shared/japan-datetime';
import type { DashboardChatNotificationItem } from './dashboard.types';
import { ChatReadCursorFirestoreService } from './chat-read-cursor-firestore.service';
import {
  chatScopeKey,
  maxCreatedAtIso,
  parseChatScopeKey,
} from './chat-read-cursor.types';

/**
 * マイページチャット通知の既読（スコープ単位 lastReadAt・Firestore 永続化）。
 */
@Injectable({
  providedIn: 'root',
})
export class ChatReadCursorService {
  private readonly auth = inject(AuthService);
  private readonly firestore = inject(ChatReadCursorFirestoreService);

  private readonly cursors = signal<ReadonlyMap<string, string>>(new Map());
  private readonly revision = signal(0);
  private loadPromise: Promise<void> | null = null;
  private loadedForUid = '';

  readonly cursorRevision = this.revision.asReadonly();

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

  getLastReadAt(kind: 'task' | 'project', scopeId: string): string | undefined {
    this.revision();
    const last = this.cursors().get(chatScopeKey(kind, scopeId))?.trim();
    return last || undefined;
  }

  isChatMessageRead(kind: 'task' | 'project', scopeId: string, createdAtIso: string): boolean {
    this.revision();
    const last = this.cursors().get(chatScopeKey(kind, scopeId));
    if (!last) {
      return false;
    }
    const at = createdAtIso.trim();
    if (!at) {
      return true;
    }
    return at.localeCompare(last, 'en') <= 0;
  }

  async markScopeRead(
    uid: string,
    kind: 'task' | 'project',
    scopeId: string,
    lastReadAtIso: string,
  ): Promise<void> {
    const at = lastReadAtIso.trim();
    if (!uid.trim() || !scopeId.trim() || !at) {
      return;
    }
    const key = chatScopeKey(kind, scopeId);
    const prev = this.cursors().get(key);
    if (prev && prev.localeCompare(at, 'en') >= 0) {
      return;
    }
    this.patchLocal(key, at);
    try {
      await this.firestore.setLastReadAt(uid, kind, scopeId, at);
    } catch {
      if (prev) {
        this.patchLocal(key, prev);
      } else {
        this.removeLocal(key);
      }
    }
  }

  /** 詳細画面: スコープ内メッセージの最新時刻まで既読 */
  async markScopeReadFromMessages(
    uid: string,
    kind: 'task' | 'project',
    scopeId: string,
    messages: readonly { createdAtIso: string }[],
  ): Promise<void> {
    const latest = maxCreatedAtIso(messages) ?? nowUtcIso();
    await this.markScopeRead(uid, kind, scopeId, latest);
  }

  async markAllChatNotificationsRead(
    uid: string,
    notifications: readonly DashboardChatNotificationItem[],
  ): Promise<void> {
    const byScope = new Map<string, string>();
    for (const n of notifications) {
      const key = chatScopeKey(n.kind, n.scopeId);
      const cur = byScope.get(key);
      const at = n.createdAtIso.trim();
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
        const parsed = parseChatScopeKey(key);
        if (!parsed) {
          return Promise.resolve();
        }
        const lastRead = at.localeCompare(now, 'en') > 0 ? at : now;
        return this.markScopeRead(uid, parsed.kind, parsed.scopeId, lastRead);
      }),
    );
  }

  private async loadFromFirestore(uid: string): Promise<void> {
    try {
      const rows = await this.firestore.listForUser(uid);
      const map = new Map<string, string>();
      for (const row of rows) {
        const at = row.lastReadAtIso?.trim();
        if (at) {
          map.set(chatScopeKey(row.kind, row.scopeId), at);
        }
      }
      this.cursors.set(map);
      this.loadedForUid = uid;
    } catch {
      this.cursors.set(new Map());
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
}
