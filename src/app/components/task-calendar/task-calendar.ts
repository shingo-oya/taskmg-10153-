import { Component, HostListener, computed, inject, signal, type WritableSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { FilterPresetsComponent } from '../shared/filter-presets/filter-presets.component';
import { ListFilterStateBridge } from '../../services/list-filter/list-filter-state.bridge';
import {
  readTaskFilterSnapshot,
  type TaskAppliedSignals,
} from '../../services/list-filter/list-filter-snapshot';
import type { FilterScreenId, FilterSnapshot } from '../../services/list-filter/list-filter.types';
import { PermissionService } from '../../services/permission/permission.service';
import { TaskService } from '../../services/task-service/task-service';
import {
  calendarDayTone,
  isCalendarSatTone,
  isCalendarSunTone,
} from '../../shared/calendar-day-style';
import {
  type TaskMultiFilterCriteria,
  type TaskRow,
  taskProgressPercentForStatus,
} from '../task-list/task-row';
import { monthAnchorDateInJapan, todayIsoDateInJapan } from '../../shared/japan-datetime';

export type CalCell = { dateKey: string | null; dayNum: number | null; trackId: string };

export type CalWeek = { cells: CalCell[] };

type TaskFilterDropdown = 'type' | 'department' | 'member' | 'priority' | 'status';

const FILTER_SCREEN: FilterScreenId = 'task-calendar';

@Component({
  selector: 'app-task-calendar',
  standalone: true,
  imports: [RouterLink, FilterPresetsComponent],
  templateUrl: './task-calendar.html',
  styleUrl: './task-calendar.scss',
})
export class TaskCalendarComponent {
  private readonly taskService = inject(TaskService);
  private readonly router = inject(Router);
  private readonly filterState = inject(ListFilterStateBridge);
  readonly perm = inject(PermissionService);

  constructor() {
    this.filterState.restoreTask(FILTER_SCREEN, this.taskAppliedSignals());
  }

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

  readonly filteredTasks = computed((): TaskRow[] => {
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
    return this.taskService.filterTasks(rows, criteria);
  });

  readonly weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'] as const;

  readonly calendarDayTone = calendarDayTone;
  readonly isCalendarSatTone = isCalendarSatTone;
  readonly isCalendarSunTone = isCalendarSunTone;

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

  readonly tasksByEndDate = computed(() => {
    const map = new Map<string, TaskRow[]>();
    for (const row of this.filteredTasks()) {
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

  tasksOn(dateKey: string): TaskRow[] {
    return this.tasksByEndDate().get(dateKey) ?? [];
  }

  displayedProgressPercent(row: TaskRow): number {
    return taskProgressPercentForStatus(row.status, row.progressPercent);
  }

  departmentsText(row: TaskRow): string {
    return row.departments.length ? row.departments.join('、') : '—';
  }

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
    const n = this.tasksOn(cell.dateKey).length;
    return `${cell.dateKey}、終了予定 ${n}件`;
  }


  onRegister(): void {
    void this.router.navigate(['/tasks/add']);
  }
}
