import { inject, Injectable } from '@angular/core';

import { ProjectService } from '../project-service/project-service';
import { ProjectChatService } from '../project-chat-service/project-chat-service';
import { TaskChatService } from '../task-chat-service/task-chat-service';
import { TaskService } from '../task-service/task-service';
import {
  buildChatNotificationItem,
  classifyChatNotification,
  type ChatMessageForNotification,
} from './dashboard-chat-query';
import { ChatReadCursorService } from './chat-read-cursor.service';
import { DashboardReadStateService } from './dashboard-read-state.service';
import {
  buildProjectUpdateItems,
  buildTaskUpdateItems,
  filterApproverReviewPending,
  filterMyReviewPendingAsAssignee,
  filterMyTasksDue,
  todayIsoDate,
} from './dashboard-query';
import type { DashboardChatNotificationItem, DashboardUpdateItem, MyDashboardSnapshot } from './dashboard.types';

const UPDATE_LIMIT = 30;

@Injectable({
  providedIn: 'root',
})
export class MyDashboardService {
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly taskChat = inject(TaskChatService);
  private readonly projectChat = inject(ProjectChatService);
  private readonly readState = inject(DashboardReadStateService);
  private readonly chatReadCursor = inject(ChatReadCursorService);

  buildSnapshot(displayName: string, userId: string): MyDashboardSnapshot {
    const me = displayName.trim();
    const today = todayIsoDate();
    const tasks = this.taskService.getTaskRows();
    const projects = this.projectService.getProjectRows();
    const taskByNo = new Map(tasks.map((t) => [t.managementNo, t] as const));
    const projectByMn = new Map(projects.map((p) => [p.managementNumber, p] as const));

    const taskUpdates = buildTaskUpdateItems(tasks, me);
    const projectUpdates = buildProjectUpdateItems(projects, me);
    const updates = mergeUpdates(taskUpdates, projectUpdates, UPDATE_LIMIT);
    const chatNotifications = this.collectChatNotifications(me, userId, taskByNo, projectByMn);
    const uid = userId.trim();

    return {
      displayName: me,
      today,
      chatNotifications: this.applyChatReadFlags(chatNotifications),
      updates: this.applyUpdateReadFlags(updates, uid),
      dueToday: filterMyTasksDue(tasks, me, today, 'today'),
      dueSoon: filterMyTasksDue(tasks, me, today, 'soon'),
      overdue: filterMyTasksDue(tasks, me, today, 'overdue'),
      myReviewPending: filterMyReviewPendingAsAssignee(tasks, me),
      approverReviewPending: filterApproverReviewPending(tasks, me),
    };
  }

  private collectChatNotifications(
    meDisplayName: string,
    meUserId: string,
    taskByNo: Map<string, { taskname: string; managementNo: string }>,
    projectByMn: Map<string, { name: string; managementNumber: string }>,
  ): DashboardChatNotificationItem[] {
    const me = meDisplayName.trim();
    if (!me && !meUserId.trim()) {
      return [];
    }

    const items: DashboardChatNotificationItem[] = [];

    const taskMessages = this.taskChat.listAllMessages();
    const taskById = indexMessages(taskMessages);
    for (const msg of taskMessages) {
      const kind = classifyChatNotification(msg, me, meUserId, taskById);
      if (!kind) {
        continue;
      }
      const task = taskByNo.get(msg.taskManagementNo);
      items.push(
        buildChatNotificationItem(
          'task',
          msg.taskManagementNo,
          task?.taskname ?? msg.taskManagementNo,
          msg,
          kind,
        ),
      );
    }

    const projectMessages = this.projectChat.listAllMessages();
    const projectById = indexMessages(projectMessages);
    for (const msg of projectMessages) {
      const kind = classifyChatNotification(msg, me, meUserId, projectById);
      if (!kind) {
        continue;
      }
      const proj = projectByMn.get(msg.projectManagementNumber);
      items.push(
        buildChatNotificationItem(
          'project',
          msg.projectManagementNumber,
          proj?.name ?? msg.projectManagementNumber,
          msg,
          kind,
        ),
      );
    }

    return items.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  }

  private applyChatReadFlags(items: DashboardChatNotificationItem[]): DashboardChatNotificationItem[] {
    this.chatReadCursor.cursorRevision();
    return items.map((item) => ({
      ...item,
      read: this.chatReadCursor.isChatMessageRead(item.kind, item.scopeId, item.createdAtIso),
    }));
  }

  private applyUpdateReadFlags(
    items: DashboardUpdateItem[],
    userId: string,
  ): DashboardUpdateItem[] {
    this.readState.readRevision();
    if (!userId) {
      return items.map((item) => ({ ...item, read: false }));
    }
    return items.map((item) => ({
      ...item,
      read: this.readState.isUpdateRead(userId, item.kind, item.scopeId, item.at),
    }));
  }
}

function indexMessages(
  messages: readonly ChatMessageForNotification[],
): Map<string, ChatMessageForNotification> {
  return new Map(messages.map((m) => [m.id, m] as const));
}

function mergeUpdates(
  taskItems: DashboardUpdateItem[],
  projectItems: DashboardUpdateItem[],
  limit: number,
): DashboardUpdateItem[] {
  return [...taskItems, ...projectItems]
    .sort((a, b) => {
      const d = b.at.localeCompare(a.at, 'ja');
      if (d !== 0) {
        return d;
      }
      return a.scopeLabel.localeCompare(b.scopeLabel, 'ja');
    })
    .slice(0, limit);
}
