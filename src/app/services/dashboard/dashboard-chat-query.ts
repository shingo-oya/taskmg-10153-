import {
  CHAT_FROM_DASHBOARD_QUERY,
  CHAT_FROM_DASHBOARD_VALUE,
} from '../../shared/chat-detail-read-ui';
import { isMentionedInBody } from '../../shared/chat-mentions';

import type { DashboardChatNotificationItem } from './dashboard.types';

export interface ChatMessageForNotification {
  id: string;
  threadId: string | null;
  parentId: string | null;
  authorName: string;
  authorUserId?: string;
  mentions: readonly { displayName: string }[];
  bodyPlain: string;
  createdAtIso: string;
}

export function chatNotificationItemId(kind: 'task' | 'project', messageId: string): string {
  return `chat:${kind}:${messageId.trim()}`;
}

/** 1件のメッセージで自分がメンションされているか */
export function isUserMentionedInMessage(
  msg: ChatMessageForNotification,
  meDisplayName: string,
): boolean {
  const me = meDisplayName.trim();
  if (!me) {
    return false;
  }
  if (msg.mentions.some((m) => m.displayName.trim() === me)) {
    return true;
  }
  return isMentionedInBody(msg.bodyPlain, me);
}

/** スレッド内の全メッセージ（ルート + 返信） */
export function getThreadMessages(
  threadRootId: string,
  byId: ReadonlyMap<string, ChatMessageForNotification>,
): ChatMessageForNotification[] {
  const root = threadRootId.trim();
  if (!root) {
    return [];
  }
  const out: ChatMessageForNotification[] = [];
  for (const m of byId.values()) {
    if (m.id === root || m.threadId === root) {
      out.push(m);
    }
  }
  return out;
}

/** スレッドのどこかで自分がメンションされていれば true */
export function isUserMentionedInThread(
  threadRootId: string,
  byId: ReadonlyMap<string, ChatMessageForNotification>,
  meDisplayName: string,
): boolean {
  return getThreadMessages(threadRootId, byId).some((m) => isUserMentionedInMessage(m, meDisplayName));
}

export function classifyChatNotification(
  msg: ChatMessageForNotification,
  meDisplayName: string,
  meUserId: string,
  byId: ReadonlyMap<string, ChatMessageForNotification>,
): 'mention' | 'reply' | null {
  if (isSelfAuthor(msg, meDisplayName, meUserId)) {
    return null;
  }

  if (isUserMentionedInMessage(msg, meDisplayName)) {
    return 'mention';
  }

  const threadRootId = msg.threadId?.trim();
  if (!threadRootId) {
    return null;
  }

  const parent = msg.parentId ? byId.get(msg.parentId) : undefined;
  const root = byId.get(threadRootId);
  if (parent && isSelfAuthor(parent, meDisplayName, meUserId)) {
    return 'reply';
  }
  if (root && isSelfAuthor(root, meDisplayName, meUserId)) {
    return 'reply';
  }
  if (isUserMentionedInThread(threadRootId, byId, meDisplayName)) {
    return 'reply';
  }

  return null;
}

function isSelfAuthor(
  msg: ChatMessageForNotification,
  meDisplayName: string,
  meUserId: string,
): boolean {
  const uid = meUserId.trim();
  const authorUid = msg.authorUserId?.trim();
  if (uid && authorUid && uid === authorUid) {
    return true;
  }
  const me = meDisplayName.trim();
  return !!me && msg.authorName.trim() === me;
}

export function buildChatNotificationItem(
  kind: 'task' | 'project',
  scopeId: string,
  scopeLabel: string,
  msg: ChatMessageForNotification,
  notificationKind: 'mention' | 'reply',
): DashboardChatNotificationItem {
  const threadRootId = msg.threadId;
  const queryParams: Record<string, string> = {
    chatMsg: msg.id,
    [CHAT_FROM_DASHBOARD_QUERY]: CHAT_FROM_DASHBOARD_VALUE,
  };
  if (threadRootId) {
    queryParams['chatThread'] = threadRootId;
  }
  const basePath = kind === 'task' ? '/tasks' : '/projects';
  return {
    id: chatNotificationItemId(kind, msg.id),
    notificationKind,
    kind,
    scopeId,
    scopeLabel,
    messageId: msg.id,
    threadRootId,
    authorName: msg.authorName,
    bodyPreview: truncate(msg.bodyPlain, 120),
    createdAtIso: msg.createdAtIso,
    routerLink: [basePath, scopeId],
    queryParams,
    read: false,
  };
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max)}…`;
}
