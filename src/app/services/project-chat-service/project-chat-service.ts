import { inject, Injectable, signal } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';

import { resolveChatMentions } from '../../shared/chat-mentions';
import { ChatFirestoreService } from '../chat-firestore/chat-firestore.service';
import { ChatPostedEventsService } from '../browser-push/chat-posted-events.service';
import { environment } from '../../../environments/environment';
import type { ProjectChatMessage, ProjectChatMention, ProjectChatThreadId } from './project-chat.types';

function newChatId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `chat-${crypto.randomUUID()}`;
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

@Injectable({
  providedIn: 'root',
})
export class ProjectChatService {
  private readonly chatPosted = inject(ChatPostedEventsService);
  private readonly chatFirestore = inject(ChatFirestoreService);

  private readonly byProject = new Map<string, ProjectChatMessage[]>();
  private globalLoadPromise: Promise<void> | null = null;
  private readonly scopeLoadPromises = new Map<string, Promise<void>>();
  private readonly scopeWatchRefCounts = new Map<string, number>();
  private readonly scopeWatchUnsubs = new Map<string, Unsubscribe>();
  private readonly dashboardScopeIds = new Set<string>();

  /** チャット UI のリアルタイム再描画用 */
  readonly chatChanged = signal(0);

  getRootMessages(projectManagementNumber: string): ProjectChatMessage[] {
    const rows = this.byProject.get(projectManagementNumber) ?? [];
    return rows
      .filter((m) => m.threadId === null && m.parentId === null)
      .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
  }

  getThreadReplies(
    projectManagementNumber: string,
    threadRootId: ProjectChatThreadId,
  ): ProjectChatMessage[] {
    const rows = this.byProject.get(projectManagementNumber) ?? [];
    return rows
      .filter((m) => m.threadId === threadRootId && m.id !== threadRootId)
      .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
  }

  countThreadReplies(projectManagementNumber: string, threadRootId: ProjectChatThreadId): number {
    return this.getThreadReplies(projectManagementNumber, threadRootId).length;
  }

  listAllMessages(): ProjectChatMessage[] {
    const out: ProjectChatMessage[] = [];
    for (const rows of this.byProject.values()) {
      out.push(...rows);
    }
    return out;
  }

  getMessagesForScope(projectManagementNumber: string): ProjectChatMessage[] {
    return [...(this.byProject.get(projectManagementNumber.trim()) ?? [])];
  }

  ensureGlobalLoaded(): Promise<void> {
    if (this.globalLoadPromise) {
      return this.globalLoadPromise;
    }
    this.globalLoadPromise = this.loadAllFromFirestore().finally(() => {
      this.globalLoadPromise = null;
    });
    return this.globalLoadPromise;
  }

  /** 詳細画面・ダッシュボード: スコープ単位のリアルタイム購読 */
  acquireScopeWatch(projectManagementNumber: string): () => void {
    const id = projectManagementNumber.trim();
    if (!id) {
      return () => {};
    }
    void this.ensureScopeLoaded(id);
    const next = (this.scopeWatchRefCounts.get(id) ?? 0) + 1;
    this.scopeWatchRefCounts.set(id, next);
    if (next === 1) {
      const unsub = this.chatFirestore.listenProjectMessages(id, (messages) => {
        this.byProject.set(id, messages);
        this.bumpChatChanged();
      });
      this.scopeWatchUnsubs.set(id, unsub);
    }
    return () => this.releaseScopeWatch(id);
  }

  /** マイページ: 通知対象スコープのチャット購読を同期 */
  syncDashboardScopeWatches(projectIds: readonly string[]): void {
    const next = new Set(projectIds.map((x) => x.trim()).filter(Boolean));
    for (const id of this.dashboardScopeIds) {
      if (!next.has(id)) {
        this.dashboardScopeIds.delete(id);
        this.releaseScopeWatch(id);
      }
    }
    for (const id of next) {
      if (!this.dashboardScopeIds.has(id)) {
        this.dashboardScopeIds.add(id);
        this.acquireScopeWatch(id);
      }
    }
  }

  releaseAllDashboardScopeWatches(): void {
    for (const id of [...this.dashboardScopeIds]) {
      this.dashboardScopeIds.delete(id);
      this.releaseScopeWatch(id);
    }
  }

  private releaseScopeWatch(projectManagementNumber: string): void {
    const id = projectManagementNumber.trim();
    if (!id) {
      return;
    }
    const cur = this.scopeWatchRefCounts.get(id) ?? 0;
    if (cur <= 1) {
      this.scopeWatchRefCounts.delete(id);
      this.scopeWatchUnsubs.get(id)?.();
      this.scopeWatchUnsubs.delete(id);
    } else {
      this.scopeWatchRefCounts.set(id, cur - 1);
    }
  }

  ensureScopeLoaded(projectManagementNumber: string): Promise<void> {
    const id = projectManagementNumber.trim();
    if (!id) {
      return Promise.resolve();
    }
    const existing = this.scopeLoadPromises.get(id);
    if (existing) {
      return existing;
    }
    const promise = this.loadScope(id).finally(() => {
      this.scopeLoadPromises.delete(id);
    });
    this.scopeLoadPromises.set(id, promise);
    return promise;
  }

  postChannelMessage(
    projectManagementNumber: string,
    authorName: string,
    bodyPlain: string,
    knownDisplayNames: readonly string[],
    authorUserId?: string,
  ): ProjectChatMessage {
    const msg = this.buildMessage(projectManagementNumber, {
      threadId: null,
      parentId: null,
      authorName,
      bodyPlain,
      knownDisplayNames,
      authorUserId,
    });
    this.append(projectManagementNumber, msg);
    return msg;
  }

  postThreadReply(
    projectManagementNumber: string,
    threadRootId: ProjectChatThreadId,
    parentId: string,
    authorName: string,
    bodyPlain: string,
    knownDisplayNames: readonly string[],
    authorUserId?: string,
  ): ProjectChatMessage | null {
    const rows = this.byProject.get(projectManagementNumber) ?? [];
    const root = rows.find((m) => m.id === threadRootId && m.threadId === null && m.parentId === null);
    if (!root) {
      return null;
    }
    const parent = rows.find((m) => m.id === parentId);
    if (!parent) {
      return null;
    }
    const parentInThread =
      (parent.threadId === null && parent.id === threadRootId) ||
      parent.threadId === threadRootId;
    if (!parentInThread) {
      return null;
    }
    const msg = this.buildMessage(projectManagementNumber, {
      threadId: threadRootId,
      parentId,
      authorName,
      bodyPlain,
      knownDisplayNames,
      authorUserId,
    });
    this.append(projectManagementNumber, msg);
    return msg;
  }

  takeMessages(projectManagementNumber: string): ProjectChatMessage[] {
    const id = projectManagementNumber.trim();
    const msgs = [...(this.byProject.get(id) ?? [])];
    this.byProject.delete(id);
    void this.chatFirestore.deleteAllProjectMessages(id);
    return msgs;
  }

  restoreMessages(projectManagementNumber: string, messages: readonly ProjectChatMessage[]): void {
    const id = projectManagementNumber.trim();
    if (messages.length === 0) {
      this.byProject.delete(id);
      void this.chatFirestore.deleteAllProjectMessages(id);
      return;
    }
    this.byProject.set(id, [...messages]);
    void this.chatFirestore.restoreProjectMessages(id, messages);
  }

  private async loadAllFromFirestore(): Promise<void> {
    const all = await this.chatFirestore.listAllProjectMessages();
    this.byProject.clear();
    for (const msg of all) {
      const scope = msg.projectManagementNumber.trim();
      const cur = this.byProject.get(scope) ?? [];
      cur.push(msg);
      this.byProject.set(scope, cur);
    }
  }

  private async loadScope(projectManagementNumber: string): Promise<void> {
    if (this.byProject.has(projectManagementNumber)) {
      return;
    }
    let rows = await this.chatFirestore.listProjectMessages(projectManagementNumber);
    if (rows.length === 0 && environment.seedDemoChat) {
      const seeded = this.demoMessagesForScope(projectManagementNumber);
      if (seeded.length > 0) {
        for (const msg of seeded) {
          await this.chatFirestore.setProjectMessage(projectManagementNumber, msg);
        }
        rows = seeded;
      }
    }
    this.byProject.set(projectManagementNumber, rows);
  }

  private append(projectManagementNumber: string, msg: ProjectChatMessage): void {
    const cur = this.byProject.get(projectManagementNumber) ?? [];
    const next = [...cur, msg];
    this.byProject.set(projectManagementNumber, next);
    this.bumpChatChanged();
    void this.chatFirestore.setProjectMessage(projectManagementNumber, msg);
    this.chatPosted.emitProjectPosted({
      scopeId: projectManagementNumber,
      message: msg,
      scopeMessages: next,
    });
  }

  private bumpChatChanged(): void {
    this.chatChanged.update((n) => n + 1);
  }

  private buildMessage(
    projectManagementNumber: string,
    args: {
      threadId: ProjectChatThreadId | null;
      parentId: string | null;
      authorName: string;
      bodyPlain: string;
      knownDisplayNames: readonly string[];
      authorUserId?: string;
    },
  ): ProjectChatMessage {
    const mentions = resolveChatMentions(args.bodyPlain, args.knownDisplayNames);
    const authorUserId = args.authorUserId?.trim();
    return {
      id: newChatId(),
      projectManagementNumber,
      threadId: args.threadId,
      parentId: args.parentId,
      authorName: args.authorName.trim(),
      ...(authorUserId ? { authorUserId } : {}),
      bodyPlain: args.bodyPlain,
      mentions,
      createdAtIso: new Date().toISOString(),
    };
  }

  private demoMessagesForScope(projectManagementNumber: string): ProjectChatMessage[] {
    if (projectManagementNumber !== 'PRJ-2026-001') {
      return [];
    }
    const root1: ProjectChatMessage = {
      id: 'chat-seed-root-1',
      projectManagementNumber,
      threadId: null,
      parentId: null,
      authorName: '鈴木一郎',
      authorUserId: 'suzuki@example.com',
      bodyPlain: '認証まわりの仕様、@高橋健 さんレビューお願いします。',
      mentions: [{ displayName: '高橋健' }],
      createdAtIso: '2026-05-10T02:00:00.000Z',
    };
    const root2: ProjectChatMessage = {
      id: 'chat-seed-root-2',
      projectManagementNumber,
      threadId: null,
      parentId: null,
      authorName: '高橋健',
      authorUserId: 'takahashi@example.com',
      bodyPlain: 'β版のデプロイ日、調整中です。',
      mentions: [],
      createdAtIso: '2026-05-10T06:30:00.000Z',
    };
    const reply1: ProjectChatMessage = {
      id: 'chat-seed-reply-1',
      projectManagementNumber,
      threadId: root1.id,
      parentId: root1.id,
      authorName: '高橋健',
      authorUserId: 'takahashi@example.com',
      bodyPlain: '承知しました。午後にコメント返します。',
      mentions: [],
      createdAtIso: '2026-05-10T03:15:00.000Z',
    };
    return [root1, root2, reply1];
  }
}
