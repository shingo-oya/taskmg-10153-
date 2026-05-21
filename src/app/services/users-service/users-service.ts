import { inject, Injectable, signal } from '@angular/core';

import type { UsersRow } from '../../components/users/users-row';
import {
  usersRowFromFirestore,
  usersRowToFirestoreProfile,
  UsersFirestoreService,
} from '../users-firestore/users-firestore.service';

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly usersFirestore = inject(UsersFirestoreService);

  /** ユーザー未登録でも選択肢に出す部署（一覧フィルター・登録フォームで共有） */
  private readonly extraDepartments: string[] = [];

  private readonly _rows = signal<UsersRow[]>([]);
  readonly usersLoaded = signal(false);

  private loadPromise: Promise<void> | null = null;

  /** Firestore からユーザーキャッシュを読み込む */
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
    const items = await this.usersFirestore.listAll();
    this._rows.set(items.map(({ uid, profile }) => usersRowFromFirestore(uid, profile)));
    this.usersLoaded.set(true);
  }

  getUsersRow(): UsersRow[] {
    return [...this._rows()];
  }

  getDepartmentOptions(): string[] {
    const fromRows = this._rows().map((r) => r.department);
    const merged = [...fromRows, ...this.extraDepartments];
    return [...new Set(merged)].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  getUserNamesByDepartment(department: string): string[] {
    const d = department.trim();
    return this._rows()
      .filter((r) => r.department === d)
      .map((r) => r.name)
      .sort((a, b) => a.localeCompare(b, 'ja'));
  }

  getDistinctUserNames(): string[] {
    return [...new Set(this._rows().map((r) => r.name))].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  addDepartment(raw: string): { ok: true; name: string } | { ok: false; reason: 'empty' | 'duplicate' } {
    const name = raw.trim();
    if (!name) {
      return { ok: false, reason: 'empty' };
    }
    const existing = new Set(this.getDepartmentOptions());
    if (existing.has(name)) {
      return { ok: false, reason: 'duplicate' };
    }
    this.extraDepartments.push(name);
    return { ok: true, name };
  }

  renameDepartment(
    oldName: string,
    rawNewName: string,
  ):
    | { ok: true }
    | { ok: false; reason: 'empty' | 'duplicate' | 'notFound' | 'unchanged' } {
    const newName = rawNewName.trim();
    if (!newName) {
      return { ok: false, reason: 'empty' };
    }
    const opts = this.getDepartmentOptions();
    if (!opts.includes(oldName)) {
      return { ok: false, reason: 'notFound' };
    }
    if (newName === oldName) {
      return { ok: false, reason: 'unchanged' };
    }
    if (opts.includes(newName)) {
      return { ok: false, reason: 'duplicate' };
    }
    const toUpdate = this._rows().filter((r) => r.department === oldName);
    for (let i = 0; i < this.extraDepartments.length; i++) {
      if (this.extraDepartments[i] === oldName) {
        this.extraDepartments[i] = newName;
      }
    }
    void this.persistRenamedDepartments(toUpdate, newName);
    return { ok: true };
  }

  private async persistRenamedDepartments(rows: UsersRow[], newName: string): Promise<void> {
    for (const row of rows) {
      if (!row.uid) {
        continue;
      }
      const updated: UsersRow = { ...row, department: newName };
      await this.usersFirestore.updateProfile(row.uid, usersRowToFirestoreProfile(updated));
    }
    await this.refreshFromFirestore();
  }

  deleteDepartment(name: string): { ok: true } | { ok: false; reason: 'notFound' | 'inUse' } {
    const opts = this.getDepartmentOptions();
    if (!opts.includes(name)) {
      return { ok: false, reason: 'notFound' };
    }
    if (this._rows().some((r) => r.department === name)) {
      return { ok: false, reason: 'inUse' };
    }
    for (let i = this.extraDepartments.length - 1; i >= 0; i--) {
      if (this.extraDepartments[i] === name) {
        this.extraDepartments.splice(i, 1);
      }
    }
    return { ok: true };
  }

  getUserByEmail(email: string): UsersRow | undefined {
    const normalized = email.trim().toLowerCase();
    return this._rows().find((r) => r.email.trim().toLowerCase() === normalized);
  }

  getUserByUid(uid: string): UsersRow | undefined {
    return this._rows().find((r) => r.uid === uid);
  }

  async getProfileByUid(uid: string) {
    return this.usersFirestore.getProfileByUid(uid);
  }

  async addUsers(row: UsersRow): Promise<{ ok: true } | { ok: false; reason: string }> {
    const existing = await this.usersFirestore.findUidByEmail(row.email);
    if (existing) {
      return { ok: false, reason: 'このメールアドレスは既に登録されています。' };
    }
    const created = await this.usersFirestore.createAuthUserWithProfile(row);
    if (!created.ok) {
      return created;
    }
    await this.refreshFromFirestore();
    return { ok: true };
  }

  async updateUser(
    originalEmail: string,
    row: UsersRow,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const prev = this.getUserByEmail(originalEmail);
    if (!prev?.uid) {
      return { ok: false, reason: '更新対象のユーザーが見つかりません。' };
    }
    const profile = usersRowToFirestoreProfile(row, prev.email);
    try {
      await this.usersFirestore.updateProfile(prev.uid, profile);
      await this.refreshFromFirestore();
      return { ok: true };
    } catch {
      return { ok: false, reason: 'ユーザーの更新に失敗しました。' };
    }
  }
}
