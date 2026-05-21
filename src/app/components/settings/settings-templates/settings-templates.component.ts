import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IssueTypeService } from '../../../services/issue-type/issue-type.service';
import { ProjectService } from '../../../services/project-service/project-service';
import { RegistrationTemplateService } from '../../../services/registration-template/registration-template.service';
import type {
  ProjectRegistrationTemplate,
  TaskRegistrationTemplate,
} from '../../../services/registration-template/registration-template.types';
import { TASK_TYPE_OPTIONS } from '../../task-list/task-row';

type Feedback = null | 'added' | 'empty' | 'duplicate';
type EditFeedback = null | 'empty' | 'duplicate' | 'notFound';
type TemplateKind = 'project' | 'task';


@Component({
  selector: 'app-settings-templates',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './settings-templates.component.html',
  styleUrl: './settings-templates.component.scss',
})
export class SettingsTemplatesComponent {
  private readonly templateService = inject(RegistrationTemplateService);
  private readonly projectService = inject(ProjectService);
  private readonly issueTypeService = inject(IssueTypeService);

  readonly newProjectLabel = signal('');
  readonly newProjectName = signal('');
  readonly newProjectDescription = signal('');
  readonly newProjectDepartments = signal<string[]>([]);
  readonly newProjectFeedback = signal<Feedback>(null);

  readonly editingProjectId = signal<string | null>(null);
  readonly editProjectLabel = signal('');
  readonly editProjectName = signal('');
  readonly editProjectDescription = signal('');
  readonly editProjectDepartments = signal<string[]>([]);
  readonly editProjectFeedback = signal<EditFeedback>(null);
  readonly deleteProjectConfirmId = signal<string | null>(null);

  readonly newTaskLabel = signal('');
  readonly newTaskType = signal('');
  readonly newTaskName = signal('');
  readonly newTaskContent = signal('');
  readonly newTaskDepartments = signal<string[]>([]);
  readonly newTaskFeedback = signal<Feedback>(null);

  readonly editingTaskId = signal<string | null>(null);
  readonly editTaskLabel = signal('');
  readonly editTaskType = signal('');
  readonly editTaskName = signal('');
  readonly editTaskContent = signal('');
  readonly editTaskDepartments = signal<string[]>([]);
  readonly editTaskFeedback = signal<EditFeedback>(null);
  readonly deleteTaskConfirmId = signal<string | null>(null);

  readonly activeTab = signal<TemplateKind>('project');

  setTab(tab: TemplateKind): void {
    if (this.activeTab() === tab) {
      return;
    }
    this.activeTab.set(tab);
    this.cancelEditProject();
    this.cancelEditTask();
  }

  projectTemplates(): ProjectRegistrationTemplate[] {
    return this.templateService.listProjectTemplates();
  }

  taskTemplates(): TaskRegistrationTemplate[] {
    return this.templateService.listTaskTemplates();
  }

  departmentOptions(): string[] {
    return this.projectService.getAllDepartmentsForSelect();
  }

  taskTypeOptions(): string[] {
    const fromPresets = this.issueTypeService.distinctContents();
    if (fromPresets.length > 0) {
      return fromPresets;
    }
    return [...TASK_TYPE_OPTIONS];
  }

  projectSummary(t: ProjectRegistrationTemplate): string {
    return this.templateService.projectTemplateSummary(t);
  }

  taskSummary(t: TaskRegistrationTemplate): string {
    return this.templateService.taskTemplateSummary(t);
  }

  // --- Project: new ---
  onNewProjectLabelInput(event: Event): void {
    this.newProjectLabel.set((event.target as HTMLInputElement).value);
    this.newProjectFeedback.set(null);
  }

  onNewProjectNameInput(event: Event): void {
    this.newProjectName.set((event.target as HTMLInputElement).value);
    this.newProjectFeedback.set(null);
  }

  onNewProjectDescriptionInput(event: Event): void {
    this.newProjectDescription.set((event.target as HTMLTextAreaElement).value);
    this.newProjectFeedback.set(null);
  }

  newProjectDeptsAvailable(): string[] {
    const selected = new Set(this.newProjectDepartments());
    return this.departmentOptions().filter((d) => !selected.has(d));
  }

  newProjectDeptsSorted(): string[] {
    return [...this.newProjectDepartments()].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  onNewProjectDeptPick(event: Event): void {
    const d = (event.target as HTMLSelectElement).value.trim();
    (event.target as HTMLSelectElement).selectedIndex = 0;
    if (!d) {
      return;
    }
    const cur = this.newProjectDepartments();
    if (!cur.includes(d)) {
      this.newProjectDepartments.set([...cur, d].sort((a, b) => a.localeCompare(b, 'ja')));
    }
    this.newProjectFeedback.set(null);
  }

  removeNewProjectDept(dept: string): void {
    this.newProjectDepartments.set(this.newProjectDepartments().filter((x) => x !== dept));
    this.newProjectFeedback.set(null);
  }

  onAddProject(): void {
    const result = this.templateService.addProject({
      label: this.newProjectLabel(),
      name: this.newProjectName(),
      description: this.newProjectDescription(),
      departments: this.newProjectDepartments(),
    });
    if (result.ok) {
      this.newProjectLabel.set('');
      this.newProjectName.set('');
      this.newProjectDescription.set('');
      this.newProjectDepartments.set([]);
      this.newProjectFeedback.set('added');
      return;
    }
    this.newProjectFeedback.set(result.reason);
  }

  // --- Project: edit ---
  startEditProject(t: ProjectRegistrationTemplate): void {
    this.editingProjectId.set(t.id);
    this.editProjectLabel.set(t.label);
    this.editProjectName.set(t.name);
    this.editProjectDescription.set(t.description);
    this.editProjectDepartments.set([...t.departments]);
    this.editProjectFeedback.set(null);
    this.deleteProjectConfirmId.set(null);
  }

  cancelEditProject(): void {
    this.editingProjectId.set(null);
    this.editProjectFeedback.set(null);
    this.deleteProjectConfirmId.set(null);
  }

  onEditProjectLabelInput(event: Event): void {
    this.editProjectLabel.set((event.target as HTMLInputElement).value);
    this.editProjectFeedback.set(null);
    this.deleteProjectConfirmId.set(null);
  }

  onEditProjectNameInput(event: Event): void {
    this.editProjectName.set((event.target as HTMLInputElement).value);
    this.editProjectFeedback.set(null);
    this.deleteProjectConfirmId.set(null);
  }

  onEditProjectDescriptionInput(event: Event): void {
    this.editProjectDescription.set((event.target as HTMLTextAreaElement).value);
    this.editProjectFeedback.set(null);
    this.deleteProjectConfirmId.set(null);
  }

  editProjectDeptsAvailable(): string[] {
    const selected = new Set(this.editProjectDepartments());
    return this.departmentOptions().filter((d) => !selected.has(d));
  }

  editProjectDeptsSorted(): string[] {
    return [...this.editProjectDepartments()].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  onEditProjectDeptPick(event: Event): void {
    const d = (event.target as HTMLSelectElement).value.trim();
    (event.target as HTMLSelectElement).selectedIndex = 0;
    if (!d) {
      return;
    }
    const cur = this.editProjectDepartments();
    if (!cur.includes(d)) {
      this.editProjectDepartments.set([...cur, d].sort((a, b) => a.localeCompare(b, 'ja')));
    }
    this.editProjectFeedback.set(null);
    this.deleteProjectConfirmId.set(null);
  }

  removeEditProjectDept(dept: string): void {
    this.editProjectDepartments.set(this.editProjectDepartments().filter((x) => x !== dept));
    this.editProjectFeedback.set(null);
    this.deleteProjectConfirmId.set(null);
  }

  saveEditProject(): void {
    const id = this.editingProjectId();
    if (!id) {
      return;
    }
    this.deleteProjectConfirmId.set(null);
    const result = this.templateService.updateProject(id, {
      label: this.editProjectLabel(),
      name: this.editProjectName(),
      description: this.editProjectDescription(),
      departments: this.editProjectDepartments(),
    });
    if (result.ok) {
      this.cancelEditProject();
      return;
    }
    this.editProjectFeedback.set(result.reason === 'notFound' ? 'notFound' : result.reason);
  }

  requestDeleteProject(id: string): void {
    this.deleteProjectConfirmId.set(id);
    this.editProjectFeedback.set(null);
  }

  cancelDeleteProject(): void {
    this.deleteProjectConfirmId.set(null);
  }

  confirmDeleteProject(): void {
    const id = this.deleteProjectConfirmId();
    if (!id) {
      return;
    }
    const result = this.templateService.deleteProject(id);
    this.deleteProjectConfirmId.set(null);
    if (result.ok) {
      if (this.editingProjectId() === id) {
        this.cancelEditProject();
      }
      return;
    }
    this.editProjectFeedback.set('notFound');
  }

  // --- Task: new ---
  onNewTaskLabelInput(event: Event): void {
    this.newTaskLabel.set((event.target as HTMLInputElement).value);
    this.newTaskFeedback.set(null);
  }

  onNewTaskTypeChange(event: Event): void {
    this.newTaskType.set((event.target as HTMLSelectElement).value);
    this.newTaskFeedback.set(null);
  }

  onNewTaskNameInput(event: Event): void {
    this.newTaskName.set((event.target as HTMLInputElement).value);
    this.newTaskFeedback.set(null);
  }

  onNewTaskContentInput(event: Event): void {
    this.newTaskContent.set((event.target as HTMLTextAreaElement).value);
    this.newTaskFeedback.set(null);
  }

  newTaskDeptsAvailable(): string[] {
    const selected = new Set(this.newTaskDepartments());
    return this.departmentOptions().filter((d) => !selected.has(d));
  }

  newTaskDeptsSorted(): string[] {
    return [...this.newTaskDepartments()].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  onNewTaskDeptPick(event: Event): void {
    const d = (event.target as HTMLSelectElement).value.trim();
    (event.target as HTMLSelectElement).selectedIndex = 0;
    if (!d) {
      return;
    }
    const cur = this.newTaskDepartments();
    if (!cur.includes(d)) {
      this.newTaskDepartments.set([...cur, d].sort((a, b) => a.localeCompare(b, 'ja')));
    }
    this.newTaskFeedback.set(null);
  }

  removeNewTaskDept(dept: string): void {
    this.newTaskDepartments.set(this.newTaskDepartments().filter((x) => x !== dept));
    this.newTaskFeedback.set(null);
  }

  onAddTask(): void {
    const result = this.templateService.addTask({
      label: this.newTaskLabel(),
      type: this.newTaskType(),
      taskname: this.newTaskName(),
      taskContent: this.newTaskContent(),
      departments: this.newTaskDepartments(),
    });
    if (result.ok) {
      this.newTaskLabel.set('');
      this.newTaskType.set('');
      this.newTaskName.set('');
      this.newTaskContent.set('');
      this.newTaskDepartments.set([]);
      this.newTaskFeedback.set('added');
      return;
    }
    this.newTaskFeedback.set(result.reason);
  }

  // --- Task: edit ---
  startEditTask(t: TaskRegistrationTemplate): void {
    this.editingTaskId.set(t.id);
    this.editTaskLabel.set(t.label);
    this.editTaskType.set(t.type);
    this.editTaskName.set(t.taskname);
    this.editTaskContent.set(t.taskContent);
    this.editTaskDepartments.set([...t.departments]);
    this.editTaskFeedback.set(null);
    this.deleteTaskConfirmId.set(null);
  }

  cancelEditTask(): void {
    this.editingTaskId.set(null);
    this.editTaskFeedback.set(null);
    this.deleteTaskConfirmId.set(null);
  }

  onEditTaskLabelInput(event: Event): void {
    this.editTaskLabel.set((event.target as HTMLInputElement).value);
    this.editTaskFeedback.set(null);
    this.deleteTaskConfirmId.set(null);
  }

  onEditTaskTypeChange(event: Event): void {
    this.editTaskType.set((event.target as HTMLSelectElement).value);
    this.editTaskFeedback.set(null);
    this.deleteTaskConfirmId.set(null);
  }

  onEditTaskNameInput(event: Event): void {
    this.editTaskName.set((event.target as HTMLInputElement).value);
    this.editTaskFeedback.set(null);
    this.deleteTaskConfirmId.set(null);
  }

  onEditTaskContentInput(event: Event): void {
    this.editTaskContent.set((event.target as HTMLTextAreaElement).value);
    this.editTaskFeedback.set(null);
    this.deleteTaskConfirmId.set(null);
  }

  editTaskDeptsAvailable(): string[] {
    const selected = new Set(this.editTaskDepartments());
    return this.departmentOptions().filter((d) => !selected.has(d));
  }

  editTaskDeptsSorted(): string[] {
    return [...this.editTaskDepartments()].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  onEditTaskDeptPick(event: Event): void {
    const d = (event.target as HTMLSelectElement).value.trim();
    (event.target as HTMLSelectElement).selectedIndex = 0;
    if (!d) {
      return;
    }
    const cur = this.editTaskDepartments();
    if (!cur.includes(d)) {
      this.editTaskDepartments.set([...cur, d].sort((a, b) => a.localeCompare(b, 'ja')));
    }
    this.editTaskFeedback.set(null);
    this.deleteTaskConfirmId.set(null);
  }

  removeEditTaskDept(dept: string): void {
    this.editTaskDepartments.set(this.editTaskDepartments().filter((x) => x !== dept));
    this.editTaskFeedback.set(null);
    this.deleteTaskConfirmId.set(null);
  }

  saveEditTask(): void {
    const id = this.editingTaskId();
    if (!id) {
      return;
    }
    this.deleteTaskConfirmId.set(null);
    const result = this.templateService.updateTask(id, {
      label: this.editTaskLabel(),
      type: this.editTaskType(),
      taskname: this.editTaskName(),
      taskContent: this.editTaskContent(),
      departments: this.editTaskDepartments(),
    });
    if (result.ok) {
      this.cancelEditTask();
      return;
    }
    this.editTaskFeedback.set(result.reason === 'notFound' ? 'notFound' : result.reason);
  }

  requestDeleteTask(id: string): void {
    this.deleteTaskConfirmId.set(id);
    this.editTaskFeedback.set(null);
  }

  cancelDeleteTask(): void {
    this.deleteTaskConfirmId.set(null);
  }

  confirmDeleteTask(): void {
    const id = this.deleteTaskConfirmId();
    if (!id) {
      return;
    }
    const result = this.templateService.deleteTask(id);
    this.deleteTaskConfirmId.set(null);
    if (result.ok) {
      if (this.editingTaskId() === id) {
        this.cancelEditTask();
      }
      return;
    }
    this.editTaskFeedback.set('notFound');
  }
}
