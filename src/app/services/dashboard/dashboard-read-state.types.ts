/** Firestore `users/{uid}/dashboardReadState/{cursorId}` */
export interface FirestoreDashboardReadState {
  kind: 'task' | 'project';
  scopeId: string;
  lastReadAtIso: string;
}

export const DASHBOARD_READ_STATE_COLLECTION = 'dashboardReadState';

export function dashboardReadStateDocId(kind: 'task' | 'project', scopeId: string): string {
  return `${kind}_${scopeId.trim()}`;
}

export function dashboardUpdateScopeKey(kind: 'task' | 'project', scopeId: string): string {
  return dashboardReadStateDocId(kind, scopeId);
}

export function parseDashboardUpdateScopeKey(
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
