import { inject, Injectable, signal } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';

import { resolveChatMentions } from '../../shared/chat-mentions';
import { ChatFirestoreService } from '../chat-firestore/chat-firestore.service';
import { ChatPostedEventsService } from '../browser-push/chat-posted-events.service';
import { environment } from '../../../environments/environment';
import type { TaskChatMessage, TaskChatMention, TaskChatThreadId } from './task-chat.types';

function newChatId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tchat-${crypto.randomUUID()}`;
  }
  return `tchat-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

@Injectable({
  providedIn: 'root',
})
export class TaskChatService {
  private readonly chatPosted = inject(ChatPostedEventsService);
  private readonly chatFirestore = inject(ChatFirestoreService);

  private readonly byTask = new Map<string, TaskChatMessage[]>();
  private globalLoadPromise: Promise<void> | null = null;
  private readonly scopeLoadPromises = new Map<string, Promise<void>>();
  private readonly scopeWatchRefCounts = new Map<string, number>();
  private readonly scopeWatchUnsubs = new Map<string, Unsubscribe>();
  private readonly dashboardScopeIds = new Set<string>();

  readonly chatChanged = signal(0);

  getRootMessages(taskManagementNo: string): TaskChatMessage[] {
    const rows = this.byTask.get(taskManagementNo) ?? [];
    return rows
      .filter((m) => m.threadId === null && m.parentId === null)
      .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
  }

  getThreadReplies(taskManagementNo: string, threadRootId: TaskChatThreadId): TaskChatMessage[] {
    const rows = this.byTask.get(taskManagementNo) ?? [];
    return rows
      .filter((m) => m.threadId === threadRootId && m.id !== threadRootId)
      .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
  }

  countThreadReplies(taskManagementNo: string, threadRootId: TaskChatThreadId): number {
    return this.getThreadReplies(taskManagementNo, threadRootId).length;
  }

  listAllMessages(): TaskChatMessage[] {
    const out: TaskChatMessage[] = [];
    for (const rows of this.byTask.values()) {
      out.push(...rows);
    }
    return out;
  }

  getMessagesForScope(taskManagementNo: string): TaskChatMessage[] {
    return [...(this.byTask.get(taskManagementNo.trim()) ?? [])];
  }

  /** ダッシュボード用: 全課題チャットを Firestore から読み込む */
  ensureGlobalLoaded(): Promise<void> {
    if (this.globalLoadPromise) {
      return this.globalLoadPromise;
    }
    this.globalLoadPromise = this.loadAllFromFirestore().finally(() => {
      this.globalLoadPromise = null;
    });
    return this.globalLoadPromise;
  }

  /** 詳細画面用: 指定課題のチャットを読み込む */
  acquireScopeWatch(taskManagementNo: string): () => void {
    const id = taskManagementNo.trim();
    if (!id) {
      return () => {};
    }
    void this.ensureScopeLoaded(id);
    const next = (this.scopeWatchRefCounts.get(id) ?? 0) + 1;
    this.scopeWatchRefCounts.set(id, next);
    if (next === 1) {
      const unsub = this.chatFirestore.listenTaskMessages(id, (messages) => {
        this.byTask.set(id, messages);
        this.bumpChatChanged();
      });
      this.scopeWatchUnsubs.set(id, unsub);
    }
    return () => this.releaseScopeWatch(id);
  }

  syncDashboardScopeWatches(taskIds: readonly string[]): void {
    const next = new Set(taskIds.map((x) => x.trim()).filter(Boolean));
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

  private releaseScopeWatch(taskManagementNo: string): void {
    const id = taskManagementNo.trim();
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

  ensureScopeLoaded(taskManagementNo: string): Promise<void> {
    const id = taskManagementNo.trim();
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
    taskManagementNo: string,
    authorName: string,
    bodyPlain: string,
    knownDisplayNames: readonly string[],
    authorUserId?: string,
  ): TaskChatMessage {
    const msg = this.buildMessage(taskManagementNo, {
      threadId: null,
      parentId: null,
      authorName,
      bodyPlain,
      knownDisplayNames,
      authorUserId,
    });
    this.append(taskManagementNo, msg);
    return msg;
  }

  postThreadReply(
    taskManagementNo: string,
    threadRootId: TaskChatThreadId,
    parentId: string,
    authorName: string,
    bodyPlain: string,
    knownDisplayNames: readonly string[],
    authorUserId?: string,
  ): TaskChatMessage | null {
    const rows = this.byTask.get(taskManagementNo) ?? [];
    const root = rows.find((m) => m.id === threadRootId && m.threadId === null && m.parentId === null);
    if (!root) {
      return null;
    }
    const parent = rows.find((m) => m.id === parentId);
    if (!parent) {
      return null;
    }
    const parentInThread =
      (parent.threadId === null && parent.id === threadRootId) || parent.threadId === threadRootId;
    if (!parentInThread) {
      return null;
    }
    const msg = this.buildMessage(taskManagementNo, {
      threadId: threadRootId,
      parentId,
      authorName,
      bodyPlain,
      knownDisplayNames,
      authorUserId,
    });
    this.append(taskManagementNo, msg);
    return msg;
  }

  takeMessages(taskManagementNo: string): TaskChatMessage[] {
    const id = taskManagementNo.trim();
    const msgs = [...(this.byTask.get(id) ?? [])];
    this.byTask.delete(id);
    void this.chatFirestore.deleteAllTaskMessages(id);
    return msgs;
  }

  restoreMessages(taskManagementNo: string, messages: readonly TaskChatMessage[]): void {
    const id = taskManagementNo.trim();
    if (messages.length === 0) {
      this.byTask.delete(id);
      void this.chatFirestore.deleteAllTaskMessages(id);
      return;
    }
    this.byTask.set(id, [...messages]);
    void this.chatFirestore.restoreTaskMessages(id, messages);
  }

  private async loadAllFromFirestore(): Promise<void> {
    const all = await this.chatFirestore.listAllTaskMessages();
    this.byTask.clear();
    for (const msg of all) {
      const scope = msg.taskManagementNo.trim();
      const cur = this.byTask.get(scope) ?? [];
      cur.push(msg);
      this.byTask.set(scope, cur);
    }
  }

  private async loadScope(taskManagementNo: string): Promise<void> {
    if (this.byTask.has(taskManagementNo)) {
      return;
    }
    let rows = await this.chatFirestore.listTaskMessages(taskManagementNo);
    if (rows.length === 0 && environment.seedDemoChat) {
      const seeded = this.demoMessagesForScope(taskManagementNo);
      if (seeded.length > 0) {
        for (const msg of seeded) {
          await this.chatFirestore.setTaskMessage(taskManagementNo, msg);
        }
        rows = seeded;
      }
    }
    this.byTask.set(taskManagementNo, rows);
  }

  private append(taskManagementNo: string, msg: TaskChatMessage): void {
    const cur = this.byTask.get(taskManagementNo) ?? [];
    const next = [...cur, msg];
    this.byTask.set(taskManagementNo, next);
    this.bumpChatChanged();
    void this.chatFirestore.setTaskMessage(taskManagementNo, msg);
    this.chatPosted.emitTaskPosted({
      scopeId: taskManagementNo,
      message: msg,
      scopeMessages: next,
    });
  }

  private bumpChatChanged(): void {
    this.chatChanged.update((n) => n + 1);
  }

  private buildMessage(
    taskManagementNo: string,
    args: {
      threadId: TaskChatThreadId | null;
      parentId: string | null;
      authorName: string;
      bodyPlain: string;
      knownDisplayNames: readonly string[];
      authorUserId?: string;
    },
  ): TaskChatMessage {
    const mentions = resolveChatMentions(args.bodyPlain, args.knownDisplayNames);
    const authorUserId = args.authorUserId?.trim();
    return {
      id: newChatId(),
      taskManagementNo,
      threadId: args.threadId,
      parentId: args.parentId,
      authorName: args.authorName.trim(),
      ...(authorUserId ? { authorUserId } : {}),
      bodyPlain: args.bodyPlain,
      mentions,
      createdAtIso: new Date().toISOString(),
    };
  }

  private demoMessagesForScope(taskManagementNo: string): TaskChatMessage[] {
    if (taskManagementNo !== 'TK-2026-001') {
      return [];
    }
    const root1: TaskChatMessage = {
      id: 'tchat-seed-root-1',
      taskManagementNo,
      threadId: null,
      parentId: null,
      authorName: '山田太郎',
      authorUserId: 'yamada@example.com',
      bodyPlain: 'レビュー観点、@橋本拓海 さんにも共有お願いします。',
      mentions: [{ displayName: '橋本拓海' }],
      createdAtIso: '2026-05-09T01:00:00.000Z',
    };
    const reply1: TaskChatMessage = {
      id: 'tchat-seed-reply-1',
      taskManagementNo,
      threadId: root1.id,
      parentId: root1.id,
      authorName: '橋本拓海',
      authorUserId: 'hashimoto@example.com',
      bodyPlain: '承知です。明日までにコメント入れます。',
      mentions: [],
      createdAtIso: '2026-05-09T02:30:00.000Z',
    };
    return [root1, reply1];
  }
}
