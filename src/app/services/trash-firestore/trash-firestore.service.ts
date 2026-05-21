import { inject, Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  setDoc,
} from '@angular/fire/firestore';

import { FirestoreContextService } from '../firestore-context.service';
import type {
  RetentionBucket,
  TrashProjectEntry,
  TrashTaskEntry,
} from '../trash/trash.types';
import {
  TRASH_PROJECTS_COLLECTION,
  TRASH_RESERVED_COLLECTION,
  type TrashReservedEntityType,
  TRASH_TASKS_COLLECTION,
} from './firestore-trash.types';

export interface FirestoreTrashProjectDoc extends TrashProjectEntry {
  bucket: RetentionBucket;
}

export interface FirestoreTrashTaskDoc extends TrashTaskEntry {
  bucket: RetentionBucket;
}

@Injectable({
  providedIn: 'root',
})
export class TrashFirestoreService {
  private readonly firestore = inject(Firestore);
  private readonly firestoreContext = inject(FirestoreContextService);

  async listProjects(): Promise<FirestoreTrashProjectDoc[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, TRASH_PROJECTS_COLLECTION));
      return snap.docs.map((d) => d.data() as FirestoreTrashProjectDoc);
    });
  }

  async listTasks(): Promise<FirestoreTrashTaskDoc[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, TRASH_TASKS_COLLECTION));
      return snap.docs.map((d) => d.data() as FirestoreTrashTaskDoc);
    });
  }

  async listReservedIds(): Promise<{ id: string; entityType: TrashReservedEntityType }[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, TRASH_RESERVED_COLLECTION));
      return snap.docs.map((d) => {
        const data = d.data() as { entityType?: TrashReservedEntityType };
        return {
          id: d.id,
          entityType: data.entityType === 'task' ? 'task' : 'project',
        };
      });
    });
  }

  async setProject(entry: FirestoreTrashProjectDoc): Promise<void> {
    const id = entry.project.managementNumber.trim();
    await this.firestoreContext.runAsync(async () => {
      await setDoc(doc(this.firestore, TRASH_PROJECTS_COLLECTION, id), entry);
    });
  }

  async setTask(entry: FirestoreTrashTaskDoc): Promise<void> {
    const id = entry.task.managementNo.trim();
    await this.firestoreContext.runAsync(async () => {
      await setDoc(doc(this.firestore, TRASH_TASKS_COLLECTION, id), entry);
    });
  }

  async deleteProject(managementNumber: string): Promise<void> {
    const id = managementNumber.trim();
    if (!id) {
      return;
    }
    await this.firestoreContext.runAsync(async () => {
      await deleteDoc(doc(this.firestore, TRASH_PROJECTS_COLLECTION, id));
    });
  }

  async deleteTask(managementNo: string): Promise<void> {
    const id = managementNo.trim();
    if (!id) {
      return;
    }
    await this.firestoreContext.runAsync(async () => {
      await deleteDoc(doc(this.firestore, TRASH_TASKS_COLLECTION, id));
    });
  }

  async addReserved(managementId: string, entityType: TrashReservedEntityType): Promise<void> {
    const id = managementId.trim();
    if (!id) {
      return;
    }
    await this.firestoreContext.runAsync(async () => {
      await setDoc(doc(this.firestore, TRASH_RESERVED_COLLECTION, id), {
        entityType,
        reservedAt: new Date().toISOString(),
      });
    });
  }

  async hasReserved(managementId: string): Promise<boolean> {
    const id = managementId.trim();
    if (!id) {
      return false;
    }
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDoc(doc(this.firestore, TRASH_RESERVED_COLLECTION, id));
      return snap.exists();
    });
  }
}
