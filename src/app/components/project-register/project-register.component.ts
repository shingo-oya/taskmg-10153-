import { Component, DestroyRef, OnInit, inject } from '@angular/core';
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
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth-service/auth.service';
import { ProjectService } from '../../services/project-service/project-service';
import { RegistrationTemplateService } from '../../services/registration-template/registration-template.service';
import type { ProjectRegistrationTemplate } from '../../services/registration-template/registration-template.types';
import { withUpdateLogId } from '../../shared/update-log-id';
import type {
  ProjectMemberRole,
  ProjectMilestone,
  ProjectParticipant,
  ProjectRow,
} from '../project-list/project-row';
import { PROJECT_MEMBER_ROLES } from '../project-list/project-row';
import { taskProgressPercentForStatus, type TaskRowStatus } from '../task-list/task-row';
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

@Component({
  selector: 'app-project-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './project-register.component.html',
  styleUrl: './project-register.component.scss',
})
export class ProjectRegisterComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly projectService = inject(ProjectService);
  private readonly registrationTemplateService = inject(RegistrationTemplateService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  submitted = false;
  participantSubmitError = false;

  readonly memberRoleOptions = PROJECT_MEMBER_ROLES;

  readonly form = this.fb.nonNullable.group({
    managementNumber: [{ value: '', disabled: true }, Validators.required],
    name: ['', Validators.required],
    description: [''],
    departments: this.fb.nonNullable.control<string[]>([], {
      validators: [minArrayLength(1)],
    }),
    endDate: ['', Validators.required],
    priority: ['中', Validators.required],
    registeredAt: [todayIsoDateInJapan(), Validators.required],
    workStartDate: [''],
    completedAt: [''],
    status: ['未着手', Validators.required],
    progressPercent: [0, [Validators.required]],
    approver: [{ value: '', disabled: true }],
    participants: this.fb.array<FormGroup>([]),
    milestones: this.fb.array<FormGroup>([]),
  });

  get participants(): FormArray {
    return this.form.get('participants') as FormArray;
  }

  get milestones(): FormArray {
    return this.form.get('milestones') as FormArray;
  }

  get allDepartments(): string[] {
    return this.projectService.getAllDepartmentsForSelect();
  }

  get priorityOptions(): readonly string[] {
    return this.projectService.getRegisterPriorityOptions();
  }

  get statusOptions(): readonly string[] {
    return this.projectService.getRegisterStatusOptions();
  }

  get approverOptions(): string[] {
    return this.projectService.getApproverOptions();
  }

  /** ステータスが「確認待ち」のときだけ承認者を入力必須にする */
  get approverInputEnabled(): boolean {
    return this.form.controls.status.value === '確認待ち';
  }

  get projectRegistrationTemplates(): ProjectRegistrationTemplate[] {
    return this.registrationTemplateService.listProjectTemplates();
  }

  get hasProjectRegistrationTemplates(): boolean {
    return this.projectRegistrationTemplates.length > 0;
  }

  onProjectTemplateSelect(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (!id) {
      return;
    }
    const template = this.registrationTemplateService.findProjectTemplate(id);
    if (!template) {
      return;
    }
    this.form.patchValue({
      name: template.name,
      description: template.description,
      departments: [...template.departments],
    });
    if (template.departments.length > 0) {
      this.pruneParticipantsAfterDepartmentChange();
    }
  }

  ngOnInit(): void {
    this.form.controls.managementNumber.setValue(this.projectService.generateManagementNumber());
    if (this.participants.length === 0) {
      this.participants.push(this.createParticipantGroup());
    }
    if (this.milestones.length === 0) {
      this.milestones.push(this.createMilestoneGroup());
    }

    const statusCtrl = this.form.controls.status;
    statusCtrl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncApproverControlState();
      this.syncProgressPercentWithStatus();
    });
    this.syncApproverControlState();
    this.syncProgressPercentWithStatus();
  }

  private syncProgressPercentWithStatus(): void {
    const status = this.form.controls.status.value as TaskRowStatus;
    const cur = Number(this.form.controls.progressPercent.value);
    const next = taskProgressPercentForStatus(status, cur);
    this.form.controls.progressPercent.setValue(next, { emitEvent: false });
    this.applyProgressPercentControlForStatus(status);
  }

  private applyProgressPercentControlForStatus(status: TaskRowStatus): void {
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

  staffForDepartment(department: string): string[] {
    return this.projectService.getStaffByDepartment(department.trim());
  }

  participantDepartmentAt(index: number): string {
    const g = this.participants.at(index) as FormGroup;
    return String(g.get('department')?.value ?? '').trim();
  }

  /** プルダウンに出す候補（未選択の部署のみ） */
  get departmentsAvailableInPicker(): string[] {
    const selected = new Set(this.form.controls.departments.value);
    return this.allDepartments.filter((d) => !selected.has(d));
  }

  /** 表示用（ソート済み） */
  get selectedDepartmentsSorted(): string[] {
    return [...this.form.controls.departments.value].sort((a, b) => a.localeCompare(b, 'ja'));
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

  createMilestoneGroup(): FormGroup {
    return this.fb.nonNullable.group({
      title: [''],
      targetDate: [''],
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
    void this.router.navigate(['/projects', 'list']);
  }

  onSubmit(): void {
    this.submitted = true;
    this.participantSubmitError = false;
    if (this.form.invalid) {
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
    const milestoneRows: ProjectMilestone[] = this.milestones.controls
      .map((c) => (c as FormGroup).getRawValue() as { title: string; targetDate: string })
      .filter((m) => m.title.trim().length > 0)
      .map((m) => {
        const title = m.title.trim();
        const td = m.targetDate.trim();
        return td ? { title, targetDate: td } : { title };
      });

    const approverName = this.approverInputEnabled ? String(v.approver ?? '').trim() : '';
    const sessionName = this.auth.currentUser()?.displayName?.trim() ?? '';
    if (!sessionName) {
      void this.router.navigate(['/login']);
      return;
    }
    const lastUpdatedBy = sessionName;

    const row: ProjectRow = {
      managementNumber: v.managementNumber.trim(),
      name: v.name.trim(),
      description: v.description.trim(),
      departments: [...v.departments].sort((a, b) => a.localeCompare(b, 'ja')),
      endDate: v.endDate,
      priority: v.priority.trim(),
      registeredAt: v.registeredAt,
      workStartDate: v.workStartDate.trim(),
      completedAt: v.completedAt.trim(),
      status: v.status.trim(),
      participants: fullParticipants.map((p) => ({
        department: p.department.trim(),
        name: p.name.trim(),
        role: p.role,
      })),
      members: [],
      progressPercent: taskProgressPercentForStatus(
        v.status.trim() as TaskRowStatus,
        Number(v.progressPercent),
      ),
      approver: approverName,
      milestones: milestoneRows,
      relatedIssues: [],
      resourceFolders: [],
      lastUpdatedAt: todayIsoDateInJapan(),
      lastUpdatedBy,
      updateHistory: [
        withUpdateLogId({ at: nowUtcIso(), by: lastUpdatedBy, summary: 'プロジェクトを新規登録' }),
      ],
    };

    this.projectService.addProject(row);
    void this.router.navigate(['/projects', 'list']);
  }
}
