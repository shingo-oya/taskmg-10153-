import { effect, inject, Injectable, signal } from '@angular/core';

import { ProjectChatService } from '../project-chat-service/project-chat-service';
import { ProjectService } from '../project-service/project-service';
import { TaskChatService } from '../task-chat-service/task-chat-service';
import { TaskService } from '../task-service/task-service';

/**
 * マイページ向け: チャット通知・プロジェクト/課題の更新通知のみリアルタイム同期。
 */
@Injectable({
  providedIn: 'root',
})
export class DashboardRealtimeService {
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  private readonly projectChat = inject(ProjectChatService);
  private readonly taskChat = inject(TaskChatService);

  readonly tick = signal(0);

  /** マイページ表示中のみ true（effect は constructor で Injection Context 内に登録） */
  private readonly active = signal(false);

  private stopUpdateWatch: (() => void) | null = null;

  constructor() {
    effect(
      () => {
        if (!this.active()) {
          return;
        }
        this.projectService.projectRows();
        this.taskService.taskRows();
        this.projectService.updateNotificationsTick();
        this.taskService.updateNotificationsTick();
        this.projectChat.chatChanged();
        this.taskChat.chatChanged();
        this.syncChatScopes();
        this.bump();
      },
      { allowSignalWrites: true },
    );
  }

  async start(): Promise<void> {
    if (this.active()) {
      return;
    }

    await Promise.all([this.projectService.ensureLoaded(), this.taskService.ensureLoaded()]);

    const releaseProject = this.projectService.acquireUpdateNotificationsWatch();
    const releaseTask = this.taskService.acquireUpdateNotificationsWatch();
    this.stopUpdateWatch = () => {
      releaseProject();
      releaseTask();
    };

    this.active.set(true);
  }

  stop(): void {
    if (!this.active()) {
      return;
    }
    this.active.set(false);
    this.stopUpdateWatch?.();
    this.stopUpdateWatch = null;
    this.projectChat.releaseAllDashboardScopeWatches();
    this.taskChat.releaseAllDashboardScopeWatches();
  }

  private syncChatScopes(): void {
    const projectIds = this.projectService.getProjectRows().map((p) => p.managementNumber);
    const taskIds = this.taskService.getTaskRows().map((t) => t.managementNo);
    this.projectChat.syncDashboardScopeWatches(projectIds);
    this.taskChat.syncDashboardScopeWatches(taskIds);
  }

  private bump(): void {
    this.tick.update((n) => n + 1);
  }
}
