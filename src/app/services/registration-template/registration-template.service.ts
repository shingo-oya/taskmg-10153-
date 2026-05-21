import { Injectable, signal } from '@angular/core';

import type {
  ProjectRegistrationTemplate,
  ProjectTemplateInput,
  TaskRegistrationTemplate,
  TaskTemplateInput,
} from './registration-template.types';

const PROJECT_STORAGE_KEY = 'taskmg-project-registration-templates';
const TASK_STORAGE_KEY = 'taskmg-task-registration-templates';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `reg-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeDepartments(departments: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of departments) {
    const t = d.trim();
    if (!t || seen.has(t)) {
      continue;
    }
    seen.add(t);
    out.push(t);
  }
  return out.sort((a, b) => a.localeCompare(b, 'ja'));
}

@Injectable({
  providedIn: 'root',
})
export class RegistrationTemplateService {
  private readonly projectTemplates = signal<ProjectRegistrationTemplate[]>(this.loadProjects());
  private readonly taskTemplates = signal<TaskRegistrationTemplate[]>(this.loadTasks());
  private readonly revision = signal(0);

  readonly templatesRevision = this.revision.asReadonly();

  listProjectTemplates(): ProjectRegistrationTemplate[] {
    this.revision();
    return [...this.projectTemplates()].sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }

  listTaskTemplates(): TaskRegistrationTemplate[] {
    this.revision();
    return [...this.taskTemplates()].sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }

  findProjectTemplate(id: string): ProjectRegistrationTemplate | undefined {
    return this.projectTemplates().find((t) => t.id === id);
  }

  findTaskTemplate(id: string): TaskRegistrationTemplate | undefined {
    return this.taskTemplates().find((t) => t.id === id);
  }

  projectTemplateSummary(t: ProjectRegistrationTemplate): string {
    const depts =
      t.departments.length > 0 ? ` / ${t.departments.join('・')}` : '';
    return `${t.label}（${t.name}${depts}）`;
  }

  taskTemplateSummary(t: TaskRegistrationTemplate): string {
    const depts =
      t.departments.length > 0 ? ` / ${t.departments.join('・')}` : '';
    return `${t.label}（${t.type}・${t.taskname}${depts}）`;
  }

  addProject(
    input: ProjectTemplateInput,
  ): { ok: true; template: ProjectRegistrationTemplate } | { ok: false; reason: 'empty' | 'duplicate' } {
    const label = input.label.trim();
    const name = input.name.trim();
    if (!label || !name) {
      return { ok: false, reason: 'empty' };
    }
    if (this.isDuplicateProjectLabel(label)) {
      return { ok: false, reason: 'duplicate' };
    }
    const template: ProjectRegistrationTemplate = {
      id: newId(),
      label,
      name,
      description: input.description.trim(),
      departments: normalizeDepartments(input.departments),
      createdAt: new Date().toISOString(),
    };
    this.projectTemplates.update((list) => [...list, template]);
    this.persistProjects();
    return { ok: true, template };
  }

  updateProject(
    id: string,
    input: ProjectTemplateInput,
  ): { ok: true } | { ok: false; reason: 'empty' | 'duplicate' | 'notFound' } {
    const label = input.label.trim();
    const name = input.name.trim();
    if (!label || !name) {
      return { ok: false, reason: 'empty' };
    }
    const idx = this.projectTemplates().findIndex((t) => t.id === id);
    if (idx < 0) {
      return { ok: false, reason: 'notFound' };
    }
    if (this.isDuplicateProjectLabel(label, id)) {
      return { ok: false, reason: 'duplicate' };
    }
    this.projectTemplates.update((list) => {
      const next = [...list];
      next[idx] = {
        ...next[idx],
        label,
        name,
        description: input.description.trim(),
        departments: normalizeDepartments(input.departments),
      };
      return next;
    });
    this.persistProjects();
    return { ok: true };
  }

  deleteProject(id: string): { ok: true } | { ok: false; reason: 'notFound' } {
    const idx = this.projectTemplates().findIndex((t) => t.id === id);
    if (idx < 0) {
      return { ok: false, reason: 'notFound' };
    }
    this.projectTemplates.update((list) => list.filter((t) => t.id !== id));
    this.persistProjects();
    return { ok: true };
  }

  addTask(
    input: TaskTemplateInput,
  ): { ok: true; template: TaskRegistrationTemplate } | { ok: false; reason: 'empty' | 'duplicate' } {
    const label = input.label.trim();
    const type = input.type.trim();
    const taskname = input.taskname.trim();
    const taskContent = input.taskContent.trim();
    if (!label || !type || !taskname || !taskContent) {
      return { ok: false, reason: 'empty' };
    }
    if (this.isDuplicateTaskLabel(label)) {
      return { ok: false, reason: 'duplicate' };
    }
    const template: TaskRegistrationTemplate = {
      id: newId(),
      label,
      type,
      taskname,
      taskContent,
      departments: normalizeDepartments(input.departments),
      createdAt: new Date().toISOString(),
    };
    this.taskTemplates.update((list) => [...list, template]);
    this.persistTasks();
    return { ok: true, template };
  }

  updateTask(
    id: string,
    input: TaskTemplateInput,
  ): { ok: true } | { ok: false; reason: 'empty' | 'duplicate' | 'notFound' } {
    const label = input.label.trim();
    const type = input.type.trim();
    const taskname = input.taskname.trim();
    const taskContent = input.taskContent.trim();
    if (!label || !type || !taskname || !taskContent) {
      return { ok: false, reason: 'empty' };
    }
    const idx = this.taskTemplates().findIndex((t) => t.id === id);
    if (idx < 0) {
      return { ok: false, reason: 'notFound' };
    }
    if (this.isDuplicateTaskLabel(label, id)) {
      return { ok: false, reason: 'duplicate' };
    }
    this.taskTemplates.update((list) => {
      const next = [...list];
      next[idx] = {
        ...next[idx],
        label,
        type,
        taskname,
        taskContent,
        departments: normalizeDepartments(input.departments),
      };
      return next;
    });
    this.persistTasks();
    return { ok: true };
  }

  deleteTask(id: string): { ok: true } | { ok: false; reason: 'notFound' } {
    const idx = this.taskTemplates().findIndex((t) => t.id === id);
    if (idx < 0) {
      return { ok: false, reason: 'notFound' };
    }
    this.taskTemplates.update((list) => list.filter((t) => t.id !== id));
    this.persistTasks();
    return { ok: true };
  }

  private isDuplicateProjectLabel(label: string, exceptId?: string): boolean {
    const key = label.trim();
    return this.projectTemplates().some((t) => {
      if (exceptId && t.id === exceptId) {
        return false;
      }
      return t.label.trim() === key;
    });
  }

  private isDuplicateTaskLabel(label: string, exceptId?: string): boolean {
    const key = label.trim();
    return this.taskTemplates().some((t) => {
      if (exceptId && t.id === exceptId) {
        return false;
      }
      return t.label.trim() === key;
    });
  }

  private loadProjects(): ProjectRegistrationTemplate[] {
    return this.loadArray(PROJECT_STORAGE_KEY, this.isValidProjectTemplate);
  }

  private loadTasks(): TaskRegistrationTemplate[] {
    return this.loadArray(TASK_STORAGE_KEY, this.isValidTaskTemplate);
  }

  private loadArray<T>(
    key: string,
    validator: (v: unknown) => v is T,
  ): T[] {
    const raw = this.readRaw(key);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((item) => validator(item));
    } catch {
      return [];
    }
  }

  private persistProjects(): void {
    this.revision.update((v) => v + 1);
    this.writeRaw(PROJECT_STORAGE_KEY, this.projectTemplates());
  }

  private persistTasks(): void {
    this.revision.update((v) => v + 1);
    this.writeRaw(TASK_STORAGE_KEY, this.taskTemplates());
  }

  private readRaw(key: string): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(key);
  }

  private writeRaw(key: string, data: unknown): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      /* quota */
    }
  }

  private isValidProjectTemplate(v: unknown): v is ProjectRegistrationTemplate {
    if (typeof v !== 'object' || v === null) {
      return false;
    }
    const t = v as ProjectRegistrationTemplate;
    return (
      typeof t.id === 'string' &&
      typeof t.label === 'string' &&
      typeof t.name === 'string' &&
      typeof t.description === 'string' &&
      Array.isArray(t.departments) &&
      t.departments.every((d) => typeof d === 'string') &&
      typeof t.createdAt === 'string'
    );
  }

  private isValidTaskTemplate(v: unknown): v is TaskRegistrationTemplate {
    if (typeof v !== 'object' || v === null) {
      return false;
    }
    const t = v as TaskRegistrationTemplate;
    return (
      typeof t.id === 'string' &&
      typeof t.label === 'string' &&
      typeof t.type === 'string' &&
      typeof t.taskname === 'string' &&
      typeof t.taskContent === 'string' &&
      Array.isArray(t.departments) &&
      t.departments.every((d) => typeof d === 'string') &&
      typeof t.createdAt === 'string'
    );
  }
}
