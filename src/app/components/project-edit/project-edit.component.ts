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

import { ProjectService } from '../../services/project-service/project-service';
import { AuthService } from '../../services/auth-service/auth.service';
import type {
  ProjectMemberRole,
  ProjectMilestone,
  ProjectParticipant,
  ProjectRow,
  ProjectUpdateLogChange,
} from '../project-list/project-row';
import { PROJECT_MEMBER_ROLES } from '../project-list/project-row';
import {
  calculateDisplayedProjectProgress,
  projectHasLinkedTasks,
} from '../project-list/project-display-progress';
import { TaskService } from '../../services/task-service/task-service';
import { taskProgressPercentForStatus, type TaskRowStatus } from '../task-list/task-row';
import { nowUtcIso, todayIsoDateInJapan } from '../../shared/japan-datetime';

function trimz(s: string): string {
  return s.trim();
}

function minArrayLength(min: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = control.value;
    if (!Array.isArray(v) || v.length < min) {
      return { minArrayLength: { min, actual: Array.isArray(v) ? v.length : 0 } };
    }
    return null;
  };
}

function departmentsSignature(depts: readonly string[]): string {
  return [...depts]
    .map((d) => trimz(d))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .join('\u0000');
}

function participantsSignature(parts: readonly ProjectParticipant[]): string {
  const rows = parts
    .map((p) => ({
      department: trimz(p.department),
      name: trimz(p.name),
      role: trimz(String(p.role)),
    }))
    .filter((p) => p.department && p.name)
    .sort((a, b) => {
      const c = a.department.localeCompare(b.department, 'ja');
      return c !== 0 ? c : a.name.localeCompare(b.name, 'ja');
    });
  return JSON.stringify(rows);
}

function collectProjectEditChanges(
  existing: ProjectRow,
  v: {
    name: string;
    description: string;
    endDate: string;
    priority: string;
    status: string;
    progressPercent: number;
    workStartDate: string;
    completedAt: string;
    approver: string;
  },
  milestoneRows: ProjectMilestone[],
  approverInputEnabled: boolean,
  departmentsNext: string[],
  participantsNext: ProjectParticipant[],
): ProjectUpdateLogChange[] {
  const changes: ProjectUpdateLogChange[] = [];

  if (trimz(existing.name) !== trimz(v.name)) {
    changes.push({ kind: 'field', fieldLabel: 'プロジェクト名', newValue: trimz(v.name) });
  }
  if (trimz(existing.description) !== trimz(v.description)) {
    changes.push({ kind: 'field', fieldLabel: 'プロジェクト内容', newValue: trimz(v.description) });
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
  if (existing.progressPercent !== Number(v.progressPercent)) {
    changes.push({ kind: 'field', fieldLabel: '進捗率', newValue: `${Number(v.progressPercent)}%` });
  }
  if (trimz(existing.workStartDate) !== trimz(v.workStartDate)) {
    changes.push({ kind: 'field', fieldLabel: '着手開始日', newValue: trimz(v.workStartDate) || '—' });
  }
  if (trimz(existing.completedAt) !== trimz(v.completedAt)) {
    changes.push({ kind: 'field', fieldLabel: '完了日', newValue: trimz(v.completedAt) || '—' });
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
  if (participantsSignature(existing.participants) !== participantsSignature(participantsNext)) {
    changes.push({
      kind: 'field',
      fieldLabel: '参加メンバー',
      newValue: participantsNext
        .map((p) => `${trimz(p.name)}（${trimz(p.department)}・${trimz(String(p.role))}）`)
        .join('、'),
    });
  }

  const oldMap = new Map<string, string>();
  for (const m of existing.milestones) {
    const t = trimz(m.title);
    if (t) {
      oldMap.set(t, trimz(m.targetDate ?? ''));
    }
  }
  const newMap = new Map<string, string>();
  for (const m of milestoneRows) {
    const t = trimz(m.title);
    if (t) {
      newMap.set(t, trimz(m.targetDate ?? ''));
    }
  }
  const titles = new Set([...oldMap.keys(), ...newMap.keys()]);
  for (const title of [...titles].sort((a, b) => a.localeCompare(b, 'ja'))) {
    const o = oldMap.get(title);
    const n = newMap.get(title);
    if (o !== undefined && n !== undefined) {
      if (o !== n) {
        changes.push({ kind: 'milestone_date', milestoneTitle: title, newDate: n || '未設定' });
      }
    } else if (n !== undefined) {
      changes.push({ kind: 'field', fieldLabel: `マイルストーン（${title}）`, newValue: n || '未設定' });
    } else if (o !== undefined) {
      changes.push({ kind: 'field', fieldLabel: `マイルストーン（${title}）`, newValue: '削除' });
    }
  }

  return changes;
}

@Component({
  selector: 'app-project-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './project-edit.component.html',
  styleUrl: './project-edit.component.scss',
})
export class ProjectEditComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly taskService = inject(TaskService);
  private paramSub?: Subscription;

  readonly notFound = signal(false);
  readonly managementNumber = signal('');

  submitted = false;
  participantSubmitError = false;

  readonly memberRoleOptions = PROJECT_MEMBER_ROLES;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    departments: this.fb.nonNullable.control<string[]>([], {
      validators: [minArrayLength(1)],
    }),
    endDate: ['', Validators.required],
    priority: ['', Validators.required],
    status: ['', Validators.required],
    progressPercent: [0, [Validators.required]],
    workStartDate: [''],
    completedAt: [''],
    approver: [{ value: '', disabled: true }],
    participants: this.fb.array<FormGroup>([]),
    milestones: this.fb.array<FormGroup>([]),
  });

  readonly priorityOptions = this.projectService.getRegisterPriorityOptions();
  readonly statusOptions = this.projectService.getRegisterStatusOptions();

  /** 紐づく課題があるとき進捗は課題から算出し、フォームでは編集不可 */
  get progressPercentFromLinkedTasks(): boolean {
    const id = this.managementNumber().trim();
    if (!id || this.notFound()) {
      return false;
    }
    return projectHasLinkedTasks(this.taskService.getTaskRows(), id);
  }

  constructor() {
    this.form.controls.status.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncApproverControlState();
      this.syncProgressAfterStatusChange();
    });

    this.paramSub = this.route.paramMap.subscribe((pm) => {
      const id = pm.get('managementNumber')?.trim() ?? '';
      this.managementNumber.set(id);
      const row = id ? this.projectService.getProjectByManagementNumber(id) : undefined;
      if (!row) {
        this.notFound.set(true);
        return;
      }
      
      this.notFound.set(false);
      this.submitted = false;
      const tasks = this.taskService.getTaskRows();
      this.form.patchValue(
        {
          name: row.name,
          description: row.description,
          endDate: row.endDate,
          priority: row.priority,
          status: row.status,
          progressPercent: calculateDisplayedProjectProgress(row, tasks),
          workStartDate: row.workStartDate,
          completedAt: row.completedAt,
          approver: row.status === '確認待ち' ? row.approver : '',
        },
        { emitEvent: false },
      );
      this.form.controls.departments.setValue([...row.departments].sort((a, b) => a.localeCompare(b, 'ja')), {
        emitEvent: false,
      });
      this.rebuildParticipantsFromRow(row);
      this.rebuildMilestonesFromRow(row);
      this.syncApproverControlState();
      this.syncProgressPercentControlForLinkedTasks();
    });
  }

  get milestones(): FormArray {
    return this.form.get('milestones') as FormArray;
  }

  get participants(): FormArray {
    return this.form.get('participants') as FormArray;
  }

  get allDepartments(): string[] {
    return this.projectService.getAllDepartmentsForSelect();
  }

  get departmentsAvailableInPicker(): string[] {
    const selected = new Set(this.form.controls.departments.value);
    return this.allDepartments.filter((d) => !selected.has(d));
  }

  get selectedDepartmentsSorted(): string[] {
    return [...this.form.controls.departments.value].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  get approverOptions(): string[] {
    return this.projectService.getApproverOptions();
  }

  /** 新規登録と同じ: ステータスが「確認待ち」のときだけ承認者を必須・入力可 */
  get approverInputEnabled(): boolean {
    return this.form.controls.status.value === '確認待ち';
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
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

  /** 紐づく課題があるとき: 課題由来の表示用進捗をフォームへ */
  private syncLinkedTaskDerivedProgress(): void {
    const id = this.managementNumber().trim();
    if (!id || this.notFound()) {
      return;
    }
    const tasks = this.taskService.getTaskRows();
    const row = this.projectService.getProjectByManagementNumber(id);
    if (!row) {
      return;
    }
    const quasi: ProjectRow = {
      ...row,
      status: this.form.controls.status.value,
      progressPercent: Number(this.form.controls.progressPercent.value),
    };
    const p = calculateDisplayedProjectProgress(quasi, tasks);
    this.form.controls.progressPercent.setValue(p, { emitEvent: false });
  }

  private syncProgressAfterStatusChange(): void {
    if (this.progressPercentFromLinkedTasks) {
      this.syncLinkedTaskDerivedProgress();
      return;
    }
    const status = this.form.controls.status.value as TaskRowStatus;
    const cur = Number(this.form.controls.progressPercent.value);
    const next = taskProgressPercentForStatus(status, cur);
    this.form.controls.progressPercent.setValue(next, { emitEvent: false });
    this.applyNoLinkedProgressPercentControl(status);
  }

  /** 紐づく課題なし: 着手中のみ 0〜89 を編集可。それ以外は無効＋ルール値 */
  private applyNoLinkedProgressPercentControl(status: TaskRowStatus): void {
    const ctrl = this.form.controls.progressPercent;
    if (status === '着手中') {
      ctrl.enable({ emitEvent: false });
      ctrl.setValidators([Validators.required, Validators.min(0), Validators.max(89)]);
    } else {
      ctrl.disable({ emitEvent: false });
      ctrl.clearValidators();
      ctrl.setValidators([Validators.required]);
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  private syncProgressPercentControlForLinkedTasks(): void {
    const ctrl = this.form.controls.progressPercent;
    if (this.progressPercentFromLinkedTasks) {
      ctrl.disable({ emitEvent: false });
      ctrl.clearValidators();
      ctrl.setValidators([Validators.required]);
      this.syncLinkedTaskDerivedProgress();
    } else {
      ctrl.enable({ emitEvent: false });
      const st = this.form.controls.status.value as TaskRowStatus;
      const n = taskProgressPercentForStatus(st, Number(ctrl.value));
      ctrl.setValue(n, { emitEvent: false });
      this.applyNoLinkedProgressPercentControl(st);
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  private rebuildParticipantsFromRow(row: ProjectRow): void {
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
          role: [p.role as ProjectMemberRole],
        }),
      );
    }
  }

  staffForDepartment(department: string): string[] {
    return this.projectService.getStaffByDepartment(department.trim());
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
      role: ['メンバー' as ProjectMemberRole],
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

  private rebuildMilestonesFromRow(row: ProjectRow): void {
    while (this.milestones.length > 0) {
      this.milestones.removeAt(0);
    }
    if (row.milestones.length === 0) {
      this.milestones.push(this.createMilestoneGroup());
      return;
    }
    for (const m of row.milestones) {
      this.milestones.push(
        this.fb.nonNullable.group({
          title: [m.title],
          targetDate: [m.targetDate ?? ''],
        }),
      );
    }
  }

  createMilestoneGroup(): FormGroup {
    return this.fb.nonNullable.group({
      title: [''],
      targetDate: [''],
    });
  }

  addMilestoneRow(): void {
    this.milestones.push(this.createMilestoneGroup());
  }

  removeMilestoneRow(index: number): void {
    if (this.milestones.length <= 1) {
      (this.milestones.at(0) as FormGroup).patchValue({ title: '', targetDate: '' });
      return;
    }
    this.milestones.removeAt(index);
  }

  cancel(): void {
    const id = this.managementNumber();
    void this.router.navigate(id ? ['/projects', id] : ['/projects', 'list']);
  }

  onSubmit(): void {
    const id = this.managementNumber();
    if (!id || this.notFound()) {
      return;
    }
    this.submitted = true;
    this.participantSubmitError = false;
    if (this.form.invalid) {
      return;
    }
    const existing = this.projectService.getProjectByManagementNumber(id);
    if (!existing) {
      return;
    }

    const selected = new Set(this.form.controls.departments.value);
    const fullParticipants: ProjectParticipant[] = this.participants.controls
      .map((c) => (c as FormGroup).getRawValue() as ProjectParticipant)
      .filter((p) => p.department.trim() && p.name.trim() && p.role);

    if (fullParticipants.length === 0) {
      this.participantSubmitError = true;
      return;
    }
    if (!fullParticipants.every((p) => selected.has(p.department.trim()))) {
      this.participantSubmitError = true;
      return;
    }

    const v = this.form.getRawValue();
    const statusTrim = v.status.trim() as TaskRowStatus;
    const tasks = this.taskService.getTaskRows();
    const hasLinked = projectHasLinkedTasks(tasks, id);
    const rowForCalc: ProjectRow = {
      ...existing,
      status: v.status.trim(),
      progressPercent: hasLinked ? existing.progressPercent : Number(v.progressPercent),
    };
    const finalProgress = hasLinked
      ? calculateDisplayedProjectProgress(rowForCalc, tasks)
      : taskProgressPercentForStatus(statusTrim, Number(v.progressPercent));
    const vForLog = { ...v, progressPercent: finalProgress };

    const milestoneRows: ProjectMilestone[] = this.milestones.controls
      .map((c) => (c as FormGroup).getRawValue() as { title: string; targetDate: string })
      .filter((m) => m.title.trim().length > 0)
      .map((m) => {
        const title = m.title.trim();
        const td = m.targetDate.trim();
        return td ? { title, targetDate: td } : { title };
      });

    const approverName = this.approverInputEnabled ? v.approver.trim() : '';
    const editor = this.auth.currentUser()?.displayName?.trim() ?? '';
    if (!editor) {
      void this.router.navigate(['/login']);
      return;
    }
    const lastUpdatedBy = editor;

    const departmentsSorted = [...v.departments].sort((a, b) => a.localeCompare(b, 'ja'));
    const participantsNormalized = fullParticipants.map((p) => ({
      department: p.department.trim(),
      name: p.name.trim(),
      role: p.role,
    }));
    const members = [...new Set(participantsNormalized.map((p) => p.name))];

    const changes = collectProjectEditChanges(
      existing,
      vForLog,
      milestoneRows,
      this.approverInputEnabled,
      departmentsSorted,
      participantsNormalized,
    );
    
    const ok = this.projectService.updateProject(
      id,
      {
        name: v.name.trim(),
        description: v.description.trim(),
        departments: departmentsSorted,
        participants: participantsNormalized,
        members,
        endDate: v.endDate,
        priority: v.priority.trim(),
        status: v.status.trim(),
        progressPercent: finalProgress,
        workStartDate: v.workStartDate.trim(),
        completedAt: v.completedAt.trim(),
        approver: approverName,
        milestones: milestoneRows,
        lastUpdatedAt: todayIsoDateInJapan(),
        lastUpdatedBy,
      },
      changes.length > 0
        ? { changes, at: nowUtcIso(), by: lastUpdatedBy }
        : undefined,
    );
    if (ok) {
      void this.router.navigate(['/projects', id]);
    }
  }
}
