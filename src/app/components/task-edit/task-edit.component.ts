import { Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  TASK_TYPE_OPTIONS,
  type TaskRow,
  type TaskRowStatus,
  type TaskUpdateLogChange,
  taskProgressPercentForStatus,
} from '../task-list/task-row';
import { AuthService } from '../../services/auth-service/auth.service';
import { IssueTypeService } from '../../services/issue-type/issue-type.service';
import type { IssueTypePreset } from '../../services/issue-type/issue-type.types';
import { ProjectService } from '../../services/project-service/project-service';
import { resolveProjectManagementNumber } from '../../shared/task-hierarchy';
import { TaskService } from '../../services/task-service/task-service';
import { nowUtcIso, todayIsoDateInJapan } from '../../shared/japan-datetime';

function minArrayLength(min: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = control.value;
    if (!Array.isArray(v) || v.length < min) {
      return { minArrayLength: { min, actual: Array.isArray(v) ? v.length : 0 } };
    }
    return null;
  };
}

function trimz(s: string): string {
  return s.trim();
}

function departmentsSignature(depts: readonly string[]): string {
  return [...depts]
    .map((d) => trimz(d))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .join('\u0000');
}

function taskParticipantsSignature(parts: readonly { department: string; name: string }[]): string {
  const rows = parts
    .map((p) => ({
      department: trimz(p.department),
      name: trimz(p.name),
    }))
    .filter((p) => p.department && p.name)
    .sort((a, b) => {
      const c = a.department.localeCompare(b.department, 'ja');
      return c !== 0 ? c : a.name.localeCompare(b.name, 'ja');
    });
  return JSON.stringify(rows);
}

/** プロジェクト編集の `collectProjectEditChanges` と同様、更新情報パネル用の変更一覧を組み立てる */
function collectTaskEditChanges(
  existing: TaskRow,
  v: {
    type: string;
    taskname: string;
    taskContent: string;
    endDate: string;
    priority: string;
    status: string;
    progressPercent: number;
    startedOn: string;
    completedOn: string;
    approver: string;
  },
  approverInputEnabled: boolean,
  departmentsNext: string[],
  participantsNext: { department: string; name: string }[],
): TaskUpdateLogChange[] {
  const changes: TaskUpdateLogChange[] = [];

  if (trimz(existing.type) !== trimz(v.type)) {
    changes.push({ kind: 'field', fieldLabel: '種別', newValue: trimz(v.type) });
  }
  if (trimz(existing.taskname) !== trimz(v.taskname)) {
    changes.push({ kind: 'field', fieldLabel: '課題名', newValue: trimz(v.taskname) });
  }
  if (trimz(existing.taskContent) !== trimz(v.taskContent)) {
    changes.push({ kind: 'field', fieldLabel: '課題内容', newValue: trimz(v.taskContent) || '—' });
  }
  if (trimz(existing.endDate) !== trimz(v.endDate)) {
    changes.push({ kind: 'field', fieldLabel: '終了予定日', newValue: trimz(v.endDate) });
  }
  if (trimz(existing.priority) !== trimz(v.priority)) {
    changes.push({ kind: 'field', fieldLabel: '優先度', newValue: trimz(v.priority) });
  }
  if (trimz(existing.status) !== trimz(v.status)) {
    changes.push({ kind: 'field', fieldLabel: 'ステータス', newValue: trimz(v.status) });
  }

  const nextStatus = trimz(v.status) as TaskRowStatus;
  const existingProgress = taskProgressPercentForStatus(existing.status, existing.progressPercent);
  const nextProgress = taskProgressPercentForStatus(nextStatus, Number(v.progressPercent));
  if (existingProgress !== nextProgress) {
    changes.push({ kind: 'field', fieldLabel: '進捗率', newValue: `${nextProgress}%` });
  }

  if (trimz(existing.startedOn) !== trimz(v.startedOn)) {
    changes.push({ kind: 'field', fieldLabel: '着手開始日', newValue: trimz(v.startedOn) || '—' });
  }
  if (trimz(existing.completedOn) !== trimz(v.completedOn)) {
    changes.push({ kind: 'field', fieldLabel: '完了日', newValue: trimz(v.completedOn) || '—' });
  }

  const newApprover = approverInputEnabled ? trimz(v.approver) : '';
  if (trimz(existing.approver) !== newApprover) {
    changes.push({ kind: 'field', fieldLabel: '承認者', newValue: newApprover || '—' });
  }

  if (departmentsSignature(existing.departments) !== departmentsSignature(departmentsNext)) {
    changes.push({
      kind: 'field',
      fieldLabel: '担当部署',
      newValue: [...departmentsNext]
        .map((d) => trimz(d))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'ja'))
        .join('、'),
    });
  }
  if (taskParticipantsSignature(existing.participants) !== taskParticipantsSignature(participantsNext)) {
    changes.push({
      kind: 'field',
      fieldLabel: '担当者',
      newValue: participantsNext.map((p) => `${trimz(p.name)}（${trimz(p.department)}）`).join('、'),
    });
  }

  return changes;
}

@Component({
  selector: 'app-task-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './task-edit.component.html',
  styleUrl: './task-edit.component.scss',
})
export class TaskEditComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly issueTypeService = inject(IssueTypeService);

  private paramSub?: Subscription;

  readonly notFound = signal(false);
  readonly managementNo = signal('');

  submitted = false;
  participantSubmitError = false;

  readonly legacyTypePresetId = '__legacy__';
  readonly fallbackTaskTypeOptions = [...TASK_TYPE_OPTIONS];
  readonly priorityOptions = this.taskService.getRegisterPriorityOptions();
  readonly statusOptions = this.taskService.getRegisterStatusOptions();

  readonly form = this.fb.nonNullable.group({
    type: ['', Validators.required],
    taskname: ['', Validators.required],
    taskContent: [''],
    departments: this.fb.nonNullable.control<string[]>([], {
      validators: [minArrayLength(1)],
    }),
    endDate: ['', Validators.required],
    priority: ['', Validators.required],
    status: ['', Validators.required],
    progressPercent: [0, [Validators.required]],
    startedOn: [''],
    completedOn: [''],
    approver: [{ value: '', disabled: true }],
    participants: this.fb.array<FormGroup>([]),
  });

  get participants(): FormArray {
    return this.form.get('participants') as FormArray;
  }

  get allDepartments(): string[] {
    return this.taskService.getAllDepartmentsForSelect();
  }

  get departmentsAvailableInPicker(): string[] {
    const selected = new Set(this.form.controls.departments.value);
    return this.allDepartments.filter((d) => !selected.has(d));
  }

  get selectedDepartmentsSorted(): string[] {
    return [...this.form.controls.departments.value].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  get approverOptions(): string[] {
    return this.taskService.getApproverOptions();
  }

  /** プロジェクト編集と同じ: ステータスが「確認待ち」のときだけ承認者を必須・入力可 */
  get approverInputEnabled(): boolean {
    return this.form.controls.status.value === '確認待ち';
  }

  get issueTypePresets(): IssueTypePreset[] {
    return this.issueTypeService.presetsForTaskSelect();
  }

  get useIssueTypePresets(): boolean {
    return this.issueTypePresets.length > 0;
  }

  get selectedTypePresetId(): string {
    return this.resolveTypePresetId();
  }

  get showLegacyTypeOption(): boolean {
    return this.resolveTypePresetId() === this.legacyTypePresetId;
  }

  get legacyTypeLabel(): string {
    return this.form.controls.type.value.trim();
  }

  issueTypePresetLabel(preset: IssueTypePreset): string {
    return this.issueTypeService.presetLabel(preset);
  }

  onTypePresetChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (!id || id === this.legacyTypePresetId) {
      return;
    }
    const preset = this.issueTypeService.findById(id);
    if (!preset) {
      return;
    }
    this.form.controls.type.setValue(preset.content);
  }

  private resolveTypePresetId(): string {
    const type = this.form.controls.type.value.trim();
    if (!type) {
      return '';
    }
    const matched = this.issueTypeService.findPresetForTaskType(type);
    if (matched) {
      return matched.id;
    }
    const sameContent = this.issueTypePresets.filter((p) => p.content === type);
    if (sameContent.length === 1) {
      return sameContent[0].id;
    }
    if (sameContent.length > 1) {
      return '';
    }
    return this.legacyTypePresetId;
  }

  constructor() {
    this.form.controls.status.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncApproverControlState();
      this.syncProgressPercentWithStatus();
    });

    this.paramSub = this.route.paramMap.subscribe((pm) => {
      const id = pm.get('managementNo')?.trim() ?? '';
      this.managementNo.set(id);
      const row = id ? this.taskService.getTaskByManagementNo(id) : undefined;
      if (!row) {
        this.notFound.set(true);
        return;
      }
      this.notFound.set(false);
      this.submitted = false;
      this.participantSubmitError = false;
      const normalizedProgress = taskProgressPercentForStatus(row.status, row.progressPercent);
      this.form.patchValue(
        {
          type: row.type,
          taskname: row.taskname,
          taskContent: row.taskContent,
          endDate: row.endDate,
          priority: row.priority,
          status: row.status,
          progressPercent: normalizedProgress,
          startedOn: row.startedOn,
          completedOn: row.completedOn,
          approver: row.status === '確認待ち' ? row.approver : '',
        },
        { emitEvent: false },
      );
      this.form.controls.departments.setValue([...row.departments].sort((a, b) => a.localeCompare(b, 'ja')), {
        emitEvent: false,
      });
      this.rebuildParticipantsFromRow(row);
      this.syncApproverControlState();
      this.applyProgressPercentControlForStatus(row.status);
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
  }

  private rebuildParticipantsFromRow(row: TaskRow): void {
    while (this.participants.length > 0) {
      this.participants.removeAt(0);
    }
    if (row.participants.length === 0) {
      this.participants.push(this.createParticipantGroup());
      return;
    }
    for (const p of row.participants) {
      this.participants.push(
        this.fb.nonNullable.group({
          department: [p.department],
          name: [p.name],
        }),
      );
    }
  }

  staffForDepartment(department: string): string[] {
    return this.taskService.getStaffByDepartment(department.trim());
  }

  participantDepartmentAt(index: number): string {
    const g = this.participants.at(index) as FormGroup;
    return String(g.get('department')?.value ?? '').trim();
  }

  onDepartmentPickerChange(event: Event): void {
    const el = event.target as HTMLSelectElement;
    const d = el.value.trim();
    if (!d) {
      return;
    }
    const cur = [...this.form.controls.departments.value];
    if (!cur.includes(d)) {
      this.form.controls.departments.setValue([...cur, d].sort((a, b) => a.localeCompare(b, 'ja')));
      this.pruneParticipantsAfterDepartmentChange();
    }
    el.selectedIndex = 0;
  }

  removeDepartment(dept: string): void {
    const next = this.form.controls.departments.value.filter((x) => x !== dept);
    this.form.controls.departments.setValue(next);
    this.pruneParticipantsAfterDepartmentChange();
  }

  private pruneParticipantsAfterDepartmentChange(): void {
    const allowed = new Set(this.form.controls.departments.value);
    for (const ctrl of this.participants.controls) {
      const g = ctrl as FormGroup;
      const d = (g.get('department')!.value as string).trim();
      if (!allowed.has(d)) {
        g.patchValue({ department: '', name: '' });
      }
    }
  }

  onParticipantDepartmentChange(index: number): void {
    const g = this.participants.at(index) as FormGroup;
    g.get('name')!.setValue('');
  }

  createParticipantGroup(): FormGroup {
    return this.fb.nonNullable.group({
      department: [''],
      name: [''],
    });
  }

  addParticipantRow(): void {
    this.participants.push(this.createParticipantGroup());
  }

  removeParticipantRow(index: number): void {
    if (this.participants.length <= 1) {
      return;
    }
    this.participants.removeAt(index);
  }

  private syncProgressPercentWithStatus(): void {
    const status = this.form.controls.status.value as TaskRowStatus;
    const cur = Number(this.form.controls.progressPercent.value);
    const next = taskProgressPercentForStatus(status, cur);
    this.form.controls.progressPercent.setValue(next, { emitEvent: false });
    this.applyProgressPercentControlForStatus(status);
  }

  /** 着手中のみ進捗を編集可。それ以外はステータスに応じた固定値で無効化 */
  private applyProgressPercentControlForStatus(status: TaskRowStatus): void {
    const ctrl = this.form.controls.progressPercent;
    if (status === '着手中') {
      ctrl.enable({ emitEvent: false });
      ctrl.setValidators([Validators.required, Validators.min(0), Validators.max(89)]);
    } else {
      ctrl.disable({ emitEvent: false });
      ctrl.clearValidators();
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  private syncApproverControlState(): void {
    const appr = this.form.controls.approver;
    if (this.approverInputEnabled) {
      appr.enable({ emitEvent: false });
      appr.setValidators([Validators.required]);
    } else {
      appr.setValue('', { emitEvent: false });
      appr.disable({ emitEvent: false });
      appr.clearValidators();
    }
    appr.updateValueAndValidity({ emitEvent: false });
  }

  cancel(): void {
    const id = this.managementNo();
    void this.router.navigate(id ? ['/tasks', id] : ['/tasks', 'list']);
  }

  onSubmit(): void {
    const id = this.managementNo();
    if (!id || this.notFound()) {
      return;
    }
    this.submitted = true;
    this.participantSubmitError = false;
    if (this.form.invalid) {
      return;
    }
    const existing = this.taskService.getTaskByManagementNo(id);
    if (!existing) {
      return;
    }

    const selected = new Set(this.form.controls.departments.value);
    const fullParticipants = this.participants.controls
      .map((c) => (c as FormGroup).getRawValue() as { department: string; name: string })
      .filter((p) => p.department.trim() && p.name.trim());

    if (fullParticipants.length === 0) {
      this.participantSubmitError = true;
      return;
    }
    if (!fullParticipants.every((p) => selected.has(p.department.trim()))) {
      this.participantSubmitError = true;
      return;
    }

    const v = this.form.getRawValue();
    const approverName = this.approverInputEnabled ? v.approver.trim() : '';
    const editor = this.auth.currentUser()?.displayName?.trim() ?? '';
    if (!editor) {
      void this.router.navigate(['/login']);
      return;
    }
    const lastUpdatedBy = editor;

    const names = [...new Set(fullParticipants.map((p) => p.name.trim()))];
    const departmentsSorted = [...v.departments].sort((a, b) => a.localeCompare(b, 'ja'));
    const participantsNormalized = fullParticipants.map((p) => ({
      department: p.department.trim(),
      name: p.name.trim(),
    }));

    const logDate = todayIsoDateInJapan();
    const changes = collectTaskEditChanges(
      existing,
      {
        type: v.type,
        taskname: v.taskname,
        taskContent: v.taskContent,
        endDate: v.endDate,
        priority: v.priority,
        status: v.status,
        progressPercent: Number(v.progressPercent),
        startedOn: v.startedOn,
        completedOn: v.completedOn,
        approver: v.approver,
      },
      this.approverInputEnabled,
      departmentsSorted,
      participantsNormalized,
    );

    const ok = this.taskService.updateTask(
      id,
      {
        type: v.type.trim(),
        taskname: v.taskname.trim(),
        name: existing.managementNumber ? existing.name : v.taskname.trim(),
        taskContent: v.taskContent.trim(),
        departments: departmentsSorted,
        members: names.join('、'),
        participants: participantsNormalized,
        endDate: v.endDate,
        priority: v.priority.trim() as typeof existing.priority,
        status: v.status.trim() as typeof existing.status,
        progressPercent: taskProgressPercentForStatus(
          v.status.trim() as TaskRowStatus,
          Number(v.progressPercent),
        ),
        startedOn: v.startedOn.trim(),
        completedOn: v.completedOn.trim(),
        approver: approverName,
        lastUpdatedAt: logDate,
        lastUpdatedBy,
      },
      changes.length > 0 ? { changes, at: nowUtcIso(), by: lastUpdatedBy } : undefined,
    );
    if (ok) {
      const projectMn = resolveProjectManagementNumber(existing, this.taskService.getTaskRows());
      if (projectMn) {
        this.projectService.syncProjectProgressPercentFromTasks(projectMn, lastUpdatedBy);
      }
      void this.router.navigate(['/tasks', id]);
    }
  }
}
