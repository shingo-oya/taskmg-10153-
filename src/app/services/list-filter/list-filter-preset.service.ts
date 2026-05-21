import { inject, Injectable, signal } from '@angular/core';

import { AuthService } from '../auth-service/auth.service';
import {
  isProjectFilterSnapshot,
  isTaskFilterSnapshot,
  isUsersFilterSnapshot,
} from './list-filter-snapshot';
import type { FilterScreenId, FilterSnapshot, SavedFilterPreset } from './list-filter.types';

const STORAGE_PREFIX = 'taskmg-filter-presets:';

function newPresetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

@Injectable({
  providedIn: 'root',
})
export class ListFilterPresetService {
  private readonly auth = inject(AuthService);
  private readonly revision = signal(0);

  readonly presetsRevision = this.revision.asReadonly();

  listForScreen(screen: FilterScreenId): SavedFilterPreset[] {
    this.revision();
    const all = this.loadAll();
    return all
      .filter((p) => p.screen === screen)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  savePreset(screen: FilterScreenId, name: string, snapshot: FilterSnapshot): SavedFilterPreset | null {
    const label = name.trim();
    if (!label) {
      return null;
    }
    const preset: SavedFilterPreset = {
      id: newPresetId(),
      name: label,
      screen,
      snapshot,
      createdAt: new Date().toISOString(),
    };
    const all = this.loadAll();
    all.push(preset);
    this.persistAll(all);
    this.revision.update((v) => v + 1);
    return preset;
  }

  deletePreset(id: string): boolean {
    const all = this.loadAll();
    const next = all.filter((p) => p.id !== id);
    if (next.length === all.length) {
      return false;
    }
    this.persistAll(next);
    this.revision.update((v) => v + 1);
    return true;
  }

  getPreset(id: string): SavedFilterPreset | undefined {
    return this.loadAll().find((p) => p.id === id);
  }

  private loadAll(): SavedFilterPreset[] {
    const raw = this.readRaw();
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((p) => this.isValidPreset(p));
    } catch {
      return [];
    }
  }

  private persistAll(presets: SavedFilterPreset[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(presets));
    } catch {
      /* quota */
    }
  }

  private storageKey(): string {
    const userId = this.auth.currentUser()?.userId?.trim() || '_anonymous';
    return `${STORAGE_PREFIX}${userId}`;
  }

  private readRaw(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(this.storageKey());
  }

  private isValidPreset(v: unknown): v is SavedFilterPreset {
    if (typeof v !== 'object' || v === null) {
      return false;
    }
    const p = v as SavedFilterPreset;
    if (typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.screen !== 'string') {
      return false;
    }
    if (p.screen === 'users') {
      return isUsersFilterSnapshot(p.snapshot);
    }
    if (p.screen === 'project-list' || p.screen === 'project-calendar') {
      return isProjectFilterSnapshot(p.snapshot);
    }
    if (
      p.screen === 'task-list' ||
      p.screen === 'task-kanban' ||
      p.screen === 'task-gantt' ||
      p.screen === 'task-calendar'
    ) {
      return isTaskFilterSnapshot(p.snapshot);
    }
    return false;
  }
}
