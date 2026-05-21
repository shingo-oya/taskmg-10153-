/** Firestore `users/{uid}/chatReadCursor/{cursorId}` */
export interface FirestoreChatReadCursor {
  kind: 'task' | 'project';
  scopeId: string;
  lastReadAtIso: string;
}

export const CHAT_READ_CURSOR_COLLECTION = 'chatReadCursor';

export function chatReadCursorDocId(kind: 'task' | 'project', scopeId: string): string {
  return `${kind}_${scopeId.trim()}`;
}

export function chatScopeKey(kind: 'task' | 'project', scopeId: string): string {
  return chatReadCursorDocId(kind, scopeId);
}

export function parseChatScopeKey(
  key: string,
): { kind: 'task' | 'project'; scopeId: string } | null {
  const i = key.indexOf('_');
  if (i <= 0) {
    return null;
  }
  const kind = key.slice(0, i);
  if (kind !== 'task' && kind !== 'project') {
    return null;
  }
  const scopeId = key.slice(i + 1).trim();
  if (!scopeId) {
    return null;
  }
  return { kind, scopeId };
}

/** ISO 文字列の大小比較で最新の createdAtIso を返す */
export function maxCreatedAtIso(messages: readonly { createdAtIso: string }[]): string | null {
  let max = '';
  for (const m of messages) {
    const t = m.createdAtIso.trim();
    if (t && t.localeCompare(max, 'en') > 0) {
      max = t;
    }
  }
  return max || null;
}
