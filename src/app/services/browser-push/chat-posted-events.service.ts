import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

import type { ChatMessageForNotification } from '../dashboard/dashboard-chat-query';

export interface TaskChatPostedEvent {
  scopeId: string;
  message: ChatMessageForNotification & { taskManagementNo: string };
  scopeMessages: readonly ChatMessageForNotification[];
}

export interface ProjectChatPostedEvent {
  scopeId: string;
  message: ChatMessageForNotification & { projectManagementNumber: string };
  scopeMessages: readonly ChatMessageForNotification[];
}

/**
 * チャット投稿と Push 配信の結合点（TaskChat ↔ Dispatcher の循環依存を避ける）。
 */
@Injectable({
  providedIn: 'root',
})
export class ChatPostedEventsService {
  private readonly taskPosted$ = new Subject<TaskChatPostedEvent>();
  private readonly projectPosted$ = new Subject<ProjectChatPostedEvent>();

  emitTaskPosted(event: TaskChatPostedEvent): void {
    this.taskPosted$.next(event);
  }

  emitProjectPosted(event: ProjectChatPostedEvent): void {
    this.projectPosted$.next(event);
  }

  onTaskPosted() {
    return this.taskPosted$.asObservable();
  }

  onProjectPosted() {
    return this.projectPosted$.asObservable();
  }
}
