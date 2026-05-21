import type { WritableSignal } from '@angular/core';

import type {
  ProjectFilterSnapshot,
  TaskFilterSnapshot,
  UsersFilterSnapshot,
} from './list-filter.types';

export interface ProjectAppliedSignals {
  departments: WritableSignal<Set<string>>;
  members: WritableSignal<Set<string>>;
  endDateFrom: WritableSignal<string>;
  endDateTo: WritableSignal<string>;
  priorities: WritableSignal<Set<string>>;
  statuses: WritableSignal<Set<string>>;
}

export interface TaskAppliedSignals {
  types: WritableSignal<Set<string>>;
  departments: WritableSignal<Set<string>>;
  members: WritableSignal<Set<string>>;
  endDateFrom: WritableSignal<string>;
  endDateTo: WritableSignal<string>;
  priorities: WritableSignal<Set<string>>;
  statuses: WritableSignal<Set<string>>;
}

export interface UsersAppliedSignals {
  departments: WritableSignal<Set<string>>;
  roles: WritableSignal<Set<string>>;
  statuses: WritableSignal<Set<string>>;
}

function setFromArray(sig: WritableSignal<Set<string>>, values: string[]): void {
  sig.set(new Set(values));
}

export function readProjectFilterSnapshot(applied: ProjectAppliedSignals): ProjectFilterSnapshot {
  return {
    kind: 'project',
    departments: [...applied.departments()],
    members: [...applied.members()],
    endDateFrom: applied.endDateFrom(),
    endDateTo: applied.endDateTo(),
    priorities: [...applied.priorities()],
    statuses: [...applied.statuses()],
  };
}

export function applyProjectFilterSnapshot(
  snapshot: ProjectFilterSnapshot,
  applied: ProjectAppliedSignals,
): void {
  setFromArray(applied.departments, snapshot.departments);
  setFromArray(applied.members, snapshot.members);
  applied.endDateFrom.set(snapshot.endDateFrom);
  applied.endDateTo.set(snapshot.endDateTo);
  setFromArray(applied.priorities, snapshot.priorities);
  setFromArray(applied.statuses, snapshot.statuses);
}

export function readTaskFilterSnapshot(applied: TaskAppliedSignals): TaskFilterSnapshot {
  return {
    kind: 'task',
    types: [...applied.types()],
    departments: [...applied.departments()],
    members: [...applied.members()],
    endDateFrom: applied.endDateFrom(),
    endDateTo: applied.endDateTo(),
    priorities: [...applied.priorities()],
    statuses: [...applied.statuses()],
  };
}

export function applyTaskFilterSnapshot(snapshot: TaskFilterSnapshot, applied: TaskAppliedSignals): void {
  setFromArray(applied.types, snapshot.types);
  setFromArray(applied.departments, snapshot.departments);
  setFromArray(applied.members, snapshot.members);
  applied.endDateFrom.set(snapshot.endDateFrom);
  applied.endDateTo.set(snapshot.endDateTo);
  setFromArray(applied.priorities, snapshot.priorities);
  setFromArray(applied.statuses, snapshot.statuses);
}

export function readUsersFilterSnapshot(applied: UsersAppliedSignals): UsersFilterSnapshot {
  return {
    kind: 'users',
    departments: [...applied.departments()],
    roles: [...applied.roles()],
    statuses: [...applied.statuses()],
  };
}

export function applyUsersFilterSnapshot(
  snapshot: UsersFilterSnapshot,
  applied: UsersAppliedSignals,
): void {
  setFromArray(applied.departments, snapshot.departments);
  setFromArray(applied.roles, snapshot.roles);
  setFromArray(applied.statuses, snapshot.statuses);
}

export function isProjectFilterSnapshot(v: unknown): v is ProjectFilterSnapshot {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as ProjectFilterSnapshot).kind === 'project' &&
    Array.isArray((v as ProjectFilterSnapshot).departments)
  );
}

export function isTaskFilterSnapshot(v: unknown): v is TaskFilterSnapshot {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as TaskFilterSnapshot).kind === 'task' &&
    Array.isArray((v as TaskFilterSnapshot).types)
  );
}

export function isUsersFilterSnapshot(v: unknown): v is UsersFilterSnapshot {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as UsersFilterSnapshot).kind === 'users' &&
    Array.isArray((v as UsersFilterSnapshot).departments)
  );
}
