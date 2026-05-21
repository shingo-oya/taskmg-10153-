import { inject, Injectable, signal } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';

import type {
  ProjectMultiFilterCriteria,
  ProjectRelatedIssue,
  ProjectResourceEntry,
  ProjectResourceFolder,
  ProjectRow,
  ProjectUpdateLog,
  ProjectUpdateLogChange,
} from '../../components/project-list/project-row';
import {
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  projectMemberNames,
} from '../../components/project-list/project-row';
import { normalizeUpdateHistoryAt } from '../../shared/update-history-at';
import { withUpdateLogId } from '../../shared/update-log-id';
import { calculateDisplayedProjectProgress } from '../../components/project-list/project-display-progress';
import { ProjectChatService } from '../project-chat-service/project-chat-service';
import { ProjectsFirestoreService } from '../projects-firestore/projects-firestore.service';
import { TaskService } from '../task-service/task-service';
import { TrashService } from '../trash/trash.service';
import { UsersService } from '../users-service/users-service';
import { environment } from '../../../environments/environment';
import { currentYearInJapan, todayIsoDateInJapan } from '../../shared/japan-datetime';
import { PROJECT_SEED_ROWS } from './project-seed-data';

function newResourceId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private readonly usersService = inject(UsersService);
  private readonly taskService = inject(TaskService);
  private readonly trashService = inject(TrashService);
  private readonly projectChatService = inject(ProjectChatService);
  private readonly projectsFirestore = inject(ProjectsFirestoreService);

  private readonly _rows = signal<ProjectRow[]>([]);
  /** 一覧のリアクティブ更新用 */
  readonly projectRows = this._rows.asReadonly();
  readonly projectsLoaded = signal(false);
  /** マイページ等: 更新通知のリアルタイム反映用 */
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
    if (environment.seedDemoProjects) {
      await this.projectsFirestore.seedIfEmpty(PROJECT_SEED_ROWS);
    }
    const items = await this.projectsFirestore.listAll();
    this._rows.set(items);
    this.projectsLoaded.set(true);
  }

  /** プロジェクト更新通知のリアルタイム購読（参照カウント） */
  acquireUpdateNotificationsWatch(): () => void {
    this.updateWatchRefCount += 1;
    if (this.updateWatchRefCount === 1) {
      this.updateWatchUnsub = this.projectsFirestore.listenAll((items) => {
        this._rows.set(items);
        this.projectsLoaded.set(true);
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

  getProjectRows(): ProjectRow[] {
    return [...this._rows()];
  }

  /** 登録画面の担当部署チェック（Users の部署マスタと一致） */
  getAllDepartmentsForSelect(): string[] {
    return [...this.usersService.getDepartmentOptions()];
  }

  /** 部署に紐づく氏名（Users の所属のみ。プロジェクト上の役割とは無関係） */
  getStaffByDepartment(department: string): string[] {
    return this.usersService.getUserNamesByDepartment(department);
  }

  getRegisterPriorityOptions(): readonly string[] {
    return PROJECT_PRIORITY_OPTIONS;
  }

  getRegisterStatusOptions(): readonly string[] {
    return PROJECT_STATUS_OPTIONS;
  }

  /** 承認者候補は登録ユーザーの氏名のみ（Users のアカウント role は使わない） */
  getApproverOptions(): string[] {
    return this.usersService.getDistinctUserNames();
  }

  /** 登録用に `PRJ-年-連番` を採番（同年の既存行から最大＋1） */
  generateManagementNumber(): string {
    const year = currentYearInJapan();
    const prefix = `PRJ-${year}-`;
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
      scan(r.managementNumber);
    }
    for (const id of this.trashService.usedProjectNumbersForAllocation()) {
      scan(id);
    }
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
  }

  isProjectNumberAvailable(managementNumber: string): boolean {
    const id = managementNumber.trim();
    if (!id) {
      return false;
    }
    if (this._rows().some((r) => r.managementNumber === id)) {
      return false;
    }
    return !this.trashService.isProjectNumberUsed(id);
  }

  addProject(row: ProjectRow): void {
    const members = [...new Set(row.participants.map((p) => p.name))];
    const updateHistory =
      row.updateHistory?.length > 0
        ? [...row.updateHistory]
        : [
            withUpdateLogId({
              at: normalizeUpdateHistoryAt(row.lastUpdatedAt),
              by: row.lastUpdatedBy,
              summary: 'プロジェクトを新規登録',
            }),
          ];
    const normalized: ProjectRow = {
      ...row,
      members,
      updateHistory,
      resourceFolders: [...(row.resourceFolders ?? [])],
    };
    this._rows.update((rows) => [...rows, normalized]);
    this.persistRow(normalized);
  }

  getProjectByManagementNumber(managementNumber: string): ProjectRow | undefined {
    return this._rows().find((r) => r.managementNumber === managementNumber);
  }

  /** 資料フォルダを追加（詳細画面から） */
  addResourceFolder(managementNumber: string, name: string): boolean {
    const nameT = name.trim();
    if (!nameT) {
      return false;
    }
    const idx = this.findIndex(managementNumber);
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
    const next = { ...cur, resourceFolders: [...prev, folder] };
    this.replaceAt(idx, next);
    return true;
  }

  /** フォルダ内に URL またはファイル参照を追加 */
  addResourceEntry(
    managementNumber: string,
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
    const idx = this.findIndex(managementNumber);
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
    const next = { ...cur, resourceFolders };
    this.replaceAt(idx, next);
    return true;
  }

  /** 関連する課題を1件追加（プロジェクト詳細から課題新規へ遷移した登録完了時など） */
  addRelatedIssue(
    projectManagementNumber: string,
    issue: { taskManagementNo: string; name: string },
  ): boolean {
    const taskMn = issue.taskManagementNo.trim();
    const taskName = issue.name.trim();
    if (!taskMn || !taskName) {
      return false;
    }
    const idx = this.findIndex(projectManagementNumber);
    if (idx < 0) {
      return false;
    }
    const cur = this._rows()[idx];
    const prev = cur.relatedIssues ?? [];
    if (prev.some((x) => x.taskManagementNo === taskMn)) {
      return true;
    }
    const relatedIssues: ProjectRelatedIssue[] = [...prev, { taskManagementNo: taskMn, name: taskName }];
    const next = { ...cur, relatedIssues };
    this.replaceAt(idx, next);
    return true;
  }

  /** `appendLog` を渡すと、既存 `updateHistory` の先頭に1件追加（`updates.updateHistory` で上書きする場合は `appendLog` は無視） */
  updateProject(
    managementNumber: string,
    updates: Partial<ProjectRow>,
    appendLog?: {
      at?: string;
      by?: string;
      summary?: string;
      changes?: ProjectUpdateLogChange[];
    },
  ): boolean {
    const idx = this.findIndex(managementNumber);
    if (idx < 0) {
      return false;
    }
    const cur = this._rows()[idx];
    const { updateHistory: historyOverride, ...rest } = updates;
    const mergedBase: ProjectRow = { ...cur, ...rest };

    let updateHistory: ProjectUpdateLog[];
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

    const merged: ProjectRow = {
      ...mergedBase,
      updateHistory,
    };
    if (updates.participants) {
      merged.members = [...new Set(updates.participants.map((p) => p.name))];
    }
    this.replaceAt(idx, merged);
    return true;
  }

  /**
   * 紐づく課題の変更後に、表示ルールと同じ進捗率へ `ProjectRow` を揃える（更新履歴は付けない）
   */
  syncProjectProgressPercentFromTasks(projectManagementNumber: string, lastUpdatedBy?: string): void {
    const id = projectManagementNumber.trim();
    if (!id) {
      return;
    }
    const row = this.getProjectByManagementNumber(id);
    if (!row) {
      return;
    }
    const tasks = this.taskService.getTaskRows();
    const next = calculateDisplayedProjectProgress(row, tasks);
    if (row.progressPercent === next) {
      return;
    }
    const by = lastUpdatedBy?.trim() || row.lastUpdatedBy;
    this.updateProject(id, {
      progressPercent: next,
      lastUpdatedAt: todayIsoDateInJapan(),
      lastUpdatedBy: by,
    });
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
      for (const m of projectMemberNames(row)) {
        set.add(m);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  getDistinctPriorities(): string[] {
    const fromData = new Set(this._rows().map((r) => r.priority));
    for (const p of PROJECT_PRIORITY_OPTIONS) {
      fromData.add(p);
    }
    return [...fromData].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  getDistinctStatuses(): string[] {
    const fromData = new Set(this._rows().map((r) => r.status));
    for (const s of PROJECT_STATUS_OPTIONS) {
      fromData.add(s);
    }
    return [...fromData].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  filterProjects(rows: ProjectRow[], c: ProjectMultiFilterCriteria): ProjectRow[] {
    const from = c.endDateFrom.trim();
    const to = c.endDateTo.trim();
    let rangeLo = from;
    let rangeHi = to;
    if (from && to && from > to) {
      rangeLo = to;
      rangeHi = from;
    }

    return rows.filter((row) => {
      if (c.departments.size > 0 && !row.departments.some((d) => c.departments.has(d))) {
        return false;
      }
      if (c.members.size > 0 && !projectMemberNames(row).some((m) => c.members.has(m))) {
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

  /**
   * プロジェクトと紐づく課題をアーカイブへ退避（チャット含む）。完全削除は不可。
   */
  archiveProject(
    managementNumber: string,
    archivedBy: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'invalidActor' } {
    return this.moveProjectToRetention('archive', managementNumber, archivedBy);
  }

  /**
   * プロジェクトと紐づく課題をゴミ箱へ退避（チャット含む）。
   */
  softDeleteProject(
    managementNumber: string,
    deletedBy: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'invalidActor' } {
    return this.moveProjectToRetention('trash', managementNumber, deletedBy);
  }

  restoreProjectFromArchive(
    managementNumber: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'numberInUse' } {
    return this.restoreProjectFromRetention('archive', managementNumber);
  }

  restoreProjectFromTrash(
    managementNumber: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'numberInUse' } {
    return this.restoreProjectFromRetention('trash', managementNumber);
  }

  purgeProjectFromTrash(
    managementNumber: string,
  ): { ok: true } | { ok: false; reason: 'notFound' } {
    const id = managementNumber.trim();
    const entry = this.trashService.removeProjectEntry('trash', id);
    if (!entry) {
      return { ok: false, reason: 'notFound' };
    }
    this.trashService.reserveProjectBundle(entry);
    return { ok: true };
  }

  private findIndex(managementNumber: string): number {
    const id = managementNumber.trim();
    return this._rows().findIndex((r) => r.managementNumber === id);
  }

  private replaceAt(index: number, row: ProjectRow): void {
    this._rows.update((rows) => {
      const next = [...rows];
      next[index] = row;
      return next;
    });
    this.persistRow(row);
  }

  private removeAt(index: number): void {
    const id = this._rows()[index].managementNumber;
    this._rows.update((rows) => {
      const next = [...rows];
      next.splice(index, 1);
      return next;
    });
    this.persistDelete(id);
  }

  private persistRow(row: ProjectRow): void {
    void this.projectsFirestore.setProject(row).catch(() => void this.refreshFromFirestore());
  }

  private persistDelete(managementNumber: string): void {
    void this.projectsFirestore
      .deleteProject(managementNumber)
      .catch(() => void this.refreshFromFirestore());
  }

  private moveProjectToRetention(
    bucket: 'archive' | 'trash',
    managementNumber: string,
    actorName: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'invalidActor' } {
    const actor = actorName.trim();
    if (!actor) {
      return { ok: false, reason: 'invalidActor' };
    }
    const idx = this.findIndex(managementNumber);
    if (idx < 0) {
      return { ok: false, reason: 'notFound' };
    }
    const project = this._rows()[idx];
    const id = project.managementNumber;
    const { tasks: linkedTasks, chatsByTaskNo } = this.taskService.extractTasksForProject(id);
    const projectChatMessages = this.projectChatService.takeMessages(id);
    this.removeAt(idx);
    this.trashService.storeProject(bucket, {
      deletedBy: actor,
      project: { ...project, resourceFolders: [...(project.resourceFolders ?? [])] },
      linkedTasks: linkedTasks.map((t) => ({
        ...t,
        resourceFolders: [...(t.resourceFolders ?? [])],
      })),
      projectChatMessages,
      taskChatMessagesByTaskNo: chatsByTaskNo,
    });
    return { ok: true };
  }

  private restoreProjectFromRetention(
    bucket: 'archive' | 'trash',
    managementNumber: string,
  ): { ok: true } | { ok: false; reason: 'notFound' | 'numberInUse' } {
    const id = managementNumber.trim();
    const entry = this.trashService.removeProjectEntry(bucket, id);
    if (!entry) {
      return { ok: false, reason: 'notFound' };
    }
    const rollback = (): void => {
      this.trashService.storeProject(bucket, {
        deletedBy: entry.deletedBy,
        project: entry.project,
        linkedTasks: entry.linkedTasks,
        projectChatMessages: entry.projectChatMessages,
        taskChatMessagesByTaskNo: entry.taskChatMessagesByTaskNo,
      });
    };
    if (!this.isProjectNumberAvailable(entry.project.managementNumber)) {
      rollback();
      return { ok: false, reason: 'numberInUse' };
    }
    for (const t of entry.linkedTasks) {
      if (!this.taskService.isTaskNumberAvailable(t.managementNo)) {
        rollback();
        return { ok: false, reason: 'numberInUse' };
      }
    }
    this.insertProjectRow(entry.project);
    this.taskService.insertTaskRows(entry.linkedTasks, entry.taskChatMessagesByTaskNo);
    this.projectChatService.restoreMessages(id, entry.projectChatMessages);
    return { ok: true };
  }

  private insertProjectRow(row: ProjectRow): void {
    const members = [...new Set(row.participants.map((p) => p.name))];
    const normalized: ProjectRow = {
      ...row,
      members,
      resourceFolders: [...(row.resourceFolders ?? [])],
      updateHistory: [...(row.updateHistory ?? [])],
    };
    this._rows.update((rows) => [...rows, normalized]);
    this.persistRow(normalized);
  }
}
