import { inject, Injectable, signal } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';

import type { TaskChatMessage } from '../task-chat-service/task-chat.types';
import { TaskChatService } from '../task-chat-service/task-chat-service';
import { TasksFirestoreService } from '../tasks-firestore/tasks-firestore.service';
import { TrashService } from '../trash/trash.service';

import type { ProjectResourceEntry, ProjectResourceFolder } from '../../components/project-list/project-row';
import type {
  TaskMultiFilterCriteria,
  TaskRow,
  TaskUpdateLog,
  TaskUpdateLogChange,
} from '../../components/task-list/task-row';
import {
  PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  TASK_TYPE_OPTIONS,
  taskMemberNames,
} from '../../components/task-list/task-row';
import { normalizeUpdateHistoryAt } from '../../shared/update-history-at';
import { withUpdateLogId } from '../../shared/update-log-id';
import {
  calculateDisplayedParentTaskProgress,
  isChildTask,
  isParentTask,
  tasksForParent,
  tasksForProject,
} from '../../shared/task-hierarchy';
import { currentYearInJapan } from '../../shared/japan-datetime';
import { environment } from '../../../environments/environment';
import { IssueTypeService } from '../issue-type/issue-type.service';
import { UsersService } from '../users-service/users-service';
import { TASK_SEED_ROWS_RAW } from './task-seed-data';

function newResourceId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private readonly usersService = inject(UsersService);
  private readonly issueTypeService = inject(IssueTypeService);
  private readonly trashService = inject(TrashService);
  private readonly taskChatService = inject(TaskChatService);
  private readonly tasksFirestore = inject(TasksFirestoreService);

  private readonly _rows = signal<TaskRow[]>([]);
  readonly taskRows = this._rows.asReadonly();
  readonly tasksLoaded = signal(false);
  readonly updateNotificationsTick = signal(0);

  private loadPromise: Promise<void> | null = null;
  private updateWatchRefCount = 0;
  private updateWatchUnsub: Unsubscribe | null = null;

  constructor() {
    void this.ensureLoaded();
  }

  ensureLoaded(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }
    this.loadPromise = this.refreshFromFirestore().finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  async refreshFromFirestore(): Promise<void> {
    if (environment.seedDemoTasks) {
      await this.tasksFirestore.seedIfEmpty(this.withSeededHierarchy(TASK_SEED_ROWS_RAW));
    }
    const items = await this.tasksFirestore.listAll();
    this._rows.set(
      items.map((r) => ({
        ...r,
        parentTaskManagementNo: r.parentTaskManagementNo ?? '',
      })),
    );
    this.tasksLoaded.set(true);
  }

  acquireUpdateNotificationsWatch(): () => void {
    this.updateWatchRefCount += 1;
    if (this.updateWatchRefCount === 1) {
      this.updateWatchUnsub = this.tasksFirestore.listenAll((items) => {
        this._rows.set(
          items.map((r) => ({
            ...r,
            parentTaskManagementNo: r.parentTaskManagementNo ?? '',
          })),
        );
        this.tasksLoaded.set(true);
        this.updateNotificationsTick.update((n) => n + 1);
      });
    }
    return () => this.releaseUpdateNotificationsWatch();
  }

  private releaseUpdateNotificationsWatch(): void {
    if (this.updateWatchRefCount <= 0) {
      return;
    }
    this.updateWatchRefCount -= 1;
    if (this.updateWatchRefCount === 0) {
      this.updateWatchUnsub?.();
      this.updateWatchUnsub = null;
    }
  }

  private withSeededHierarchy(rows: TaskRow[]): TaskRow[] {
    const normalized = rows.map((r) => ({
      ...r,
      parentTaskManagementNo: r.parentTaskManagementNo ?? '',
    }));
    const parentIdx = normalized.findIndex((r) => r.managementNo === 'TK-2026-001');
    if (parentIdx >= 0) {
      const children = tasksForParent(normalized, 'TK-2026-001');
      if (children.length > 0) {
        normalized[parentIdx] = {
          ...normalized[parentIdx],
          progressPercent: calculateDisplayedParentTaskProgress(normalized[parentIdx], normalized),
        };
      }
    }
    return normalized;
  }

  getTaskRows(): TaskRow[] {
    return this._rows().map((r) => ({
      ...r,
      parentTaskManagementNo: r.parentTaskManagementNo ?? '',
    }));
  }

  getChildTasks(parentTaskManagementNo: string): TaskRow[] {
    return tasksForParent(this.getTaskRows(), parentTaskManagementNo);
  }

  getTaskByManagementNo(managementNo: string): TaskRow | undefined {
    const id = managementNo.trim();
    return this._rows().find((r) => r.managementNo === id);
  }

  updateTask(
    managementNo: string,
    updates: Partial<TaskRow>,
    appendLog?: {
      at?: string;
      by?: string;
      summary?: string;
      changes?: TaskUpdateLogChange[];
    },
  ): boolean {
    const idx = this.findIndex(managementNo);
    if (idx < 0) {
      return false;
    }
    const cur = this._rows()[idx];
    const { updateHistory: historyOverride, ...rest } = updates;
    const mergedBase: TaskRow = { ...cur, ...rest };

    let updateHistory: TaskUpdateLog[];
    if (historyOverride !== undefined) {
      updateHistory = [...historyOverride];
    } else {
      updateHistory = [...(cur.updateHistory ?? [])];
      if (appendLog) {
        const at = normalizeUpdateHistoryAt(appendLog.at ?? mergedBase.lastUpdatedAt);
        const by = appendLog.by ?? mergedBase.lastUpdatedBy;
        const hasChanges = appendLog.changes != null && appendLog.changes.length > 0;
        const summary = appendLog.summary?.trim() ?? '';
        if (hasChanges) {
          updateHistory = [
            withUpdateLogId({ at, by, changes: [...appendLog.changes!] }),
            ...updateHistory,
          ];
        } else if (summary.length > 0) {
          updateHistory = [withUpdateLogId({ at, by, summary }), ...updateHistory];
        }
      }
    }

    const merged: TaskRow = {
      ...mergedBase,
      updateHistory,
    };
    if (updates.participants) {
      merged.members = [...new Set(updates.participants.map((p) => p.name))].join('、');
    }
    this.replaceAt(idx, merged);
    this.afterTaskMutation(merged);
    return true;
  }

  addTask(row: TaskRow): void {
    const normalized: TaskRow = {
      ...row,
      parentTaskManagementNo: row.parentTaskManagementNo?.trim() ?? '',
      resourceFolders: [...(row.resourceFolders ?? [])],
    };
    if (isChildTask(normalized)) {
      normalized.managementNumber = '';
      normalized.name = '';
    }
    this._rows.update((rows) => [...rows, normalized]);
    this.persistRow(normalized);
    this.afterTaskMutation(normalized);
  }

  syncParentProgressFromChildren(
    parentTaskManagementNo: string,
    rows: readonly TaskRow[] = this._rows(),
  ): void {
    const parentId = parentTaskManagementNo.trim();
    const idx = this.findIndex(parentId);
    if (idx < 0) {
      return;
    }
    const parent = rows[idx] ?? this._rows()[idx];
    const children = tasksForParent(rows, parentId);
    if (children.length === 0) {
      return;
    }
    const displayed = calculateDisplayedParentTaskProgress(parent, rows);
    const cur = this._rows()[idx];
    if (cur.progressPercent === displayed) {
      return;
    }
    this.replaceAt(idx, { ...cur, progressPercent: displayed });
  }

  private afterTaskMutation(task: TaskRow): void {
    const parentId = task.parentTaskManagementNo?.trim();
    if (parentId) {
      this.syncParentProgressFromChildren(parentId);
      return;
    }
    if (isParentTask(task)) {
      this.syncParentProgressFromChildren(task.managementNo);
    }
  }

  addResourceFolder(managementNo: string, name: string): boolean {
    const nameT = name.trim();
    if (!nameT) {
      return false;
    }
    const idx = this.findIndex(managementNo);
    if (idx < 0) {
      return false;
    }
    const cur = this._rows()[idx];
    const folder: ProjectResourceFolder = {
      id: newResourceId('fld'),
      name: nameT,
      entries: [],
    };
    const prev = cur.resourceFolders ?? [];
    this.replaceAt(idx, { ...cur, resourceFolders: [...prev, folder] });
    return true;
  }

  addResourceEntry(
    managementNo: string,
    folderId: string,
    entry: { kind: 'url' | 'file'; title: string; href: string },
  ): boolean {
    const titleT = entry.title.trim();
    if (!titleT) {
      return false;
    }
    if (entry.kind === 'url' && !entry.href.trim()) {
      return false;
    }
    if (entry.kind === 'file' && !entry.href.trim()) {
      return false;
    }
    const idx = this.findIndex(managementNo);
    if (idx < 0) {
      return false;
    }
    const cur = this._rows()[idx];
    const folders = cur.resourceFolders ?? [];
    if (!folders.some((f) => f.id === folderId)) {
      return false;
    }
    const hrefT = entry.href.trim();
    const newEntry: ProjectResourceEntry = {
      id: newResourceId('ent'),
      kind: entry.kind,
      title: titleT,
      href: hrefT,
    };
    const resourceFolders = folders.map((f) =>
      f.id === folderId ? { ...f, entries: [...f.entries, newEntry] } : f,
    );
    this.replaceAt(idx, { ...cur, resourceFolders });
    return true;
  }

  getDistinctTypes(): string[] {
    const set = new Set<string>();
    for (const t of this.issueTypeService.distinctContents()) {
      set.add(t);
    }
    for (const t of TASK_TYPE_OPTIONS) {
      set.add(t);
    }
    for (const r of this._rows()) {
      const trimmed = r.type.trim();
      if (trimmed) {
        set.add(trimmed);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  getDistinctDepartments(): string[] {
    const set = new Set<string>(this.usersService.getDepartmentOptions());
    for (const r of this._rows()) {
      for (const d of r.departments) {
        set.add(d);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  getDistinctMembers(): string[] {
    const set = new Set<string>();
    for (const row of this._rows()) {
      for (const m of taskMemberNames(row)) {
        set.add(m);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  getDistinctPriorities(): string[] {
    const fromData = new Set(this._rows().map((r) => r.priority));
    for (const p of PRIORITY_OPTIONS) {
      fromData.add(p);
    }
    return [...fromData].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  getDistinctStatuses(): string[] {
    const fromData = new Set(this._rows().map((r) => r.status));
    for (const s of TASK_STATUS_OPTIONS) {
      fromData.add(s);
    }
    return [...fromData].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  getAllDepartmentsForSelect(): string[] {
    return [...this.usersService.getDepartmentOptions()];
  }

  getStaffByDepartment(department: string): string[] {
    return this.usersService.getUserNamesByDepartment(department);
  }

  getRegisterPriorityOptions(): readonly string[] {
    return PRIORITY_OPTIONS;
  }

  getRegisterStatusOptions(): readonly string[] {
    return TASK_STATUS_OPTIONS;
  }

  getApproverOptions(): string[] {
    return this.usersService.getDistinctUserNames();
  }

  generateManagementNumber(): string {
    const year = currentYearInJapan();
    const prefix = `TK-${year}-`;
    let max = 0;
    const scan = (id: string) => {
      if (id.startsWith(prefix)) {
        const n = Number.parseInt(id.slice(prefix.length), 10);
        if (!Number.isNaN(n) && n > max) {
          max = n;
        }
      }
    };
    for (const r of this._rows()) {
      scan(r.managementNo);
    }
    for (const id of this.trashService.usedTaskNumbersForAllocation()) {
      scan(id);
    }
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
  }

  generateChildManagementNumber(parentManagementNo: string): string {
    const parentId = parentManagementNo.trim();
    if (!parentId) {
      return this.generateManagementNumber();
    }
    const childPrefix = `${parentId}-S`;
    let maxSuffix = 0;
    const scanChildSuffix = (id: string): void => {
      if (!id.startsWith(childPrefix)) {
        return;
      }
      const suffix = id.slice(childPrefix.length);
      if (!/^\d+$/.test(suffix)) {
        return;
      }
      const n = Number.parseInt(suffix, 10);
      if (!Number.isNaN(n) && n > maxSuffix) {
        maxSuffix = n;
      }
    };
    for (const r of this._rows()) {
      scanChildSuffix(r.managementNo);
    }
    for (const id of this.trashService.usedTaskNumbersForAllocation()) {
      scanChildSuffix(id);
    }
    return `${childPrefix}${maxSuffix + 1}`;
  }

  isTaskNumberAvailable(managementNo: string): boolean {
    const id = managementNo.trim();
    if (!id) {
      return false;
    }
    if (this._rows().some((r) => r.managementNo === id)) {
      return false;
    }
    return !this.trashService.isTaskNumberUsed(id);
  }

  extractTasksForProject(projectManagementNumber: string): {
    tasks: TaskRow[];
    chatsByTaskNo: Record<string, TaskChatMessage[]>;
  } {
    const pmn = projectManagementNumber.trim();
    const all = this.getTaskRows();
    const parentIds = new Set(tasksForProject(all, pmn).map((p) => p.managementNo));
    const taskIds = new Set<string>(parentIds);
    for (const parentId of parentIds) {
      for (const c of tasksForParent(all, parentId)) {
        taskIds.add(c.managementNo);
      }
    }
    const tasks: TaskRow[] = [];
    const chatsByTaskNo: Record<string, TaskChatMessage[]> = {};
    const toRemove = new Set<string>();
    for (const row of this._rows()) {
      if (!taskIds.has(row.managementNo)) {
        continue;
      }
      tasks.push({
        ...row,
        resourceFolders: [...(row.resourceFolders ?? [])],
      });
      chatsByTaskNo[row.managementNo] = this.taskChatService.takeMessages(row.managementNo);
      toRemove.add(row.managementNo);
    }
    if (toRemove.size > 0) {
      this._rows.update((rows) => rows.filter((r) => !toRemove.has(r.managementNo)));
      for (const id of toRemove) {
        this.persistDelete(id);
      }
    }
    return { tasks, chatsByTaskNo };
  }

  insertTaskRows(
    rows: readonly TaskRow[],
    chatsByTaskNo: Record<string, readonly TaskChatMessage[]>,
  ): void {
    for (const row of rows) {
      const normalized: TaskRow = {
        ...row,
        resourceFolders: [...(row.resourceFolders ?? [])],
        updateHistory: [...(row.updateHistory ?? [])],
        parentTaskManagementNo: row.parentTaskManagementNo?.trim() ?? '',
      };
      this._rows.update((current) => [...current, normalized]);
      this.persistRow(normalized);
      const chats = chatsByTaskNo[row.managementNo] ?? [];
      this.taskChatService.restoreMessages(row.managementNo, chats);
    }
  }

  archiveTask(
    managementNo: string,
    archivedBy: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'invalidActor' } {
    return this.moveTaskToRetention('archive', managementNo, archivedBy);
  }

  softDeleteTask(
    managementNo: string,
    deletedBy: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'invalidActor' } {
    return this.moveTaskToRetention('trash', managementNo, deletedBy);
  }

  restoreTaskFromArchive(
    managementNo: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'numberInUse' } {
    return this.restoreTaskFromRetention('archive', managementNo);
  }

  restoreTaskFromTrash(
    managementNo: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'numberInUse' } {
    return this.restoreTaskFromRetention('trash', managementNo);
  }

  purgeTaskFromTrash(managementNo: string): { ok: true } | { ok: false; reason: 'notFound' } {
    const id = managementNo.trim();
    const entry = this.trashService.removeTaskEntry('trash', id);
    if (!entry) {
      return { ok: false, reason: 'notFound' };
    }
    this.trashService.reserveTaskNumber(entry.task.managementNo);
    return { ok: true };
  }

  filterTasks(rows: TaskRow[], c: TaskMultiFilterCriteria): TaskRow[] {
    const from = c.endDateFrom.trim();
    const to = c.endDateTo.trim();
    let rangeLo = from;
    let rangeHi = to;
    if (from && to && from > to) {
      rangeLo = to;
      rangeHi = from;
    }

    return rows.filter((row) => {
      if (c.types.size > 0 && !c.types.has(row.type)) {
        return false;
      }
      if (c.departments.size > 0 && !row.departments.some((d) => c.departments.has(d))) {
        return false;
      }
      if (c.members.size > 0 && !taskMemberNames(row).some((m) => c.members.has(m))) {
        return false;
      }
      if (rangeLo && row.endDate < rangeLo) {
        return false;
      }
      if (rangeHi && row.endDate > rangeHi) {
        return false;
      }
      if (c.priorities.size > 0 && !c.priorities.has(row.priority)) {
        return false;
      }
      if (c.statuses.size > 0 && !c.statuses.has(row.status)) {
        return false;
      }
      return true;
    });
  }

  private findIndex(managementNo: string): number {
    const id = managementNo.trim();
    return this._rows().findIndex((r) => r.managementNo === id);
  }

  private replaceAt(index: number, row: TaskRow): void {
    this._rows.update((rows) => {
      const next = [...rows];
      next[index] = row;
      return next;
    });
    this.persistRow(row);
  }

  private removeAt(index: number): void {
    const id = this._rows()[index].managementNo;
    this._rows.update((rows) => {
      const next = [...rows];
      next.splice(index, 1);
      return next;
    });
    this.persistDelete(id);
  }

  private persistRow(row: TaskRow): void {
    void this.tasksFirestore.setTask(row).catch(() => void this.refreshFromFirestore());
  }

  private persistDelete(managementNo: string): void {
    void this.tasksFirestore.deleteTask(managementNo).catch(() => void this.refreshFromFirestore());
  }

  private collectTaskIdsForRetention(rootManagementNo: string): string[] {
    const root = rootManagementNo.trim();
    const row = this._rows().find((r) => r.managementNo === root);
    if (!row) {
      return [];
    }
    const ids = [root];
    if (isParentTask(row)) {
      for (const c of tasksForParent(this.getTaskRows(), root)) {
        ids.push(c.managementNo);
      }
    }
    return ids;
  }

  private moveTaskToRetention(
    bucket: 'archive' | 'trash',
    managementNo: string,
    actorName: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'invalidActor' } {
    const actor = actorName.trim();
    if (!actor) {
      return { ok: false, reason: 'invalidActor' };
    }
    const ids = this.collectTaskIdsForRetention(managementNo);
    if (ids.length === 0) {
      return { ok: false, reason: 'notFound' };
    }
    for (const id of ids) {
      const idx = this.findIndex(id);
      if (idx < 0) {
        continue;
      }
      const task = this._rows()[idx];
      const chatMessages = this.taskChatService.takeMessages(id);
      this.removeAt(idx);
      this.trashService.storeTask(bucket, {
        deletedBy: actor,
        task: { ...task, resourceFolders: [...(task.resourceFolders ?? [])] },
        chatMessages,
      });
    }
    return { ok: true };
  }

  private restoreTaskFromRetention(
    bucket: 'archive' | 'trash',
    managementNo: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'numberInUse' } {
    const id = managementNo.trim();
    const entry = this.trashService.removeTaskEntry(bucket, id);
    if (!entry) {
      return { ok: false, reason: 'notFound' };
    }
    if (!this.isTaskNumberAvailable(entry.task.managementNo)) {
      this.trashService.storeTask(bucket, {
        deletedBy: entry.deletedBy,
        task: entry.task,
        chatMessages: entry.chatMessages,
      });
      return { ok: false, reason: 'numberInUse' };
    }
    this.insertTaskRows([entry.task], { [entry.task.managementNo]: entry.chatMessages });
    return { ok: true };
  }
}
