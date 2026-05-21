/**
 * プロジェクトチャット用の型定義。
 * 本番では API の DTO とマッピングしやすいよう、プレーンなフィールドのみにしています。
 */

/** Slack の thread_ts に相当。スレッド内の全メッセージで共通（= ルートメッセージの id） */
export type ProjectChatThreadId = string;

export interface ProjectChatMention {
  /** 本番では userId / email 等に差し替え推奨 */
  displayName: string;
}

export interface ProjectChatMessage {
  id: string;
  projectManagementNumber: string;
  /** メインタイムライン: null。スレッド内: ルートメッセージの id */
  threadId: ProjectChatThreadId | null;
  /** 返信先。ルートへの返信ならルート id と同じ */
  parentId: string | null;
  authorName: string;
  /** 発言者のユーザー id（ログインアカウント）。本番 API の投稿者 id と対応 */
  authorUserId?: string;
  /** ユーザー入力そのまま */
  bodyPlain: string;
  mentions: readonly ProjectChatMention[];
  /** ISO 8601 */
  createdAtIso: string;
}
