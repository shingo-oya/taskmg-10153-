import { inject, Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from '@angular/fire/firestore';

import type { TaskRow } from '../../components/task-list/task-row';
import { FirestoreContextService } from '../firestore-context.service';
import { TASKS_COLLECTION } from './firestore-task.types';

@Injectable({
  providedIn: 'root',
})
export class TasksFirestoreService {
  private readonly firestore = inject(Firestore);
  private readonly firestoreContext = inject(FirestoreContextService);

  async listAll(): Promise<TaskRow[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, TASKS_COLLECTION));
      return snap.docs.map((d) => normalizeTaskRow(d.id, d.data() as TaskRow));
    });
  }

  /** 更新通知用: 課題一覧のリアルタイム購読 */
  listenAll(onRows: (rows: TaskRow[]) => void, onError?: (error: unknown) => void): Unsubscribe {
    return this.firestoreContext.run(() =>
      onSnapshot(
        collection(this.firestore, TASKS_COLLECTION),
        (snap) => {
          this.firestoreContext.run(() => {
            onRows(snap.docs.map((d) => normalizeTaskRow(d.id, d.data() as TaskRow)));
          });
        },
        (err) => onError?.(err),
      ),
    );
  }

  async getById(managementNo: string): Promise<TaskRow | null> {
    const id = managementNo.trim();
    if (!id) {
      return null;
    }
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDoc(doc(this.firestore, TASKS_COLLECTION, id));
      if (!snap.exists()) {
        return null;
      }
      return normalizeTaskRow(snap.id, snap.data() as TaskRow);
    });
  }

  async setTask(row: TaskRow): Promise<void> {
    const id = row.managementNo.trim();
    await this.firestoreContext.runAsync(async () => {
      await setDoc(doc(this.firestore, TASKS_COLLECTION, id), taskRowToFirestore(row));
    });
  }

  async deleteTask(managementNo: string): Promise<void> {
    const id = managementNo.trim();
    if (!id) {
      return;
    }
    await this.firestoreContext.runAsync(async () => {
      await deleteDoc(doc(this.firestore, TASKS_COLLECTION, id));
    });
  }

  /** コレクションが空のときだけシードを投入する */
  async seedIfEmpty(rows: readonly TaskRow[]): Promise<boolean> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, TASKS_COLLECTION));
      if (!snap.empty) {
        return false;
      }
      for (const row of rows) {
        await setDoc(
          doc(this.firestore, TASKS_COLLECTION, row.managementNo.trim()),
          taskRowToFirestore(row),
        );
      }
      return true;
    });
  }
}

export function normalizeTaskRow(docId: string, raw: TaskRow): TaskRow {
  const managementNo = raw.managementNo?.trim() || docId;
  return {
    ...raw,
    managementNo,
    parentTaskManagementNo: raw.parentTaskManagementNo?.trim() ?? '',
    departments: raw.departments ?? [],
    participants: raw.participants ?? [],
    resourceFolders: raw.resourceFolders ?? [],
    updateHistory: raw.updateHistory ?? [],
  };
}

/** Rules の `participantNames` 判定用 */
export type FirestoreTaskPayload = TaskRow & { participantNames: string[] };

export function taskRowToFirestore(row: TaskRow): FirestoreTaskPayload {
  const participantNames = [
    ...new Set(row.participants.map((p) => p.name.trim()).filter((n) => n.length > 0)),
  ];
  return {
    ...row,
    managementNo: row.managementNo.trim(),
    parentTaskManagementNo: row.parentTaskManagementNo?.trim() ?? '',
    managementNumber: row.managementNumber.trim(),
    participantNames,
    departments: [...row.departments],
    participants: row.participants.map((p) => ({ ...p })),
    resourceFolders: (row.resourceFolders ?? []).map((f) => ({
      ...f,
      entries: f.entries.map((e) => ({ ...e })),
    })),
    updateHistory: (row.updateHistory ?? []).map((h) => ({ ...h })),
  };
}
