import { inject, Injectable } from '@angular/core';

import { AuthService } from '../auth-service/auth.service';
import {
  isProjectFilterSnapshot,
  isTaskFilterSnapshot,
  isUsersFilterSnapshot,
} from './list-filter-snapshot';
import type { FilterScreenId, FilterSnapshot } from './list-filter.types';

const STORAGE_PREFIX = 'taskmg-filter-session:';

@Injectable({
  providedIn: 'root',
})
export class ListFilterSessionService {
  private readonly auth = inject(AuthService);

  load(screen: FilterScreenId): FilterSnapshot | null {
    const raw = this.readRaw(screen);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      return this.parseSnapshot(screen, parsed);
    } catch {
      return null;
    }
  }

  save(screen: FilterScreenId, snapshot: FilterSnapshot): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    try {
      sessionStorage.setItem(this.storageKey(screen), JSON.stringify(snapshot));
    } catch {
      /* quota / private mode */
    }
  }

  clear(screen: FilterScreenId): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    sessionStorage.removeItem(this.storageKey(screen));
  }

  private storageKey(screen: FilterScreenId): string {
    const userId = this.auth.currentUser()?.userId?.trim() || '_anonymous';
    return `${STORAGE_PREFIX}${userId}:${screen}`;
  }

  private readRaw(screen: FilterScreenId): string | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    return sessionStorage.getItem(this.storageKey(screen));
  }

  private parseSnapshot(screen: FilterScreenId, parsed: unknown): FilterSnapshot | null {
    if (screen === 'users') {
      return isUsersFilterSnapshot(parsed) ? parsed : null;
    }
    if (
      screen === 'project-list' ||
      screen === 'project-calendar'
    ) {
      return isProjectFilterSnapshot(parsed) ? parsed : null;
    }
    return isTaskFilterSnapshot(parsed) ? parsed : null;
  }
}
