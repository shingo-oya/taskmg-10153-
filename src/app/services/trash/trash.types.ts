import type { ProjectRow } from '../../components/project-list/project-row';
import type { TaskRow } from '../../components/task-list/task-row';
import type { ProjectChatMessage } from '../project-chat-service/project-chat.types';
import type { TaskChatMessage } from '../task-chat-service/task-chat.types';

/** アーカイブ（復元のみ）とゴミ箱（削除退避・完全削除可） */
export type RetentionBucket = 'archive' | 'trash';

export interface TrashProjectEntry {
  deletedAt: string;
  deletedBy: string;
  project: ProjectRow;
  linkedTasks: TaskRow[];
  projectChatMessages: ProjectChatMessage[];
  taskChatMessagesByTaskNo: Record<string, TaskChatMessage[]>;
}

export interface TrashTaskEntry {
  deletedAt: string;
  deletedBy: string;
  task: TaskRow;
  chatMessages: TaskChatMessage[];
}
