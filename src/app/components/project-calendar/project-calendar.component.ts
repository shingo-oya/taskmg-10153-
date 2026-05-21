import { Component, HostListener, computed, inject, signal, type WritableSignal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';

import { FilterPresetsComponent } from '../shared/filter-presets/filter-presets.component';
import { ListFilterStateBridge } from '../../services/list-filter/list-filter-state.bridge';
import {
  readProjectFilterSnapshot,
  type ProjectAppliedSignals,
} from '../../services/list-filter/list-filter-snapshot';
import type { FilterScreenId, FilterSnapshot } from '../../services/list-filter/list-filter.types';
import {
  calendarDayTone,
  isCalendarSatTone,
  isCalendarSunTone,
} from '../../shared/calendar-day-style';
import { calculateDisplayedProjectProgress } from '../project-list/project-display-progress';
import { PermissionService } from '../../services/permission/permission.service';
import { ProjectService } from '../../services/project-service/project-service';
import { TaskService } from '../../services/task-service/task-service';
import {
  type ProjectMultiFilterCriteria,
  type ProjectRow,
} from '../project-list/project-row';
import { monthAnchorDateInJapan, todayIsoDateInJapan } from '../../shared/japan-datetime';

export type CalCell = { dateKey: string | null; dayNum: number | null; trackId: string };

export type CalWeek = { cells: CalCell[] };

type ProjectFilterDropdown = 'department' | 'member' | 'priority' | 'status';

const FILTER_SCREEN: FilterScreenId = 'project-calendar';

@Component({
  selector: 'app-project-calendar',
  standalone: true,
  imports: [RouterLink, FilterPresetsComponent],
  templateUrl: './project-calendar.component.html',
  styleUrl: './project-calendar.component.scss',
})
export class ProjectCalendarComponent {
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  private readonly router = inject(Router);
  private readonly filterState = inject(ListFilterStateBridge);
  readonly perm = inject(PermissionService);

  constructor() {
    this.filterState.restoreProject(FILTER_SCREEN, this.projectAppliedSignals());
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

  readonly filteredProjects = computed((): ProjectRow[] => {
    const rows = this.projectService.getProjectRows();
    const criteria: ProjectMultiFilterCriteria = {
      departments: this.appliedDepartments(),
      members: this.appliedMembers(),
      endDateFrom: this.appliedEndDateFrom(),
      endDateTo: this.appliedEndDateTo(),
      priorities: this.appliedPriorities(),
      statuses: this.appliedStatuses(),
    };
    return this.projectService.filterProjects(rows, criteria);
  });

  readonly weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'] as const;

  readonly calendarDayTone = calendarDayTone;
  readonly isCalendarSatTone = isCalendarSatTone;
  readonly isCalendarSunTone = isCalendarSunTone;

  /** 表示中の月の 1 日（日本時間の暦） */
  readonly viewMonth = signal(monthAnchorDateInJapan());

  readonly monthModel = computed(() => {
    const start = this.viewMonth();
    const year = start.getFullYear();
    const month = start.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: CalCell[] = [];
    let seq = 0;
    const nextId = (): string => `c${seq++}`;
    for (let i = 0; i < firstDow; i++) {
      cells.push({ dateKey: null, dayNum: null, trackId: nextId() });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateKey, dayNum: d, trackId: nextId() });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ dateKey: null, dayNum: null, trackId: nextId() });
    }
    const weeks: CalWeek[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push({ cells: cells.slice(i, i + 7) });
    }
    return { year, month, weeks };
  });

  /** フィルタ適用後のプロジェクトを終了予定日でグルーピング */
  readonly projectsByEndDate = computed(() => {
    const map = new Map<string, ProjectRow[]>();
    for (const row of this.filteredProjects()) {
      const k = row.endDate?.trim() ?? '';
      if (!k) {
        continue;
      }
      const list = map.get(k) ?? [];
      list.push(row);
      map.set(k, list);
    }
    return map;
  });

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

  formatMultiSelectLabel(s: ReadonlySet<string>): string {
    if (s.size === 0) {
      return 'すべて';
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ja')).join('、');
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

  clearDraftFilters(): void {
    this.draftDepartments.set(new Set());
    this.draftMembers.set(new Set());
    this.draftEndDateFrom.set('');
    this.draftEndDateTo.set('');
    this.draftPriorities.set(new Set());
    this.draftStatuses.set(new Set());
    this.openFilterDropdown.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.panelOpen()) {
      this.closePanelWithoutApply();
    }
  }

  monthTitle(): string {
    const d = this.viewMonth();
    return `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
  }

  todayDateKey(): string {
    return todayIsoDateInJapan();
  }

  statusBadgeClasses(status: string): string {
    return `cal-card__status cal-card__status--${this.statusModifierClass(status)}`;
  }

  weekTrack(week: CalWeek): string {
    return week.cells.map((c) => c.trackId).join('|');
  }

  prevMonth(): void {
    this.viewMonth.update((d) => {
      const y = d.getFullYear();
      const m = d.getMonth();
      return new Date(y, m - 1, 1);
    });
  }

  nextMonth(): void {
    this.viewMonth.update((d) => {
      const y = d.getFullYear();
      const m = d.getMonth();
      return new Date(y, m + 1, 1);
    });
  }

  goThisMonth(): void {
    this.viewMonth.set(monthAnchorDateInJapan());
  }

  projectsOn(dateKey: string): ProjectRow[] {
    return this.projectsByEndDate().get(dateKey) ?? [];
  }

  displayedProgressPercent(row: ProjectRow): number {
    return calculateDisplayedProjectProgress(row, this.taskService.getTaskRows());
  }

  departmentsText(row: ProjectRow): string {
    return row.departments.length ? row.departments.join('、') : '—';
  }

  /** CSS 修飾子（BEM サフィックス） */
  statusModifierClass(status: string): string {
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

  cellAriaLabel(cell: CalCell): string {
    if (!cell.dateKey) {
      return '';
    }
    const n = this.projectsOn(cell.dateKey).length;
    return `${cell.dateKey}、終了予定 ${n}件`;
  }

  onRegister(): void {
    void this.router.navigate(['/projects/register']);
  }
}
