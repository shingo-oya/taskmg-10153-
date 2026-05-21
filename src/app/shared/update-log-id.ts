/** 更新履歴1件分の既読・ダッシュボード用安定 ID */
export interface UpdateLogIdentifiable {
  logId?: string;
  at: string;
  by: string;
  summary?: string;
  changes?: readonly unknown[];
}

export function createUpdateLogId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ul-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** 履歴の先頭追加でも変わらないダッシュボード更新通知 ID */
export function dashboardUpdateItemId(
  kind: 'task' | 'project',
  scopeId: string,
  entry: UpdateLogIdentifiable,
): string {
  const scope = scopeId.trim();
  const logId = entry.logId?.trim();
  if (logId) {
    return `update:${kind}:${scope}:${logId}`;
  }
  return `update:${kind}:${scope}:${hashUpdateLogEntry(entry)}`;
}

function hashUpdateLogEntry(entry: UpdateLogIdentifiable): string {
  const payload = JSON.stringify({
    at: entry.at,
    by: entry.by,
    summary: entry.summary ?? null,
    changes: entry.changes ?? null,
  });
  let h = 5381;
  for (let i = 0; i < payload.length; i++) {
    h = ((h << 5) + h) ^ payload.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

export function withUpdateLogId<T extends UpdateLogIdentifiable>(entry: T): T & { logId: string } {
  if (entry.logId?.trim()) {
    return entry as T & { logId: string };
  }
  return { ...entry, logId: createUpdateLogId() };
}
