import { inject, Injectable } from '@angular/core';

import {
  applyProjectFilterSnapshot,
  applyTaskFilterSnapshot,
  applyUsersFilterSnapshot,
  readProjectFilterSnapshot,
  readTaskFilterSnapshot,
  readUsersFilterSnapshot,
  type ProjectAppliedSignals,
  type TaskAppliedSignals,
  type UsersAppliedSignals,
} from './list-filter-snapshot';
import { ListFilterSessionService } from './list-filter-session.service';
import type { FilterScreenId, FilterSnapshot } from './list-filter.types';

@Injectable({
  providedIn: 'root',
})
export class ListFilterStateBridge {
  private readonly session = inject(ListFilterSessionService);

  restoreProject(screen: FilterScreenId, applied: ProjectAppliedSignals): void {
    const saved = this.session.load(screen);
    if (saved?.kind === 'project') {
      applyProjectFilterSnapshot(saved, applied);
    }
  }

  persistProject(screen: FilterScreenId, applied: ProjectAppliedSignals): void {
    this.session.save(screen, readProjectFilterSnapshot(applied));
  }

  restoreTask(screen: FilterScreenId, applied: TaskAppliedSignals): void {
    const saved = this.session.load(screen);
    if (saved?.kind === 'task') {
      applyTaskFilterSnapshot(saved, applied);
    }
  }

  persistTask(screen: FilterScreenId, applied: TaskAppliedSignals): void {
    this.session.save(screen, readTaskFilterSnapshot(applied));
  }

  restoreUsers(screen: FilterScreenId, applied: UsersAppliedSignals): void {
    const saved = this.session.load(screen);
    if (saved?.kind === 'users') {
      applyUsersFilterSnapshot(saved, applied);
    }
  }

  persistUsers(screen: FilterScreenId, applied: UsersAppliedSignals): void {
    this.session.save(screen, readUsersFilterSnapshot(applied));
  }

  applyProjectPreset(
    screen: FilterScreenId,
    applied: ProjectAppliedSignals,
    snapshot: FilterSnapshot,
  ): void {
    if (snapshot.kind !== 'project') {
      return;
    }
    applyProjectFilterSnapshot(snapshot, applied);
    this.session.save(screen, snapshot);
  }

  applyTaskPreset(screen: FilterScreenId, applied: TaskAppliedSignals, snapshot: FilterSnapshot): void {
    if (snapshot.kind !== 'task') {
      return;
    }
    applyTaskFilterSnapshot(snapshot, applied);
    this.session.save(screen, snapshot);
  }

  applyUsersPreset(screen: FilterScreenId, applied: UsersAppliedSignals, snapshot: FilterSnapshot): void {
    if (snapshot.kind !== 'users') {
      return;
    }
    applyUsersFilterSnapshot(snapshot, applied);
    this.session.save(screen, snapshot);
  }
}
