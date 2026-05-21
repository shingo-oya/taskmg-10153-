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
  readProjectFilterSnapshot,
  type ProjectAppliedSignals,
} from '../../services/list-filter/list-filter-snapshot';
import type { FilterScreenId, FilterSnapshot } from '../../services/list-filter/list-filter.types';
import { ProjectService } from '../../services/project-service/project-service';
import { calculateDisplayedProjectProgress } from './project-display-progress';
import {
  PROJECT_STATUS_OPTIONS,
  type ProjectMultiFilterCriteria,
  type ProjectRow,
} from './project-row';
import { TaskService } from '../../services/task-service/task-service';
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

const FILTER_SCREEN: FilterScreenId = 'project-list';

type ProjectFilterDropdown = 'department' | 'member' | 'priority' | 'status';

export type ProjectListSortKey =
  | 'managementNumber'
  | 'name'
  | 'description'
  | 'departments'
  | 'endDate'
  | 'priority'
  | 'progress'
  | 'lastUpdatedAt'
  | 'lastUpdatedBy';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    FilterPresetsComponent,
    RowActionsMenuComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './project-list.component.html',
  styleUrl: './project-list.component.scss',
})
export class ProjectListComponent {
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly filterState = inject(ListFilterStateBridge);
  private readonly auth = inject(AuthService);
  readonly perm = inject(PermissionService);

  readonly rowConfirm = signal<{
    kind: 'archive' | 'trash';
    managementNumber: string;
    name: string;
  } | null>(null);
  readonly rowActionFeedback = signal<string | null>(null);

  constructor() {
    this.filterState.restoreProject(FILTER_SCREEN, this.projectAppliedSignals());
    void this.projectService.ensureLoaded();
  }

  /** 一覧に反映されている条件 */
  readonly appliedDepartments = signal(new Set<string>());
  readonly appliedMembers = signal(new Set<string>());
  readonly appliedEndDateFrom = signal('');
  readonly appliedEndDateTo = signal('');
  readonly appliedPriorities = signal(new Set<string>());
  readonly appliedStatuses = signal(new Set<string>());

  /** パネル内ドラフト */
  readonly draftDepartments = signal(new Set<string>());
  readonly draftMembers = signal(new Set<string>());
  readonly draftEndDateFrom = signal('');
  readonly draftEndDateTo = signal('');
  readonly draftPriorities = signal(new Set<string>());
  readonly draftStatuses = signal(new Set<string>());

  readonly panelOpen = signal(false);
  readonly openFilterDropdown = signal<ProjectFilterDropdown | null>(null);

  /** null のときは管理番号昇順 */
  readonly activeSort = signal<ListSortState<ProjectListSortKey>>(null);

  get departmentOptions(): string[] {
    return this.projectService.getDistinctDepartments();
  }

  get memberOptions(): string[] {
    return this.projectService.getDistinctMembers();
  }

  get priorityOptions(): string[] {
    return this.projectService.getDistinctPriorities();
  }

  get statusOptions(): string[] {
    return this.projectService.getDistinctStatuses();
  }

  private readonly allProjects = computed(() => this.projectService.projectRows());

  get filteredProjects(): ProjectRow[] {
    const rows = this.allProjects();
    const criteria: ProjectMultiFilterCriteria = {
      departments: this.appliedDepartments(),
      members: this.appliedMembers(),
      endDateFrom: this.appliedEndDateFrom(),
      endDateTo: this.appliedEndDateTo(),
      priorities: this.appliedPriorities(),
      statuses: this.appliedStatuses(),
    };
    return this.projectService.filterProjects(rows, criteria);
  }

  /** 一覧表示用: 未着手 → 着手中 → 確認待ち → 完了 → 保留 の順（その他は末尾） */
  get filteredProjectStatusSections(): { status: string; rows: ProjectRow[] }[] {
    const list = this.filteredProjects;
    const buckets = new Map<string, ProjectRow[]>();
    for (const s of PROJECT_STATUS_OPTIONS) {
      buckets.set(s, []);
    }
    const other: ProjectRow[] = [];
    for (const row of list) {
      const b = buckets.get(row.status);
      if (b) {
        b.push(row);
      } else {
        other.push(row);
      }
    }
    const sections: { status: string; rows: ProjectRow[] }[] = PROJECT_STATUS_OPTIONS.map((status) => ({
      status,
      rows: this.sortProjectRows(buckets.get(status) ?? []),
    }));
    if (other.length > 0) {
      sections.push({ status: 'その他', rows: this.sortProjectRows(other) });
    }
    return sections;
  }

  toggleSort(key: ProjectListSortKey): void {
    this.activeSort.update((cur) => cycleListSort(cur, key));
  }

  ariaSortFor(key: ProjectListSortKey): 'ascending' | 'descending' | 'none' {
    return ariaSortForColumn(this.activeSort(), key);
  }

  private sortProjectRows(rows: ProjectRow[]): ProjectRow[] {
    const copy = [...rows];
    const sort = this.activeSort();
    if (sort === null) {
      copy.sort((a, b) => a.managementNumber.localeCompare(b.managementNumber, 'ja'));
      return copy;
    }
    copy.sort((a, b) => {
      const c = this.compareProjectRows(a, b, sort.key, sort.dir);
      if (c !== 0) {
        return c;
      }
      return a.managementNumber.localeCompare(b.managementNumber, 'ja');
    });
    return copy;
  }

  private compareProjectRows(
    a: ProjectRow,
    b: ProjectRow,
    key: ProjectListSortKey,
    dir: ListSortDir,
  ): number {
    const tasks = this.taskService.getTaskRows();
    switch (key) {
      case 'managementNumber':
        return compareText(a.managementNumber, b.managementNumber, dir);
      case 'name':
        return compareText(a.name, b.name, dir);
      case 'description':
        return compareText(a.description, b.description, dir);
      case 'departments':
        return compareText(a.departments.join('、'), b.departments.join('、'), dir);
      case 'endDate':
        return compareDateStrings(a.endDate, b.endDate, dir);
      case 'priority':
        return comparePriority(a.priority, b.priority, dir);
      case 'progress':
        return compareNumber(
          calculateDisplayedProjectProgress(a, tasks),
          calculateDisplayedProjectProgress(b, tasks),
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

  get hasFilteredProjects(): boolean {
    return this.filteredProjects.length > 0;
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
    return readProjectFilterSnapshot(this.projectDraftSignals());
  }

  onPresetApplied(snapshot: FilterSnapshot): void {
    this.filterState.applyProjectPreset(FILTER_SCREEN, this.projectAppliedSignals(), snapshot);
    this.panelOpen.set(false);
    this.openFilterDropdown.set(null);
  }

  private projectAppliedSignals(): ProjectAppliedSignals {
    return {
      departments: this.appliedDepartments,
      members: this.appliedMembers,
      endDateFrom: this.appliedEndDateFrom,
      endDateTo: this.appliedEndDateTo,
      priorities: this.appliedPriorities,
      statuses: this.appliedStatuses,
    };
  }

  private projectDraftSignals(): ProjectAppliedSignals {
    return {
      departments: this.draftDepartments,
      members: this.draftMembers,
      endDateFrom: this.draftEndDateFrom,
      endDateTo: this.draftEndDateTo,
      priorities: this.draftPriorities,
      statuses: this.draftStatuses,
    };
  }

  private persistAppliedFilters(): void {
    this.filterState.persistProject(FILTER_SCREEN, this.projectAppliedSignals());
  }

  toggleFilterDropdown(which: ProjectFilterDropdown, event: MouseEvent): void {
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
    this.draftDepartments.set(new Set());
    this.draftMembers.set(new Set());
    this.draftEndDateFrom.set('');
    this.draftEndDateTo.set('');
    this.draftPriorities.set(new Set());
    this.draftStatuses.set(new Set());
    this.openFilterDropdown.set(null);
  }

  onRegister(): void {
    void this.router.navigate(['/projects/register']);
  }

  onRowClick(row: ProjectRow): void {
    void this.router.navigate(['/projects', row.managementNumber]);
  }

  onProjectRowAction(action: RowActionId, row: ProjectRow): void {
    if (action === 'edit') {
      void this.router.navigate(['/projects', row.managementNumber, 'edit']);
      return;
    }
    this.rowActionFeedback.set(null);
    this.rowConfirm.set({
      kind: action,
      managementNumber: row.managementNumber,
      name: row.name,
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
      return `「${c.name}」をアーカイブしますか？紐づく課題もまとめて非表示になります。`;
    }
    return `「${c.name}」をゴミ箱へ移動しますか？紐づく課題もまとめて移動します。`;
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
        ? this.projectService.archiveProject(c.managementNumber, actor)
        : this.projectService.softDeleteProject(c.managementNumber, actor);
    this.rowConfirm.set(null);
    if (result.ok) {
      this.rowActionFeedback.set(
        c.kind === 'archive'
          ? 'プロジェクトをアーカイブしました。'
          : 'プロジェクトをゴミ箱へ移動しました。',
      );
      return;
    }
    if (result.reason === 'notFound') {
      this.rowActionFeedback.set('プロジェクトが見つかりませんでした。');
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

  calculateProgressPercent(row: ProjectRow): number {
    return calculateDisplayedProjectProgress(row, this.taskService.getTaskRows());
  }
}
