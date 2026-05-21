import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, HostListener, inject, signal, type WritableSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth-service/auth.service';
import { PermissionService } from '../../services/permission/permission.service';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
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
import { TaskService } from '../../services/task-service/task-service';
import {
  TASK_STATUS_OPTIONS,
  type TaskMultiFilterCriteria,
  type TaskRow,
} from './task-row';
import {
  ariaSortForColumn,
  compareDateStrings,
  compareNumber,
  comparePriority,
  compareText,
  cycleListSort,
  type ListSortDir,
  type ListSortState,
} from '../../shared/list-table-sort';
import {
  calculateDisplayedTaskProgress,
  isChildTask,
  resolveProjectDisplayName,
  resolveProjectManagementNumber,
  sortTasksParentChildGrouped,
  sortTasksParentChildGroupedWithCompare,
} from '../../shared/task-hierarchy';

type TaskFilterDropdown = 'type' | 'department' | 'member' | 'priority' | 'status';

export type TaskListSortKey =
  | 'projectMn'
  | 'projectName'
  | 'type'
  | 'managementNo'
  | 'taskname'
  | 'departments'
  | 'members'
  | 'endDate'
  | 'priority'
  | 'progress'
  | 'lastUpdatedAt'
  | 'lastUpdatedBy';

const FILTER_SCREEN: FilterScreenId = 'task-list';

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    FilterPresetsComponent,
    RowActionsMenuComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './task-list.component.html',
  styleUrl: './task-list.component.scss',
})
export class TaskListComponent {
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly filterState = inject(ListFilterStateBridge);
  private readonly auth = inject(AuthService);
  readonly perm = inject(PermissionService);

  readonly rowConfirm = signal<{
    kind: 'archive' | 'trash';
    managementNo: string;
    name: string;
  } | null>(null);
  readonly rowActionFeedback = signal<string | null>(null);

  constructor() {
    this.filterState.restoreTask(FILTER_SCREEN, this.taskAppliedSignals());
    void this.taskService.ensureLoaded();
  }

  private readonly allTasks = computed(() => this.taskService.taskRows());

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

  /** null のときは親の直後に子（管理番号昇順） */
  readonly activeSort = signal<ListSortState<TaskListSortKey>>(null);

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

  get filteredTasks(): TaskRow[] {
    const rows = this.allTasks().map((r) => ({
      ...r,
      parentTaskManagementNo: r.parentTaskManagementNo ?? '',
    }));
    const criteria: TaskMultiFilterCriteria = {
      types: this.appliedTypes(),
      departments: this.appliedDepartments(),
      members: this.appliedMembers(),
      endDateFrom: this.appliedEndDateFrom(),
      endDateTo: this.appliedEndDateTo(),
      priorities: this.appliedPriorities(),
      statuses: this.appliedStatuses(),
    };
    return this.taskService.filterTasks(rows, criteria);
  }

  /** 一覧表示用: 未着手 → 着手中 → 確認待ち → 完了 → 保留 の順（その他は末尾） */
  get filteredTaskStatusSections(): { status: string; rows: TaskRow[] }[] {
    const list = this.filteredTasks;
    const buckets = new Map<string, TaskRow[]>();
    for (const s of TASK_STATUS_OPTIONS) {
      buckets.set(s, []);
    }
    const other: TaskRow[] = [];
    const grouped = this.sortTasksForDisplay(list);
    for (const row of grouped) {
      const b = buckets.get(row.status);
      if (b) {
        b.push(row);
      } else {
        other.push(row);
      }
    }
    const sections: { status: string; rows: TaskRow[] }[] = TASK_STATUS_OPTIONS.map((status) => ({
      status,
      rows: buckets.get(status) ?? [],
    }));
    if (other.length > 0) {
      sections.push({ status: 'その他', rows: other });
    }
    return sections;
  }

  toggleSort(key: TaskListSortKey): void {
    this.activeSort.update((cur) => cycleListSort(cur, key));
  }

  ariaSortFor(key: TaskListSortKey): 'ascending' | 'descending' | 'none' {
    return ariaSortForColumn(this.activeSort(), key);
  }

  private sortTasksForDisplay(list: TaskRow[]): TaskRow[] {
    const sort = this.activeSort();
    if (sort === null) {
      return sortTasksParentChildGrouped(list);
    }
    return sortTasksParentChildGroupedWithCompare(list, (a, b) => {
      const c = this.compareTaskRows(a, b, sort.key, sort.dir);
      if (c !== 0) {
        return c;
      }
      return a.managementNo.localeCompare(b.managementNo, 'ja');
    });
  }

  private compareTaskRows(a: TaskRow, b: TaskRow, key: TaskListSortKey, dir: ListSortDir): number {
    const allTasks = this.taskService.getTaskRows();
    switch (key) {
      case 'projectMn':
        return compareText(this.projectMnForRow(a), this.projectMnForRow(b), dir);
      case 'projectName':
        return compareText(this.projectNameForRow(a), this.projectNameForRow(b), dir);
      case 'type':
        return compareText(a.type, b.type, dir);
      case 'managementNo':
        return compareText(a.managementNo, b.managementNo, dir);
      case 'taskname':
        return compareText(a.taskname, b.taskname, dir);
      case 'departments':
        return compareText(a.departments.join('、'), b.departments.join('、'), dir);
      case 'members':
        return compareText(a.members, b.members, dir);
      case 'endDate':
        return compareDateStrings(a.endDate, b.endDate, dir);
      case 'priority':
        return comparePriority(a.priority, b.priority, dir);
      case 'progress':
        return compareNumber(
          calculateDisplayedTaskProgress(a, allTasks),
          calculateDisplayedTaskProgress(b, allTasks),
          dir,
        );
      case 'lastUpdatedAt':
        return compareDateStrings(a.lastUpdatedAt, b.lastUpdatedAt, dir);
      case 'lastUpdatedBy':
        return compareText(a.lastUpdatedBy, b.lastUpdatedBy, dir);
      default:
        return 0;
    }
  }

  get hasFilteredTasks(): boolean {
    return this.filteredTasks.length > 0;
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

  formatMultiSelectLabel(s: ReadonlySet<string>): string {
    if (s.size === 0) {
      return 'すべて';
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ja')).join('、');
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

  onRegister(): void {
    void this.router.navigate(['/tasks/add']);
  }

  /** 一覧表示用: ステータスに応じた進捗（編集画面と同じルール） */
  displayedTaskProgress(row: TaskRow): number {
    return calculateDisplayedTaskProgress(row, this.taskService.getTaskRows());
  }

  projectMnForRow(row: TaskRow): string {
    return resolveProjectManagementNumber(row, this.taskService.getTaskRows());
  }

  projectNameForRow(row: TaskRow): string {
    return resolveProjectDisplayName(row, this.taskService.getTaskRows(), (pmn) =>
      this.projectService.getProjectByManagementNumber(pmn)?.name,
    );
  }

  isChildRow(row: TaskRow): boolean {
    return isChildTask(row);
  }

  onRowClick(row: TaskRow): void {
    void this.router.navigate(['/tasks', row.managementNo]);
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

  rowConfirmOpen(): boolean {
    return this.rowConfirm() !== null;
  }

  rowConfirmMessage(): string {
    const c = this.rowConfirm();
    if (!c) {
      return '';
    }
    if (c.kind === 'archive') {
      return `「${c.name}」をアーカイブしますか？`;
    }
    return `「${c.name}」をゴミ箱へ移動しますか？`;
  }

  rowConfirmIsDanger(): boolean {
    return this.rowConfirm()?.kind === 'trash';
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.panelOpen()) {
      this.closePanelWithoutApply();
    }
  }
}
