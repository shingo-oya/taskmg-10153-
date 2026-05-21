export type FilterScreenId =
  | 'project-list'
  | 'project-calendar'
  | 'task-list'
  | 'task-kanban'
  | 'task-gantt'
  | 'task-calendar'
  | 'users';

export interface ProjectFilterSnapshot {
  kind: 'project';
  departments: string[];
  members: string[];
  endDateFrom: string;
  endDateTo: string;
  priorities: string[];
  statuses: string[];
}

export interface TaskFilterSnapshot {
  kind: 'task';
  types: string[];
  departments: string[];
  members: string[];
  endDateFrom: string;
  endDateTo: string;
  priorities: string[];
  statuses: string[];
}

export interface UsersFilterSnapshot {
  kind: 'users';
  departments: string[];
  roles: string[];
  statuses: string[];
}

export type FilterSnapshot = ProjectFilterSnapshot | TaskFilterSnapshot | UsersFilterSnapshot;

export interface SavedFilterPreset {
  id: string;
  name: string;
  screen: FilterScreenId;
  snapshot: FilterSnapshot;
  createdAt: string;
}
