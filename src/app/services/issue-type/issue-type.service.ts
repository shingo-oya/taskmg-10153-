import { Injectable, signal } from '@angular/core';

import { TASK_TYPE_OPTIONS } from '../../components/task-list/task-row';
import type { IssueTypePreset } from './issue-type.types';

const STORAGE_KEY = 'taskmg-issue-type-presets';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `issue-type-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultPresets(): IssueTypePreset[] {
  const now = new Date().toISOString();
  return TASK_TYPE_OPTIONS.map((content) => ({
    id: newId(),
    department: '',
    content,
    createdAt: now,
  }));
}

@Injectable({
  providedIn: 'root',
})
export class IssueTypeService {
  private readonly presets = signal<IssueTypePreset[]>(this.loadInitial());
  private readonly revision = signal(0);

  readonly presetsRevision = this.revision.asReadonly();

  listAll(): IssueTypePreset[] {
    this.revision();
    return [...this.presets()].sort((a, b) => a.content.localeCompare(b.content, 'ja'));
  }

  /** 課題登録・編集の種別プルダウン用 */
  presetsForTaskSelect(): IssueTypePreset[] {
    return this.listAll().filter((p) => p.content.trim());
  }

  presetLabel(preset: IssueTypePreset): string {
    return preset.content;
  }

  /** 課題の種別プルダウン・フィルタ用の種別名一覧 */
  distinctContents(): string[] {
    const set = new Set<string>();
    for (const p of this.listAll()) {
      const c = p.content.trim();
      if (c) {
        set.add(c);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  findById(id: string): IssueTypePreset | undefined {
    return this.presets().find((p) => p.id === id);
  }

  add(content: string): { ok: true; preset: IssueTypePreset } | { ok: false; reason: 'empty' | 'duplicate' } {
    const body = content.trim();
    if (!body) {
      return { ok: false, reason: 'empty' };
    }
    if (this.isDuplicate(body)) {
      return { ok: false, reason: 'duplicate' };
    }
    const preset: IssueTypePreset = {
      id: newId(),
      department: '',
      content: body,
      createdAt: new Date().toISOString(),
    };
    this.presets.update((list) => [...list, preset]);
    this.persist();
    return { ok: true, preset };
  }

  update(id: string, content: string): { ok: true } | { ok: false; reason: 'empty' | 'duplicate' | 'notFound' } {
    const body = content.trim();
    if (!body) {
      return { ok: false, reason: 'empty' };
    }
    const idx = this.presets().findIndex((p) => p.id === id);
    if (idx < 0) {
      return { ok: false, reason: 'notFound' };
    }
    if (this.isDuplicate(body, id)) {
      return { ok: false, reason: 'duplicate' };
    }
    this.presets.update((list) => {
      const next = [...list];
      next[idx] = { ...next[idx], department: '', content: body };
      return next;
    });
    this.persist();
    return { ok: true };
  }

  delete(id: string): { ok: true } | { ok: false; reason: 'notFound' } {
    const idx = this.presets().findIndex((p) => p.id === id);
    if (idx < 0) {
      return { ok: false, reason: 'notFound' };
    }
    this.presets.update((list) => list.filter((p) => p.id !== id));
    this.persist();
    return { ok: true };
  }

  /** 課題の種別文字列からプリセットを推定 */
  findPresetForTaskType(type: string): IssueTypePreset | undefined {
    const t = type.trim();
    if (!t) {
      return undefined;
    }
    return this.presets().find((p) => p.content === t);
  }

  private isDuplicate(content: string, exceptId?: string): boolean {
    const body = content.trim();
    return this.presets().some((p) => {
      if (exceptId && p.id === exceptId) {
        return false;
      }
      return p.content.trim() === body;
    });
  }

  private loadInitial(): IssueTypePreset[] {
    const raw = this.readRaw();
    if (!raw) {
      const seeded = defaultPresets();
      this.writeRaw(seeded);
      return seeded;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return defaultPresets();
      }
      return parsed.filter((p) => this.isValidPreset(p));
    } catch {
      return defaultPresets();
    }
  }

  private persist(): void {
    this.revision.update((v) => v + 1);
    this.writeRaw(this.presets());
  }

  private readRaw(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(STORAGE_KEY);
  }

  private writeRaw(presets: IssueTypePreset[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    } catch {
      /* quota */
    }
  }

  private isValidPreset(v: unknown): v is IssueTypePreset {
    if (typeof v !== 'object' || v === null) {
      return false;
    }
    const p = v as IssueTypePreset;
    return (
      typeof p.id === 'string' &&
      typeof p.department === 'string' &&
      typeof p.content === 'string' &&
      typeof p.createdAt === 'string'
    );
  }
}
