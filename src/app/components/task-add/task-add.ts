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
import { Router, RouterLink, ActivatedRoute } from '@angular/router';

import { TASK_TYPE_OPTIONS, type TaskRow, type TaskRowStatus, taskProgressPercentForStatus } from '../task-list/task-row';
import { AuthService } from '../../services/auth-service/auth.service';
import { IssueTypeService } from '../../services/issue-type/issue-type.service';
import type { IssueTypePreset } from '../../services/issue-type/issue-type.types';
import { RegistrationTemplateService } from '../../services/registration-template/registration-template.service';
import type { TaskRegistrationTemplate } from '../../services/registration-template/registration-template.types';
import { ProjectService } from '../../services/project-service/project-service';
import { TaskService } from '../../services/task-service/task-service';
import { nowUtcIso, todayIsoDateInJapan } from '../../shared/japan-datetime';
import { withUpdateLogId } from '../../shared/update-log-id';

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
  selector: 'app-task-add',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './task-add.html',
  styleUrl: './task-add.scss',
})
export class TaskAddComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly issueTypeService = inject(IssueTypeService);
  private readonly registrationTemplateService = inject(RegistrationTemplateService);

  submitted = false;
  participantSubmitError = false;

  /** プロジェクト詳細の「課題を新規登録」から遷移したときの管理番号（なければ null） */
  linkedFromProjectMn: string | null = null;
  /** 上記プロジェクト名（表示用） */
  linkedFromProjectName = '';
  /** 親課題詳細から子課題として登録 */
  linkedFromParentMn: string | null = null;
  linkedFromParentName = '';

  readonly legacyTypePresetId = '__legacy__';
  readonly fallbackTaskTypeOptions = [...TASK_TYPE_OPTIONS];

  readonly form = this.fb.nonNullable.group({
    type: ['課題', Validators.required],
    managementNo: [{ value: '', disabled: true }, Validators.required],
    taskname: ['', Validators.required],
    taskContent: ['', Validators.required],
    departments: this.fb.nonNullable.control<string[]>([], {
      validators: [minArrayLength(1)],
    }),
    endDate: ['', Validators.required],
    priority: ['中', Validators.required],
    registeredOn: [todayIsoDateInJapan(), Validators.required],
    startedOn: [''],
    completedOn: [''],
    status: ['未着手', Validators.required],
    progressPercent: [0, [Validators.required]],
    approver: [{ value: '', disabled: true }],
    participants: this.fb.array<FormGroup>([]),
  });

  get participants(): FormArray {
    return this.form.get('participants') as FormArray;
  }

  get allDepartments(): string[] {
    return this.taskService.getAllDepartmentsForSelect();
  }

  get priorityOptions(): readonly string[] {
    return this.taskService.getRegisterPriorityOptions();
  }

  get statusOptions(): readonly string[] {
    return this.taskService.getRegisterStatusOptions();
  }

  get approverOptions(): string[] {
    return this.taskService.getApproverOptions();
  }

  /** ステータスが「確認待ち」のときだけ承認者を入力必須にする（プロジェクト登録と同様） */
  get approverInputEnabled(): boolean {
    return this.form.controls.status.value === '確認待ち';
  }

  get taskRegistrationTemplates(): TaskRegistrationTemplate[] {
    return this.registrationTemplateService.listTaskTemplates();
  }

  get hasTaskRegistrationTemplates(): boolean {
    return this.taskRegistrationTemplates.length > 0;
  }

  onTaskTemplateSelect(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (!id) {
      return;
    }
    const template = this.registrationTemplateService.findTaskTemplate(id);
    if (!template) {
      return;
    }
    this.form.patchValue({
      type: template.type,
      taskname: template.taskname,
      taskContent: template.taskContent,
      departments: [...template.departments],
    });
    if (template.departments.length > 0) {
      this.pruneParticipantsAfterDepartmentChange();
    }
  }

  ngOnInit(): void {
    if (this.participants.length === 0) {
      this.participants.push(this.createParticipantGroup());
    }

    const parentMn = this.route.snapshot.queryParamMap.get('parent')?.trim() ?? '';
    if (parentMn) {
      const parent = this.taskService.getTaskByManagementNo(parentMn);
      if (parent && !parent.parentTaskManagementNo?.trim()) {
        this.linkedFromParentMn = parentMn;
        this.linkedFromParentName = parent.taskname;
        const pmn = parent.managementNumber.trim();
        if (pmn) {
          const proj = this.projectService.getProjectByManagementNumber(pmn);
          if (proj) {
            this.linkedFromProjectMn = pmn;
            this.linkedFromProjectName = proj.name;
          }
        }
      }
    } else {
      const projectMn = this.route.snapshot.queryParamMap.get('project')?.trim() ?? '';
      if (projectMn) {
        const proj = this.projectService.getProjectByManagementNumber(projectMn);
        if (proj) {
          this.linkedFromProjectMn = projectMn;
          this.linkedFromProjectName = proj.name;
        }
      }
    }

    const managementNo = this.linkedFromParentMn
      ? this.taskService.generateChildManagementNumber(this.linkedFromParentMn)
      : this.taskService.generateManagementNumber();
    this.form.controls.managementNo.setValue(managementNo);

    const statusCtrl = this.form.controls.status;
    statusCtrl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncApproverControlState();
      this.syncProgressPercentWithStatus();
    });
    this.syncApproverControlState();
    this.syncProgressPercentWithStatus();
    this.applyInitialIssueTypePreset();
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

  private applyInitialIssueTypePreset(): void {
    const presets = this.issueTypePresets;
    if (presets.length === 0) {
      return;
    }
    const preferred = presets.find((p) => p.content === '課題') ?? presets[0];
    this.form.controls.type.setValue(preferred.content);
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
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  staffForDepartment(department: string): string[] {
    return this.taskService.getStaffByDepartment(department.trim());
  }

  participantDepartmentAt(index: number): string {
    const g = this.participants.at(index) as FormGroup;
    return String(g.get('department')?.value ?? '').trim();
  }

  get departmentsAvailableInPicker(): string[] {
    const selected = new Set(this.form.controls.departments.value);
    return this.allDepartments.filter((d) => !selected.has(d));
  }

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

  cancel(): void {
    void this.router.navigate(this.taskAddBackLink());
  }

  taskAddBackLink(): string[] {
    if (this.linkedFromParentMn) {
      return ['/tasks', this.linkedFromParentMn];
    }
    return this.linkedFromProjectMn ? ['/projects', this.linkedFromProjectMn] : ['/tasks', 'list'];
  }

  onSubmit(): void {
    this.submitted = true;
    this.participantSubmitError = false;
    if (this.form.invalid) {
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
    const names = [...new Set(fullParticipants.map((p) => p.name.trim()))];
    const creator = this.auth.currentUser()?.displayName?.trim() ?? '';
    if (!creator) {
      void this.router.navigate(['/login']);
      return;
    }
    const taskname = v.taskname.trim();
    const approverName = String(v.approver ?? '').trim();
    const lastUpdatedBy = creator;

    const parentMn = this.linkedFromParentMn?.trim() ?? '';
    const projectMn = this.linkedFromProjectMn?.trim() ?? '';
    const projectRow = projectMn ? this.projectService.getProjectByManagementNumber(projectMn) : undefined;
    const isChild = !!parentMn;

    const row: TaskRow = {
      managementNumber: isChild ? '' : projectRow ? projectMn : '',
      name: isChild ? '' : projectRow ? projectRow.name : taskname,
      parentTaskManagementNo: isChild ? parentMn : '',
      type: v.type.trim(),
      managementNo: v.managementNo.trim(),
      taskname,
      taskContent: v.taskContent.trim(),
      creator,
      departments: [...v.departments].sort((a, b) => a.localeCompare(b, 'ja')),
      members: names.join('、'),
      endDate: v.endDate,
      priority: v.priority.trim() as TaskRow['priority'],
      status: v.status.trim() as TaskRow['status'],
      registeredOn: v.registeredOn,
      startedOn: v.startedOn.trim(),
      completedOn: v.completedOn.trim(),
      approver: approverName,
      progressPercent: taskProgressPercentForStatus(
        v.status.trim() as TaskRowStatus,
        Number(v.progressPercent),
      ),
      lastUpdatedAt: todayIsoDateInJapan(),
      lastUpdatedBy,
      participants: fullParticipants.map((p) => ({
        department: p.department.trim(),
        name: p.name.trim(),
      })),
      resourceFolders: [],
      updateHistory: [
        withUpdateLogId({
          at: nowUtcIso(),
          by: creator,
          summary: '課題を新規登録',
        }),
      ],
    };

    this.taskService.addTask(row);
    if (projectRow && !isChild) {
      this.projectService.addRelatedIssue(projectMn, {
        taskManagementNo: row.managementNo,
        name: row.taskname,
      });
      this.projectService.syncProjectProgressPercentFromTasks(projectMn, creator);
    }
    if (isChild) {
      void this.router.navigate(['/tasks', parentMn]);
    } else if (projectRow) {
      void this.router.navigate(['/projects', projectMn]);
    } else {
      void this.router.navigate(['/tasks', 'list']);
    }
  }
}
