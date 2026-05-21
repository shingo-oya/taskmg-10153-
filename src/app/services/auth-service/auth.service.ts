import {
  computed,
  EnvironmentInjector,
  inject,
  Injectable,
  runInInjectionContext,
  signal,
} from '@angular/core';
import {
  Auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from '@angular/fire/auth';

import { AuditHistoryService } from '../audit-history/audit-history.service';
import { normalizeOrgRole } from '../permission/org-role.types';
import { UsersService } from '../users-service/users-service';
import type { AuthSessionUser } from './auth.types';

const STORAGE_KEY = 'taskmg-auth-session';

/**
 * Firebase Authentication + Firestore `users/{uid}` プロフィール。
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(Auth);
  private readonly usersService = inject(UsersService);
  private readonly auditHistory = inject(AuditHistoryService);

  private readonly _currentUser = signal<AuthSessionUser | null>(null);
  private readonly _authReady = signal(false);

  readonly currentUser = this._currentUser.asReadonly();

  readonly isLoggedIn = computed(() => this._currentUser() !== null);

  readonly authReady = this._authReady.asReadonly();

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      runInInjectionContext(this.injector, () => {
        void this.handleAuthStateChange(user);
      });
    });
  }

  private async handleAuthStateChange(user: User | null): Promise<void> {
    try {
      if (!user) {
        this._currentUser.set(null);
        this.clearPersistedSession();
        return;
      }
      const session = await this.sessionFromFirebaseUser(user);
      if (session) {
        this._currentUser.set(session);
        this.persistSession(session);
      } else {
        this._currentUser.set(null);
        this.clearPersistedSession();
        await firebaseSignOut(this.auth);
      }
    } finally {
      this._authReady.set(true);
    }
  }

  async signIn(
    email: string,
    password: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const cred = await signInWithEmailAndPassword(this.auth, email.trim(), password);
      const session = await this.sessionFromFirebaseUser(cred.user);
      if (!session) {
        await firebaseSignOut(this.auth);
        return { ok: false, reason: 'このアカウントは現在利用できません。' };
      }
      this._currentUser.set(session);
      this.persistSession(session);
      this.auditHistory.recordLogin({
        uid: session.userId,
        email: session.email,
        displayName: session.displayName,
      });
      return { ok: true };
    } catch {
      return { ok: false, reason: 'メールアドレスまたはパスワードが正しくありません。' };
    }
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(this.auth);
  }

  /** プロフィール保存後に Firestore からセッション表示名・メールを再読み込み */
  async refreshSessionFromFirestore(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return;
    }
    const session = await this.sessionFromFirebaseUser(user);
    if (session) {
      this._currentUser.set(session);
      this.persistSession(session);
    }
  }

  private async sessionFromFirebaseUser(user: User): Promise<AuthSessionUser | null> {
    const profile = await this.usersService.getProfileByUid(user.uid);
    if (!profile || profile.status !== '有効') {
      return null;
    }
    const email = profile.email.trim().toLowerCase();
    if (!email) {
      return null;
    }
    return {
      userId: user.uid,
      email,
      displayName: profile.displayName.trim() || user.displayName?.trim() || email,
      role: normalizeOrgRole(profile.role),
    };
  }

  private persistSession(session: AuthSessionUser): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  private clearPersistedSession(): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }
}
