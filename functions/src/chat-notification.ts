export interface ChatMessageForNotification {
  id: string;
  threadId: string | null;
  parentId: string | null;
  authorName: string;
  authorUserId?: string;
  mentions: { displayName: string }[];
  bodyPlain: string;
  createdAtIso: string;
}

function isMentionedInBody(body: string, displayName: string): boolean {
  const n = displayName.trim();
  if (!n) {
    return false;
  }
  return body.includes(`@${n}`) || body.includes(`＠${n}`);
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

function isUserMentionedInMessage(msg: ChatMessageForNotification, meDisplayName: string): boolean {
  const me = meDisplayName.trim();
  if (!me) {
    return false;
  }
  if (msg.mentions.some((m) => m.displayName.trim() === me)) {
    return true;
  }
  return isMentionedInBody(msg.bodyPlain, me);
}

function getThreadMessages(
  threadRootId: string,
  byId: Map<string, ChatMessageForNotification>,
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

function isUserMentionedInThread(
  threadRootId: string,
  byId: Map<string, ChatMessageForNotification>,
  meDisplayName: string,
): boolean {
  return getThreadMessages(threadRootId, byId).some((m) => isUserMentionedInMessage(m, meDisplayName));
}

export function classifyChatNotification(
  msg: ChatMessageForNotification,
  meDisplayName: string,
  meUserId: string,
  byId: Map<string, ChatMessageForNotification>,
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

export function shouldNotifyForKind(
  prefs: { browserPushEnabled?: boolean; notifyMention?: boolean; notifyReply?: boolean } | undefined,
  kind: 'mention' | 'reply',
): boolean {
  if (!prefs?.browserPushEnabled) {
    return false;
  }
  if (kind === 'mention') {
    return prefs.notifyMention !== false;
  }
  return prefs.notifyReply !== false;
}
