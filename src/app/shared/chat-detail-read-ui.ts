import { signal, type WritableSignal } from '@angular/core';

import type { ChatReadCursorService } from '../services/dashboard/chat-read-cursor.service';

/** マイページ通知リンクの queryParams キー */
export const CHAT_FROM_DASHBOARD_QUERY = 'chatFrom';
export const CHAT_FROM_DASHBOARD_VALUE = 'dashboard';

export function isChatFromDashboardQuery(value: string | null | undefined): boolean {
  return (value ?? '').trim() === CHAT_FROM_DASHBOARD_VALUE;
}

/** lastReadAt より新しく、かつスレッド未確認のメッセージ */
export function isChatMessageUnreadInDetail(
  createdAtIso: string,
  lastReadAtIso: string | undefined,
  ackedThreadRootIds: ReadonlySet<string>,
  threadRootId: string,
): boolean {
  const rootId = threadRootId.trim();
  if (rootId && ackedThreadRootIds.has(rootId)) {
    return false;
  }
  const at = createdAtIso.trim();
  if (!at) {
    return false;
  }
  const last = lastReadAtIso?.trim();
  if (!last) {
    return true;
  }
  return at.localeCompare(last, 'en') > 0;
}

export function threadHasUnreadInDetail(
  root: { id: string; createdAtIso: string },
  replies: readonly { createdAtIso: string }[],
  lastReadAtIso: string | undefined,
  ackedThreadRootIds: ReadonlySet<string>,
): boolean {
  const acked = ackedThreadRootIds;
  if (isChatMessageUnreadInDetail(root.createdAtIso, lastReadAtIso, acked, root.id)) {
    return true;
  }
  return replies.some((r) => isChatMessageUnreadInDetail(r.createdAtIso, lastReadAtIso, acked, root.id));
}

/**
 * 詳細画面 C: 退室時に lastReadAt を進める。表示中は live の lastReadAt で未読ハイライト。
 */
export class ChatDetailReadVisitUi {
  private visitKey = '';
  private scopeKind: 'task' | 'project' = 'task';
  private scopeId = '';

  readonly ackedThreadRootIds: WritableSignal<ReadonlySet<string>> = signal(new Set<string>());

  constructor(private readonly cursors: ChatReadCursorService) {}

  resetForScope(kind: 'task' | 'project', uid: string, scopeId: string): void {
    const uidT = uid.trim();
    const scopeT = scopeId.trim();
    if (!uidT || !scopeT) {
      return;
    }
    const key = `${uidT}:${kind}:${scopeT}`;
    if (this.visitKey === key) {
      return;
    }
    this.visitKey = key;
    this.scopeKind = kind;
    this.scopeId = scopeT;
    this.ackedThreadRootIds.set(new Set());
  }

  ackThreadRoot(threadRootId: string): void {
    const id = threadRootId.trim();
    if (!id) {
      return;
    }
    this.ackedThreadRootIds.update((current) => {
      if (current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  private lastReadAtIso(): string | undefined {
    if (!this.scopeId) {
      return undefined;
    }
    return this.cursors.getLastReadAt(this.scopeKind, this.scopeId);
  }

  isMessageUnread(createdAtIso: string, threadRootId: string): boolean {
    return isChatMessageUnreadInDetail(
      createdAtIso,
      this.lastReadAtIso(),
      this.ackedThreadRootIds(),
      threadRootId,
    );
  }

  threadHasUnread(
    root: { id: string; createdAtIso: string },
    replies: readonly { createdAtIso: string }[],
  ): boolean {
    return threadHasUnreadInDetail(
      root,
      replies,
      this.lastReadAtIso(),
      this.ackedThreadRootIds(),
    );
  }
}
