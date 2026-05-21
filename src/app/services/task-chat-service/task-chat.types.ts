/** 課題チャット用（プロジェクトチャットと同形の独立ストア） */

export type TaskChatThreadId = string;

export interface TaskChatMention {
  displayName: string;
}

export interface TaskChatMessage {
  id: string;
  /** 課題管理番号（例: TK-2026-001） */
  taskManagementNo: string;
  threadId: TaskChatThreadId | null;
  parentId: string | null;
  authorName: string;
  authorUserId?: string;
  bodyPlain: string;
  mentions: readonly TaskChatMention[];
  createdAtIso: string;
}
