import { Component, HostListener, computed, inject, signal, type WritableSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { FilterPresetsComponent } from '../shared/filter-presets/filter-presets.component';
import { ListFilterStateBridge } from '../../services/list-filter/list-filter-state.bridge';
import {
  readTaskFilterSnapshot,
  type TaskAppliedSignals,
} from '../../services/list-filter/list-filter-snapshot';
import type { FilterScreenId, FilterSnapshot } from '../../services/list-filter/list-filter.types';
import type { ProjectMilestone } from '../project-list/project-row';
import { PermissionService } from '../../services/permission/permission.service';
import { ProjectService } from '../../services/project-service/project-service';
import {
  calendarDayTone,
  isCalendarSatTone,
  isCalendarSunTone,
} from '../../shared/calendar-day-style';
import {
  isChildTask,
  resolveProjectManagementNumber,
  sortTasksParentChildGrouped,
} from '../../shared/task-hierarchy';
import { TaskService } from '../../services/task-service/task-service';
import {
  type TaskMultiFilterCriteria,
  type TaskRow,
  taskMemberNames,
} from '../task-list/task-row';
import { monthAnchorDateInJapan, nowUtcIso, todayIsoDateInJapan } from '../../shared/japan-datetime';
import {
  addDaysToIsoDateKey,
  monthDayMarkerStyle,
  monthSegmentStyle,
  parseIsoDateKey,
} from './task-gantt-date';

export type GanttDayMarkerKind = 'registered' | 'end' | 'completed';

export interface GanttDayMarker {
  dateKey: string;
  kind: GanttDayMarkerKind;
}

export interface GanttTaskTimeline {
  task: TaskRow;
  bar: { start: string; end: string } | null;
  dayMarkers: GanttDayMarker[];
}

export interface GanttProjectGroup {
  managementNumber: string;
  name: string;
  milestones: ProjectMilestone[];
  tasks: GanttTaskTimeline[];
}

type TaskFilterDropdown = 'type' | 'department' | 'member' | 'priority' | 'status';

const FILTER_SCREEN: FilterScreenId = 'task-gantt';

type GanttDragMode = 'move' | 'resize-start' | 'resize-end';

interface GanttDragState {
  managementNo: string;
  mode: GanttDragMode;
  pointerId: number;
  timelineWidth: number;
  startClientX: number;
  origStarted: string;
  origEnd: string;
  origRegistered: string;
  origCompleted: string;
  hadStartedOn: boolean;
}

interface DragDateResult {
  startedOn: string;
  endDate: string;
  registeredOn?: string;
  completedOn?: string;
}

@Component({
  selector: 'app-task-gantt',
  standalone: true,
  imports: [RouterLink, FilterPresetsComponent],
  templateUrl: './task-gantt.html',
  styleUrl: './task-gantt.scss',
})
export class TaskGanttComponent {
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly filterState = inject(ListFilterStateBridge);
  readonly perm = inject(PermissionService);

  constructor() {
    this.filterState.restoreTask(FILTER_SCREEN, this.taskAppliedSignals());
  }

  private readonly dataVersion = signal(0);
  private readonly dragState = signal<GanttDragState | null>(null);

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
  readonly viewMonth = signal(monthAnchorDateInJapan());

  readonly calendarDayTone = calendarDayTone;
  readonly isCalendarSatTone = isCalendarSatTone;
  readonly isCalendarSunTone = isCalendarSunTone;

  readonly filteredTasks = computed((): TaskRow[] => {
    this.dataVersion();
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

  readonly timelineMonth = computed(() => {
    const start = this.viewMonth();
    const year = start.getFullYear();
    const month = start.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: { dateKey: string; dayNum: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dateKey, dayNum: d });
    }
    return { year, month, daysInMonth, days };
  });

  readonly projectGroups = computed((): GanttProjectGroup[] => {
    const all = this.taskService.getTaskRows();
    const map = new Map<string, GanttProjectGroup>();
    for (const task of this.filteredTasks()) {
      const pmn = resolveProjectManagementNumber(task, all);
      const groupKey = pmn || '';
      let group = map.get(groupKey);
      if (!group) {
        const proj = pmn ? this.projectService.getProjectByManagementNumber(pmn) : undefined;
        group = {
          managementNumber: pmn,
          name: pmn ? (proj?.name?.trim() ?? '') : '',
          milestones: proj?.milestones ?? [],
          tasks: [],
        };
        map.set(groupKey, group);
      }
      group.tasks.push(this.buildTaskTimeline(task));
    }
    for (const group of map.values()) {
      const ordered = sortTasksParentChildGrouped(group.tasks.map((t) => t.task));
      group.tasks = ordered.map((task) => this.buildTaskTimeline(task));
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
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
    this.dataVersion.update((v) => v + 1);
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
    this.dataVersion.update((v) => v + 1);
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

  prevMonth(): void {
    this.viewMonth.update((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  nextMonth(): void {
    this.viewMonth.update((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  goThisMonth(): void {
    this.viewMonth.set(monthAnchorDateInJapan());
  }

  isChildTaskRow(row: TaskRow): boolean {
    return isChildTask(row);
  }

  departmentsText(row: TaskRow): string {
    return row.departments.length ? row.departments.join('、') : '—';
  }

  membersText(row: TaskRow): string {
    const names = taskMemberNames(row);
    return names.length ? names.join('、') : '—';
  }

  statusBarClass(status: string): string {
    return `gantt__bar--${this.statusModifierClass(status)}`;
  }

  barStyle(bar: { start: string; end: string }): { left: string; width: string } | null {
    const tm = this.timelineMonth();
    const seg = monthSegmentStyle(bar.start, bar.end, tm.year, tm.month, tm.daysInMonth);
    if (!seg.visible) {
      return null;
    }
    return { left: `${seg.left}%`, width: `${seg.width}%` };
  }

  markerStyle(dateKey: string): { left: string; width: string } | null {
    const tm = this.timelineMonth();
    const seg = monthDayMarkerStyle(dateKey, tm.year, tm.month, tm.daysInMonth);
    if (!seg.visible) {
      return null;
    }
    return { left: `${seg.left}%`, width: `${seg.width}%` };
  }

  milestoneStyle(ms: ProjectMilestone): { left: string; width: string } | null {
    const k = ms.targetDate?.trim() ?? '';
    if (!k) {
      return null;
    }
    return this.markerStyle(k);
  }

  markerLabel(kind: GanttDayMarkerKind): string {
    switch (kind) {
      case 'registered':
        return '登録日';
      case 'end':
        return '終了予定日';
      case 'completed':
        return '完了日';
    }
  }

  markerSymbol(kind: GanttDayMarkerKind): string {
    switch (kind) {
      case 'registered':
        return '▶';
      case 'end':
        return '◀';
      case 'completed':
        return '';
    }
  }

  isDatePointMarker(kind: GanttDayMarkerKind): boolean {
    return kind === 'registered' || kind === 'end';
  }

  onBarPointerDown(event: PointerEvent, task: TaskRow, timelineEl: HTMLElement): void {
    if (event.button !== 0) {
      return;
    }
    const bar = this.buildTaskTimeline(task).bar;
    if (!bar) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.beginDrag(event, task, timelineEl, true, bar.start, bar.end);
  }

  onMarkerPointerDown(event: PointerEvent, task: TaskRow, timelineEl: HTMLElement): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const reg = task.registeredOn?.trim() ?? '';
    const end = task.endDate?.trim() ?? '';
    this.beginDrag(event, task, timelineEl, false, reg, end || reg);
  }

  onTimelinePointerMove(event: PointerEvent, timelineEl: HTMLElement): void {
    const drag = this.dragState();
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    event.preventDefault();
  }

  onTimelinePointerUp(event: PointerEvent, timelineEl: HTMLElement): void {
    const drag = this.dragState();
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    try {
      timelineEl.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }

    const deltaDays = this.clientDeltaToDays(event.clientX - drag.startClientX, drag.timelineWidth);
    this.dragState.set(null);

    if (deltaDays !== 0) {
      this.commitDrag(drag, deltaDays);
    }
  }

  onRegister(): void {
    void this.router.navigate(['/tasks/add']);
  }

  private buildTaskTimeline(task: TaskRow): GanttTaskTimeline {
    const started = task.startedOn?.trim() ?? '';
    const registered = task.registeredOn?.trim() ?? '';
    const end = task.endDate?.trim() ?? '';
    const completed = task.completedOn?.trim() ?? '';

    if (!started) {
      const dayMarkers: GanttDayMarker[] = [];
      if (registered) {
        dayMarkers.push({ dateKey: registered, kind: 'registered' });
      }
      if (end && end !== registered) {
        dayMarkers.push({ dateKey: end, kind: 'end' });
      }
      return { task, bar: null, dayMarkers };
    }

    const barEnd = end || started;
    const dayMarkers: GanttDayMarker[] = [];
    if (completed) {
      dayMarkers.push({ dateKey: completed, kind: 'completed' });
    }

    return {
      task,
      bar: { start: started, end: barEnd },
      dayMarkers,
    };
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

  private resolveDragMode(x: number, width: number): GanttDragMode {
    const edge = Math.min(8, width * 0.08);
    if (x <= edge) {
      return 'resize-start';
    }
    if (x >= width - edge) {
      return 'resize-end';
    }
    return 'move';
  }

  private beginDrag(
    event: PointerEvent,
    task: TaskRow,
    timelineEl: HTMLElement,
    hadStartedOn: boolean,
    rangeStart: string,
    rangeEnd: string,
  ): void {
    const rect = timelineEl.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const w = rect.width;
    const mode = hadStartedOn ? this.resolveDragMode(x, w) : 'move';

    this.dragState.set({
      managementNo: task.managementNo,
      mode,
      pointerId: event.pointerId,
      timelineWidth: w,
      startClientX: event.clientX,
      origStarted: rangeStart,
      origEnd: rangeEnd,
      origRegistered: task.registeredOn?.trim() ?? '',
      origCompleted: task.completedOn?.trim() ?? '',
      hadStartedOn,
    });

    timelineEl.setPointerCapture(event.pointerId);
  }

  private clientDeltaToDays(deltaPx: number, timelineWidth: number): number {
    const tm = this.timelineMonth();
    if (timelineWidth <= 0) {
      return 0;
    }
    const dayWidth = timelineWidth / tm.daysInMonth;
    return Math.round(deltaPx / dayWidth);
  }

  private datesAfterDrag(drag: GanttDragState, deltaDays: number): DragDateResult | null {
    if (deltaDays === 0) {
      return null;
    }

    const task = this.taskService.getTaskByManagementNo(drag.managementNo);
    if (!task) {
      return null;
    }

    if (!drag.hadStartedOn) {
      const reg = drag.origRegistered;
      const end = drag.origEnd;
      const newEnd = end ? addDaysToIsoDateKey(end, deltaDays) : null;
      if (!newEnd) {
        return null;
      }
      return {
        startedOn: '',
        registeredOn: reg,
        endDate: newEnd,
        completedOn: drag.origCompleted || undefined,
      };
    }

    const newStart = addDaysToIsoDateKey(drag.origStarted, deltaDays);
    const newEnd = addDaysToIsoDateKey(drag.origEnd, deltaDays);
    if (!newEnd) {
      return null;
    }

    // バー中央ドラッグ: 終了予定日のみ（着手開始日は固定）
    if (drag.mode === 'move') {
      const startFixed = drag.origStarted;
      if (parseIsoDateKey(newEnd)! < parseIsoDateKey(startFixed)!) {
        return { startedOn: newEnd, endDate: startFixed, completedOn: drag.origCompleted || undefined };
      }
      return { startedOn: startFixed, endDate: newEnd, completedOn: drag.origCompleted || undefined };
    }

    if (drag.mode === 'resize-start') {
      if (!newStart) {
        return null;
      }
      const endFixed = drag.origEnd;
      const start = newStart;
      if (parseIsoDateKey(start)! > parseIsoDateKey(endFixed)!) {
        return { startedOn: endFixed, endDate: start, completedOn: drag.origCompleted || undefined };
      }
      return { startedOn: start, endDate: endFixed, completedOn: drag.origCompleted || undefined };
    }

    const startFixed = drag.origStarted;
    const end = newEnd;
    if (parseIsoDateKey(end)! < parseIsoDateKey(startFixed)!) {
      return { startedOn: end, endDate: startFixed, completedOn: drag.origCompleted || undefined };
    }
    return { startedOn: startFixed, endDate: end, completedOn: drag.origCompleted || undefined };
  }

  private commitDrag(drag: GanttDragState, deltaDays: number): void {
    const next = this.datesAfterDrag(drag, deltaDays);
    if (!next) {
      return;
    }

    const task = this.taskService.getTaskByManagementNo(drag.managementNo);
    if (!task) {
      return;
    }

    const today = todayIsoDateInJapan();
    const by = task.lastUpdatedBy?.trim() || 'システム';
    const changes: { kind: 'field'; fieldLabel: string; newValue: string }[] = [];
    const updates: Partial<TaskRow> = {
      lastUpdatedAt: today,
      lastUpdatedBy: by,
    };

    if (drag.hadStartedOn) {
      updates.startedOn = next.startedOn;
      updates.endDate = next.endDate;
      if (next.startedOn !== drag.origStarted) {
        changes.push({ kind: 'field', fieldLabel: '着手開始日', newValue: next.startedOn });
      }
      if (next.endDate !== drag.origEnd) {
        changes.push({ kind: 'field', fieldLabel: '終了予定日', newValue: next.endDate });
      }
      if (drag.origCompleted && next.completedOn && next.completedOn !== drag.origCompleted) {
        updates.completedOn = next.completedOn;
        changes.push({ kind: 'field', fieldLabel: '完了日', newValue: next.completedOn });
      }
    } else {
      if (next.registeredOn !== undefined && next.registeredOn !== drag.origRegistered) {
        updates.registeredOn = next.registeredOn;
        changes.push({ kind: 'field', fieldLabel: '登録日', newValue: next.registeredOn });
      }
      updates.endDate = next.endDate;
      if (next.endDate !== drag.origEnd) {
        changes.push({ kind: 'field', fieldLabel: '終了予定日', newValue: next.endDate });
      }
      if (drag.origCompleted && next.completedOn && next.completedOn !== drag.origCompleted) {
        updates.completedOn = next.completedOn;
        changes.push({ kind: 'field', fieldLabel: '完了日', newValue: next.completedOn });
      }
    }

    const ok = this.taskService.updateTask(
      drag.managementNo,
      updates,
      changes.length > 0 ? { at: nowUtcIso(), by, changes } : undefined,
    );
    if (ok) {
      this.dataVersion.update((v) => v + 1);
      const mn = resolveProjectManagementNumber(task, this.taskService.getTaskRows());
      if (mn) {
        this.projectService.syncProjectProgressPercentFromTasks(mn, by);
      }
    }
  }
}
