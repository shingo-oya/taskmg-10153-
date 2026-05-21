import { inject, Injectable, signal } from '@angular/core';

import {
  TrashFirestoreService,
  type FirestoreTrashProjectDoc,
  type FirestoreTrashTaskDoc,
} from '../trash-firestore/trash-firestore.service';
import type { RetentionBucket, TrashProjectEntry, TrashTaskEntry } from './trash.types';

function todayIsoDateTime(): string {
  return new Date().toISOString();
}

@Injectable({
  providedIn: 'root',
})
export class TrashService {
  private readonly trashFirestore = inject(TrashFirestoreService);

  private readonly projects = signal<Record<RetentionBucket, TrashProjectEntry[]>>({
    archive: [],
    trash: [],
  });
  private readonly tasks = signal<Record<RetentionBucket, TrashTaskEntry[]>>({
    archive: [],
    trash: [],
  });
  private readonly reservedProjectNumbers = signal(new Set<string>());
  private readonly reservedTaskNumbers = signal(new Set<string>());

  readonly trashLoaded = signal(false);

  private loadPromise: Promise<void> | null = null;

  constructor() {
    void this.ensureLoaded();
  }

  ensureLoaded(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }
    this.loadPromise = this.refreshFromFirestore().finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  async refreshFromFirestore(): Promise<void> {
    const [projectDocs, taskDocs, reserved] = await Promise.all([
      this.trashFirestore.listProjects(),
      this.trashFirestore.listTasks(),
      this.trashFirestore.listReservedIds(),
    ]);

    const projectBuckets: Record<RetentionBucket, TrashProjectEntry[]> = {
      archive: [],
      trash: [],
    };
    for (const doc of projectDocs) {
      const { bucket, ...entry } = doc;
      if (bucket === 'archive' || bucket === 'trash') {
        projectBuckets[bucket].push(entry);
      }
    }
    for (const b of ['archive', 'trash'] as const) {
      projectBuckets[b].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    }

    const taskBuckets: Record<RetentionBucket, TrashTaskEntry[]> = {
      archive: [],
      trash: [],
    };
    for (const doc of taskDocs) {
      const { bucket, ...entry } = doc;
      if (bucket === 'archive' || bucket === 'trash') {
        taskBuckets[bucket].push(entry);
      }
    }
    for (const b of ['archive', 'trash'] as const) {
      taskBuckets[b].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    }

    const projReserved = new Set<string>();
    const taskReserved = new Set<string>();
    for (const r of reserved) {
      if (r.entityType === 'task') {
        taskReserved.add(r.id);
      } else {
        projReserved.add(r.id);
      }
    }

    this.projects.set(projectBuckets);
    this.tasks.set(taskBuckets);
    this.reservedProjectNumbers.set(projReserved);
    this.reservedTaskNumbers.set(taskReserved);
    this.trashLoaded.set(true);
  }

  getProjects(bucket: RetentionBucket): readonly TrashProjectEntry[] {
    return [...this.projects()[bucket]];
  }

  getTasks(bucket: RetentionBucket): readonly TrashTaskEntry[] {
    return [...this.tasks()[bucket]];
  }

  getArchivedProjects(): readonly TrashProjectEntry[] {
    return this.getProjects('trash');
  }

  getArchivedTasks(): readonly TrashTaskEntry[] {
    return this.getTasks('trash');
  }

  isProjectNumberUsed(managementNumber: string): boolean {
    const id = managementNumber.trim();
    if (!id) {
      return false;
    }
    if (this.reservedProjectNumbers().has(id)) {
      return true;
    }
    const buckets = this.projects();
    return (
      buckets.archive.some((e) => e.project.managementNumber === id) ||
      buckets.trash.some((e) => e.project.managementNumber === id)
    );
  }

  isTaskNumberUsed(managementNo: string): boolean {
    const id = managementNo.trim();
    if (!id) {
      return false;
    }
    if (this.reservedTaskNumbers().has(id)) {
      return true;
    }
    const taskBuckets = this.tasks();
    if (taskBuckets.archive.some((e) => e.task.managementNo === id)) {
      return true;
    }
    if (taskBuckets.trash.some((e) => e.task.managementNo === id)) {
      return true;
    }
    const projectBuckets = this.projects();
    return (
      projectBuckets.archive.some((e) => e.linkedTasks.some((t) => t.managementNo === id)) ||
      projectBuckets.trash.some((e) => e.linkedTasks.some((t) => t.managementNo === id))
    );
  }

  usedProjectNumbersForAllocation(): string[] {
    const fromBuckets = (['archive', 'trash'] as const).flatMap((b) =>
      this.projects()[b].map((e) => e.project.managementNumber),
    );
    return [...fromBuckets, ...this.reservedProjectNumbers()];
  }

  usedTaskNumbersForAllocation(): string[] {
    const fromBuckets = (['archive', 'trash'] as const).flatMap((b) =>
      this.tasks()[b].map((e) => e.task.managementNo),
    );
    const fromProjectBundles = (['archive', 'trash'] as const).flatMap((b) =>
      this.projects()[b].flatMap((e) => e.linkedTasks.map((t) => t.managementNo)),
    );
    return [...fromBuckets, ...fromProjectBundles, ...this.reservedTaskNumbers()];
  }

  storeProject(bucket: RetentionBucket, entry: Omit<TrashProjectEntry, 'deletedAt'>): void {
    const full: TrashProjectEntry = {
      ...entry,
      deletedAt: todayIsoDateTime(),
    };
    this.projects.update((state) => ({
      ...state,
      [bucket]: [...state[bucket], full],
    }));
    for (const t of entry.linkedTasks) {
      this.removeTaskFromCache(t.managementNo.trim());
    }
    const doc: FirestoreTrashProjectDoc = { ...full, bucket };
    void this.trashFirestore.setProject(doc).catch(() => void this.refreshFromFirestore());
  }

  storeTask(bucket: RetentionBucket, entry: Omit<TrashTaskEntry, 'deletedAt'>): void {
    const full: TrashTaskEntry = {
      ...entry,
      deletedAt: todayIsoDateTime(),
    };
    this.tasks.update((state) => ({
      ...state,
      [bucket]: [...state[bucket], full],
    }));
    const doc: FirestoreTrashTaskDoc = { ...full, bucket };
    void this.trashFirestore.setTask(doc).catch(() => void this.refreshFromFirestore());
  }

  archiveProject(entry: Omit<TrashProjectEntry, 'deletedAt'>): void {
    this.storeProject('trash', entry);
  }

  archiveTask(entry: Omit<TrashTaskEntry, 'deletedAt'>): void {
    this.storeTask('trash', entry);
  }

  findProjectEntry(bucket: RetentionBucket, managementNumber: string): TrashProjectEntry | undefined {
    const id = managementNumber.trim();
    return this.projects()[bucket].find((e) => e.project.managementNumber === id);
  }

  findTaskEntry(bucket: RetentionBucket, managementNo: string): TrashTaskEntry | undefined {
    const id = managementNo.trim();
    return this.tasks()[bucket].find((e) => e.task.managementNo === id);
  }

  removeProjectEntry(bucket: RetentionBucket, managementNumber: string): TrashProjectEntry | undefined {
    const id = managementNumber.trim();
    let removed: TrashProjectEntry | undefined;
    this.projects.update((state) => {
      const idx = state[bucket].findIndex((e) => e.project.managementNumber === id);
      if (idx < 0) {
        return state;
      }
      const next = { ...state, [bucket]: [...state[bucket]] };
      [removed] = next[bucket].splice(idx, 1);
      return next;
    });
    if (removed) {
      void this.trashFirestore.deleteProject(id).catch(() => void this.refreshFromFirestore());
    }
    return removed;
  }

  removeTaskEntry(bucket: RetentionBucket, managementNo: string): TrashTaskEntry | undefined {
    const id = managementNo.trim();
    let removed: TrashTaskEntry | undefined;
    this.tasks.update((state) => {
      const idx = state[bucket].findIndex((e) => e.task.managementNo === id);
      if (idx < 0) {
        return state;
      }
      const next = { ...state, [bucket]: [...state[bucket]] };
      [removed] = next[bucket].splice(idx, 1);
      return next;
    });
    if (removed) {
      void this.trashFirestore.deleteTask(id).catch(() => void this.refreshFromFirestore());
    }
    return removed;
  }

  reserveProjectNumber(managementNumber: string): void {
    const id = managementNumber.trim();
    if (!id) {
      return;
    }
    this.reservedProjectNumbers.update((s) => new Set([...s, id]));
    void this.trashFirestore
      .addReserved(id, 'project')
      .catch(() => void this.refreshFromFirestore());
  }

  reserveTaskNumber(managementNo: string): void {
    const id = managementNo.trim();
    if (!id) {
      return;
    }
    this.reservedTaskNumbers.update((s) => new Set([...s, id]));
    void this.trashFirestore.addReserved(id, 'task').catch(() => void this.refreshFromFirestore());
  }

  reserveProjectBundle(entry: TrashProjectEntry): void {
    this.reserveProjectNumber(entry.project.managementNumber);
    for (const t of entry.linkedTasks) {
      this.reserveTaskNumber(t.managementNo);
    }
  }

  private removeTaskFromCache(managementNo: string): void {
    const id = managementNo.trim();
    if (!id) {
      return;
    }
    let removedFrom: RetentionBucket | null = null;
    this.tasks.update((state) => {
      const next = { ...state };
      for (const b of ['archive', 'trash'] as const) {
        const idx = next[b].findIndex((e) => e.task.managementNo === id);
        if (idx >= 0) {
          next[b] = [...next[b]];
          next[b].splice(idx, 1);
          removedFrom = b;
        }
      }
      return next;
    });
    if (removedFrom !== null) {
      void this.trashFirestore.deleteTask(id).catch(() => void this.refreshFromFirestore());
    }
  }
}
