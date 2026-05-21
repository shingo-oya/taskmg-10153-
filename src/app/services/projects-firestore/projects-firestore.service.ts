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

import type { ProjectRow } from '../../components/project-list/project-row';
import { FirestoreContextService } from '../firestore-context.service';
import { PROJECTS_COLLECTION } from './firestore-project.types';

@Injectable({
  providedIn: 'root',
})
export class ProjectsFirestoreService {
  private readonly firestore = inject(Firestore);
  private readonly firestoreContext = inject(FirestoreContextService);

  async listAll(): Promise<ProjectRow[]> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, PROJECTS_COLLECTION));
      return snap.docs.map((d) => normalizeProjectRow(d.id, d.data() as ProjectRow));
    });
  }

  /** 更新通知用: プロジェクト一覧のリアルタイム購読 */
  listenAll(onRows: (rows: ProjectRow[]) => void, onError?: (error: unknown) => void): Unsubscribe {
    return this.firestoreContext.run(() =>
      onSnapshot(
        collection(this.firestore, PROJECTS_COLLECTION),
        (snap) => {
          this.firestoreContext.run(() => {
            onRows(snap.docs.map((d) => normalizeProjectRow(d.id, d.data() as ProjectRow)));
          });
        },
        (err) => onError?.(err),
      ),
    );
  }

  async getById(managementNumber: string): Promise<ProjectRow | null> {
    const id = managementNumber.trim();
    if (!id) {
      return null;
    }
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDoc(doc(this.firestore, PROJECTS_COLLECTION, id));
      if (!snap.exists()) {
        return null;
      }
      return normalizeProjectRow(snap.id, snap.data() as ProjectRow);
    });
  }

  async setProject(row: ProjectRow): Promise<void> {
    const id = row.managementNumber.trim();
    await this.firestoreContext.runAsync(async () => {
      await setDoc(doc(this.firestore, PROJECTS_COLLECTION, id), projectRowToFirestore(row));
    });
  }

  async deleteProject(managementNumber: string): Promise<void> {
    const id = managementNumber.trim();
    if (!id) {
      return;
    }
    await this.firestoreContext.runAsync(async () => {
      await deleteDoc(doc(this.firestore, PROJECTS_COLLECTION, id));
    });
  }

  /** コレクションが空のときだけシードを投入する */
  async seedIfEmpty(rows: readonly ProjectRow[]): Promise<boolean> {
    return this.firestoreContext.runAsync(async () => {
      const snap = await getDocs(collection(this.firestore, PROJECTS_COLLECTION));
      if (!snap.empty) {
        return false;
      }
      for (const row of rows) {
        await setDoc(
          doc(this.firestore, PROJECTS_COLLECTION, row.managementNumber.trim()),
          projectRowToFirestore(row),
        );
      }
      return true;
    });
  }
}

export function normalizeProjectRow(docId: string, raw: ProjectRow): ProjectRow {
  const managementNumber = raw.managementNumber?.trim() || docId;
  const participants = raw.participants ?? [];
  return {
    ...raw,
    managementNumber,
    participants,
    departments: raw.departments ?? [],
    members:
      raw.members?.length > 0
        ? raw.members
        : [...new Set(participants.map((p) => p.name))],
    milestones: raw.milestones ?? [],
    relatedIssues: raw.relatedIssues ?? [],
    resourceFolders: raw.resourceFolders ?? [],
    updateHistory: raw.updateHistory ?? [],
  };
}

/** Rules の `participantNames` / `members` 判定用（UI 型には含めない） */
export type FirestoreProjectPayload = ProjectRow & { participantNames: string[] };

export function projectRowToFirestore(row: ProjectRow): FirestoreProjectPayload {
  const participantNames = [
    ...new Set(row.participants.map((p) => p.name.trim()).filter((n) => n.length > 0)),
  ];
  const members = participantNames.length > 0 ? participantNames : [...new Set(row.members ?? [])];
  return {
    ...row,
    managementNumber: row.managementNumber.trim(),
    members,
    participantNames,
    departments: [...row.departments],
    participants: row.participants.map((p) => ({ ...p })),
    milestones: row.milestones.map((m) => ({ ...m })),
    relatedIssues: row.relatedIssues.map((r) => ({ ...r })),
    resourceFolders: (row.resourceFolders ?? []).map((f) => ({
      ...f,
      entries: f.entries.map((e) => ({ ...e })),
    })),
    updateHistory: (row.updateHistory ?? []).map((h) => ({ ...h })),
  };
}
