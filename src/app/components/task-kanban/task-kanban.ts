import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { Component, HostListener, computed, effect, inject, signal, type WritableSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth-service/auth.service';
import { PermissionService } from '../../services/permission/permission.service';
import { FilterPresetsComponent } from '../shared/filter-presets/filter-presets.component';
import {
  RowActionsMenuComponent,
  type RowActionId,
} from '../shared/row-actions-menu/row-actions-menu.component';
import { ListFilterStateBridge } from '../../services/list-filter/list-filter-state.bridge';
import {
  readTaskFilterSnapshot,
  type TaskAppliedSignals,
} from '../../services/list-filter/list-filter-snapshot';
import type { FilterScreenId, FilterSnapshot } from '../../services/list-filter/list-filter.types';
import { ProjectService } from '../../services/project-service/project-service';
import {
  calculateDisplayedTaskProgress,
  resolveProjectManagementNumber,
} from '../../shared/task-hierarchy';
import { TaskService } from '../../services/task-service/task-service';
import {
  TASK_STATUS_OPTIONS,
  type TaskMultiFilterCriteria,
  type TaskRow,
  type TaskRowStatus,
  type TaskUpdateLogChange,
  taskMemberNames,
  taskProgressPercentForStatus,
} from '../task-list/task-row';
import { nowUtcIso, todayIsoDateInJapan } from '../../shared/japan-datetime';

type TaskFilterDropdown = 'type' | 'department' | 'member' | 'priority' | 'status';

const FILTER_SCREEN: FilterScreenId = 'task-kanban';

interface PendingStatusChange {
  task: TaskRow;
  newStatus: TaskRowStatus;
}

@Component({
  selector: 'app-task-kanban',
  standalone: true,
  imports: [
    RouterLink,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    FilterPresetsComponent,
    RowActionsMenuComponent,
  ],
  templateUrl: './task-kanban.html',
  styleUrls: ['./task-kanban.scss', './task-kanban-board.scss'],
})
export class TaskKanbanComponent {
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly filterState = inject(ListFilterStateBridge);
  private readonly auth = inject(AuthService);
  readonly perm = inject(PermissionService);

  private readonly dataVersion = signal(0);

  readonly rowConfirm = signal<{
    kind: 'archive' | 'trash';
    managementNo: string;
    name: string;
  } | null>(null);
  readonly rowActionFeedback = signal<string | null>(null);

  readonly statusColumns = TASK_STATUS_OPTIONS;

  readonly appliedTypes = signal(new Set<string>());
  readonly appliedDepartments = signal(new Set<string>());
  readonly appliedMembers = signal(new Set<string>());
  readonly appliedEndDateFrom = signal('');
  readonly appliedEndDateTo = signal('');
  readonly appliedPriorities = signal(new Set<string>());
  readonly appliedStatuses = signal(new Set<string>());

  readonly draftTypes = signal(new Set<string>());
  readonly draftDepartments = signal(new Set<string>());
  readonly draftMembers = signal(new Set<string>());
  readonly draftEndDateFrom = signal('');
  readonly draftEndDateTo = signal('');
  readonly draftPriorities = signal(new Set<string>());
  readonly draftStatuses = signal(new Set<string>());

  readonly panelOpen = signal(false);
  readonly openFilterDropdown = signal<TaskFilterDropdown | null>(null);

  readonly approverModalOpen = signal(false);
  readonly approverDraft = signal('');
  readonly approverModalError = signal(false);
  readonly pendingStatusChange = signal<PendingStatusChange | null>(null);

  /** CDK 接続用（参照を固定） */
  readonly dropListIds: string[] = TASK_STATUS_OPTIONS.map((status) => `kanban-drop-${status}`);

  private readonly columnTasks = signal<Record<TaskRowStatus, TaskRow[]>>(TaskKanbanComponent.emptyColumnMap());

  readonly kanbanColumns = computed(() =>
    TASK_STATUS_OPTIONS.map((status) => ({
      status,
      tasks: this.columnTasks()[status],
    })),
  );

  constructor() {
    this.filterState.restoreTask(FILTER_SCREEN, this.taskAppliedSignals());
    effect(() => {
      this.dataVersion();
      this.appliedTypes();
      this.appliedDepartments();
      this.appliedMembers();
      this.appliedEndDateFrom();
      this.appliedEndDateTo();
      this.appliedPriorities();
      this.appliedStatuses();
      this.syncBoardFromService();
    });
  }

  private static emptyColumnMap(): Record<TaskRowStatus, TaskRow[]> {
    const map = {} as Record<TaskRowStatus, TaskRow[]>;
    for (const status of TASK_STATUS_OPTIONS) {
      map[status] = [];
    }
    return map;
  }

  private syncBoardFromService(): void {
    const rows = this.taskService.getTaskRows();
    const criteria: TaskMultiFilterCriteria = {
      types: this.appliedTypes(),
      departments: this.appliedDepartments(),
      members: this.appliedMembers(),
      endDateFrom: this.appliedEndDateFrom(),
      endDateTo: this.appliedEndDateTo(),
      priorities: this.appliedPriorities(),
      statuses: this.appliedStatuses(),
    };
    const filtered = this.taskService.filterTasks(rows, criteria);
    const next = TaskKanbanComponent.emptyColumnMap();
    for (const status of TASK_STATUS_OPTIONS) {
      next[status] = filtered.filter((t) => t.status === status);
    }
    this.columnTasks.set(next);
  }

  private statusFromDropListId(dropListId: string): TaskRowStatus | null {
    for (const status of TASK_STATUS_OPTIONS) {
      if (this.dropListId(status) === dropListId) {
        return status;
      }
    }
    return null;
  }

  get typeOptions(): string[] {
    return this.taskService.getDistinctTypes();
  }

  get departmentOptions(): string[] {
    return this.taskService.getDistinctDepartments();
  }

  get memberOptions(): string[] {
    return this.taskService.getDistinctMembers();
  }

  get priorityOptions(): string[] {
    return this.taskService.getDistinctPriorities();
  }

  get statusOptions(): string[] {
    return this.taskService.getDistinctStatuses();
  }

  get approverOptions(): string[] {
    return this.taskService.getApproverOptions();
  }

  dropListId(status: TaskRowStatus): string {
    return `kanban-drop-${status}`;
  }

  formatMultiSelectLabel(s: ReadonlySet<string>): string {
    if (s.size === 0) {
      return 'すべて';
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ja')).join('、');
  }

  appliedTypeLabel(): string {
    return this.formatMultiSelectLabel(this.appliedTypes());
  }

  appliedDepartmentLabel(): string {
    return this.formatMultiSelectLabel(this.appliedDepartments());
  }

  appliedMemberLabel(): string {
    return this.formatMultiSelectLabel(this.appliedMembers());
  }

  appliedEndDateLabel(): string {
    const from = this.appliedEndDateFrom().trim();
    const to = this.appliedEndDateTo().trim();
    if (!from && !to) {
      return 'すべて';
    }
    if (from && to) {
      return `${from} ～ ${to}`;
    }
    if (from) {
      return `${from} ～`;
    }
    return `～ ${to}`;
  }

  appliedPriorityLabel(): string {
    return this.formatMultiSelectLabel(this.appliedPriorities());
  }

  appliedStatusLabel(): string {
    return this.formatMultiSelectLabel(this.appliedStatuses());
  }

  onDraftEndFromInput(event: Event): void {
    this.draftEndDateFrom.set((event.target as HTMLInputElement).value);
  }

  onDraftEndToInput(event: Event): void {
    this.draftEndDateTo.set((event.target as HTMLInputElement).value);
  }

  toggleSearchPanel(): void {
    if (this.panelOpen()) {
      this.panelOpen.set(false);
      this.openFilterDropdown.set(null);
      return;
    }
    this.draftTypes.set(new Set(this.appliedTypes()));
    this.draftDepartments.set(new Set(this.appliedDepartments()));
    this.draftMembers.set(new Set(this.appliedMembers()));
    this.draftEndDateFrom.set(this.appliedEndDateFrom());
    this.draftEndDateTo.set(this.appliedEndDateTo());
    this.draftPriorities.set(new Set(this.appliedPriorities()));
    this.draftStatuses.set(new Set(this.appliedStatuses()));
    this.openFilterDropdown.set(null);
    this.panelOpen.set(true);
  }

  closePanelWithoutApply(): void {
    this.panelOpen.set(false);
    this.openFilterDropdown.set(null);
  }

  applySearch(): void {
    this.appliedTypes.set(new Set(this.draftTypes()));
    this.appliedDepartments.set(new Set(this.draftDepartments()));
    this.appliedMembers.set(new Set(this.draftMembers()));
    this.appliedEndDateFrom.set(this.draftEndDateFrom().trim());
    this.appliedEndDateTo.set(this.draftEndDateTo().trim());
    this.appliedPriorities.set(new Set(this.draftPriorities()));
    this.appliedStatuses.set(new Set(this.draftStatuses()));
    this.openFilterDropdown.set(null);
    this.panelOpen.set(false);
    this.persistAppliedFilters();
  }

  draftFilterSnapshot(): FilterSnapshot {
    return readTaskFilterSnapshot(this.taskDraftSignals());
  }

  onPresetApplied(snapshot: FilterSnapshot): void {
    this.filterState.applyTaskPreset(FILTER_SCREEN, this.taskAppliedSignals(), snapshot);
    this.panelOpen.set(false);
    this.openFilterDropdown.set(null);
  }

  private taskAppliedSignals(): TaskAppliedSignals {
    return {
      types: this.appliedTypes,
      departments: this.appliedDepartments,
      members: this.appliedMembers,
      endDateFrom: this.appliedEndDateFrom,
      endDateTo: this.appliedEndDateTo,
      priorities: this.appliedPriorities,
      statuses: this.appliedStatuses,
    };
  }

  private taskDraftSignals(): TaskAppliedSignals {
    return {
      types: this.draftTypes,
      departments: this.draftDepartments,
      members: this.draftMembers,
      endDateFrom: this.draftEndDateFrom,
      endDateTo: this.draftEndDateTo,
      priorities: this.draftPriorities,
      statuses: this.draftStatuses,
    };
  }

  private persistAppliedFilters(): void {
    this.filterState.persistTask(FILTER_SCREEN, this.taskAppliedSignals());
  }

  toggleFilterDropdown(which: TaskFilterDropdown, event: MouseEvent): void {
    event.stopPropagation();
    this.openFilterDropdown.update((cur) => (cur === which ? null : which));
  }

  closeFilterDropdown(): void {
    this.openFilterDropdown.set(null);
  }

  onFilterPanelAreaClick(event: MouseEvent): void {
    const t = event.target as HTMLElement | null;
    if (t && !t.closest('.filter-dd') && !t.closest('.search-panel__date-range')) {
      this.closeFilterDropdown();
    }
  }

  isDraftTypeSelected(value: string): boolean {
    return this.draftTypes().has(value);
  }

  isDraftDepartmentSelected(value: string): boolean {
    return this.draftDepartments().has(value);
  }

  isDraftMemberSelected(value: string): boolean {
    return this.draftMembers().has(value);
  }

  isDraftPrioritySelected(value: string): boolean {
    return this.draftPriorities().has(value);
  }

  isDraftStatusSelected(value: string): boolean {
    return this.draftStatuses().has(value);
  }

  onDraftTypeChange(value: string, event: Event): void {
    this.updateDraftSet(this.draftTypes, value, (event.target as HTMLInputElement).checked);
  }

  onDraftDepartmentChange(value: string, event: Event): void {
    this.updateDraftSet(this.draftDepartments, value, (event.target as HTMLInputElement).checked);
  }

  onDraftMemberChange(value: string, event: Event): void {
    this.updateDraftSet(this.draftMembers, value, (event.target as HTMLInputElement).checked);
  }

  onDraftPriorityChange(value: string, event: Event): void {
    this.updateDraftSet(this.draftPriorities, value, (event.target as HTMLInputElement).checked);
  }

  onDraftStatusChange(value: string, event: Event): void {
    this.updateDraftSet(this.draftStatuses, value, (event.target as HTMLInputElement).checked);
  }

  private updateDraftSet(sig: WritableSignal<Set<string>>, value: string, checked: boolean): void {
    sig.update((cur) => {
      const next = new Set(cur);
      if (checked) {
        next.add(value);
      } else {
        next.delete(value);
      }
      return next;
    });
  }

  clearDraftFilters(): void {
    this.draftTypes.set(new Set());
    this.draftDepartments.set(new Set());
    this.draftMembers.set(new Set());
    this.draftEndDateFrom.set('');
    this.draftEndDateTo.set('');
    this.draftPriorities.set(new Set());
    this.draftStatuses.set(new Set());
    this.openFilterDropdown.set(null);
  }

  onTaskRowAction(action: RowActionId, row: TaskRow): void {
    if (action === 'edit') {
      void this.router.navigate(['/tasks', row.managementNo, 'edit']);
      return;
    }
    this.rowActionFeedback.set(null);
    this.rowConfirm.set({
      kind: action,
      managementNo: row.managementNo,
      name: row.taskname,
    });
  }

  cancelRowConfirm(): void {
    this.rowConfirm.set(null);
  }

  rowConfirmMessage(): string {
    const c = this.rowConfirm();
    if (!c) {
      return '';
    }
    if (c.kind === 'archive') {
      return `「${c.name}」をアーカイブしますか？設定のアーカイブ・ゴミ箱から復元できます。`;
    }
    return `「${c.name}」をゴミ箱へ移動しますか？`;
  }

  confirmRowAction(): void {
    const c = this.rowConfirm();
    if (!c) {
      return;
    }
    const actor = this.auth.currentUser()?.displayName?.trim() ?? '';
    if (!actor) {
      void this.router.navigate(['/login']);
      return;
    }
    const result =
      c.kind === 'archive'
        ? this.taskService.archiveTask(c.managementNo, actor)
        : this.taskService.softDeleteTask(c.managementNo, actor);
    this.rowConfirm.set(null);
    if (result.ok) {
      this.dataVersion.update((v) => v + 1);
      this.rowActionFeedback.set(
        c.kind === 'archive' ? '課題をアーカイブしました。' : '課題をゴミ箱へ移動しました。',
      );
      return;
    }
    if (result.reason === 'notFound') {
      this.rowActionFeedback.set('課題が見つかりませんでした。');
    } else {
      this.rowActionFeedback.set('操作できませんでした。');
    }
  }

  onRegister(): void {
    void this.router.navigate(['/tasks/add']);
  }

  departmentsText(row: TaskRow): string {
    return row.departments.length ? row.departments.join('、') : '—';
  }

  membersText(row: TaskRow): string {
    const names = taskMemberNames(row);
    return names.length ? names.join('、') : '—';
  }

  displayedTaskProgress(row: TaskRow): number {
    return calculateDisplayedTaskProgress(row, this.taskService.getTaskRows());
  }

  statusBadgeClasses(status: string): string {
    return `kanban-card__status kanban-card__status--${this.statusModifierClass(status)}`;
  }

  onColumnDrop(event: CdkDragDrop<TaskRow[]>, targetStatus: TaskRowStatus): void {
    const task = event.item.data as TaskRow | undefined;
    if (!task) {
      return;
    }

    const sourceStatus = this.statusFromDropListId(event.previousContainer.id);
    if (!sourceStatus) {
      return;
    }

    if (sourceStatus === targetStatus) {
      if (event.previousContainer === event.container) {
        moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      }
      return;
    }

    if (targetStatus === '確認待ち') {
      this.syncBoardFromService();
      this.pendingStatusChange.set({ task, newStatus: targetStatus });
      this.approverDraft.set(task.approver?.trim() ?? '');
      this.approverModalError.set(false);
      this.approverModalOpen.set(true);
      return;
    }

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );
    this.applyStatusChange(task, targetStatus, '');
  }

  onApproverDraftChange(event: Event): void {
    this.approverDraft.set((event.target as HTMLSelectElement).value);
    this.approverModalError.set(false);
  }

  confirmApproverModal(): void {
    const pending = this.pendingStatusChange();
    if (!pending) {
      return;
    }
    const approver = this.approverDraft().trim();
    if (!approver) {
      this.approverModalError.set(true);
      return;
    }
    this.applyStatusChange(pending.task, pending.newStatus, approver);
    this.closeApproverModal();
  }

  closeApproverModal(): void {
    this.approverModalOpen.set(false);
    this.pendingStatusChange.set(null);
    this.approverDraft.set('');
    this.approverModalError.set(false);
  }

  private applyStatusChange(task: TaskRow, newStatus: TaskRowStatus, approver: string): void {
    const approverName = newStatus === '確認待ち' ? approver.trim() : '';
    const progress = taskProgressPercentForStatus(newStatus, task.progressPercent);
    const today = todayIsoDateInJapan();
    const historyAt = nowUtcIso();
    const by = task.lastUpdatedBy?.trim() || 'システム';

    const changes: TaskUpdateLogChange[] = [];
    if (task.status !== newStatus) {
      changes.push({ kind: 'field', fieldLabel: 'ステータス', newValue: newStatus });
    }
    const oldProgress = taskProgressPercentForStatus(task.status, task.progressPercent);
    if (oldProgress !== progress) {
      changes.push({ kind: 'field', fieldLabel: '進捗率', newValue: `${progress}%` });
    }
    const prevApprover = task.approver?.trim() ?? '';
    if (prevApprover !== approverName) {
      changes.push({ kind: 'field', fieldLabel: '承認者', newValue: approverName || '—' });
    }

    const ok = this.taskService.updateTask(
      task.managementNo,
      {
        status: newStatus,
        progressPercent: progress,
        approver: approverName,
        lastUpdatedAt: today,
        lastUpdatedBy: by,
      },
      changes.length > 0 ? { at: historyAt, by, changes } : undefined,
    );
    if (ok) {
      const projectMn = resolveProjectManagementNumber(task, this.taskService.getTaskRows());
      if (projectMn) {
        this.projectService.syncProjectProgressPercentFromTasks(projectMn, by);
      }
      this.dataVersion.update((v) => v + 1);
    }
  }

  private statusModifierClass(status: string): string {
    switch (status) {
      case '未着手':
        return 'not-started';
      case '着手中':
        return 'in-progress';
      case '確認待ち':
        return 'review';
      case '完了':
        return 'done';
      case '保留':
        return 'hold';
      default:
        return 'unknown';
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.approverModalOpen()) {
      this.closeApproverModal();
      return;
    }
    if (this.panelOpen()) {
      this.closePanelWithoutApply();
    }
  }
}
