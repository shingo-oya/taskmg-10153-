import { inject, Injectable } from '@angular/core';
import {
  Auth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
} from '@angular/fire/auth';

import { AuthService } from '../auth-service/auth.service';
import { FirestoreContextService } from '../firestore-context.service';
import {
  UsersFirestoreService,
  usersRowToFirestoreProfile,
} from '../users-firestore/users-firestore.service';

export interface OwnProfileForm {
  department: string;
  name: string;
  email: string;
}

/** プロフィール読み込み結果（Auth と Firestore のメール差分を含む） */
export interface OwnProfileLoadResult extends OwnProfileForm {
  /** Firebase Auth のログイン用メール（再認証に使用） */
  signInEmail: string | null;
  /** Firestore の email と Auth の email が一致しない */
  emailOutOfSync: boolean;
}

export interface SaveOwnProfileInput extends OwnProfileForm {
  currentPassword?: string;
  newPassword?: string;
}

export type ProfileSaveResult = { ok: true } | { ok: false; reason: string };

@Injectable({
  providedIn: 'root',
})
export class CurrentUserProfileService {
  private readonly authService = inject(AuthService);
  private readonly firebaseAuth = inject(Auth);
  private readonly usersFirestore = inject(UsersFirestoreService);
  private readonly firestoreContext = inject(FirestoreContextService);

  /** 読み込み時のメール（変更検知用） */
  private loadedEmail = '';

  getLoadedEmail(): string {
    return this.loadedEmail;
  }

  async loadOwnProfile(): Promise<OwnProfileLoadResult | null> {
    const uid = this.authService.currentUser()?.userId;
    if (!uid) {
      return null;
    }
    const profile = await this.usersFirestore.getProfileByUid(uid);
    if (!profile) {
      return null;
    }
    this.loadedEmail = profile.email.trim().toLowerCase();
    const signInEmail = this.firebaseAuth.currentUser?.email?.trim() ?? null;
    const signInNormalized = signInEmail?.toLowerCase() ?? null;
    return {
      department: profile.department,
      name: profile.displayName,
      email: profile.email,
      signInEmail,
      emailOutOfSync: signInNormalized !== null && signInNormalized !== this.loadedEmail,
    };
  }

  async saveOwnProfile(input: SaveOwnProfileInput): Promise<ProfileSaveResult> {
    const uid = this.authService.currentUser()?.userId;
    if (!uid) {
      return { ok: false, reason: 'ログインしていません。' };
    }

    const existing = await this.usersFirestore.getProfileByUid(uid);
    if (!existing) {
      return { ok: false, reason: 'プロフィールが見つかりません。' };
    }

    const department = input.department.trim();
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const newPassword = input.newPassword?.trim() ?? '';
    /** ログインと同様、パスワードは trim しない */
    const currentPassword = input.currentPassword ?? '';

    if (!department || !name || !email) {
      return { ok: false, reason: '部署・名前・メールアドレスを入力してください。' };
    }

    const emailChanged = email !== this.loadedEmail;
    const passwordChange = newPassword.length > 0;

    if (newPassword.length > 0 && newPassword.length < 8) {
      return { ok: false, reason: '新しいパスワードは8文字以上で入力してください。' };
    }

    if (emailChanged || passwordChange) {
      if (!currentPassword.trim()) {
        return {
          ok: false,
          reason: 'メールまたはパスワードを変更する場合は、現在のパスワードを入力してください。',
        };
      }
    }

    if (emailChanged) {
      const otherUid = await this.usersFirestore.findUidByEmail(email);
      if (otherUid && otherUid !== uid) {
        return { ok: false, reason: 'このメールアドレスは既に登録されています。' };
      }
    }

    let authCredentialsUpdated = false;
    if (emailChanged || passwordChange) {
      const authResult = await this.applyAuthCredentialChanges({
        currentPassword,
        newEmail: emailChanged ? email : undefined,
        newPassword: passwordChange ? newPassword : undefined,
      });
      if (!authResult.ok) {
        return authResult;
      }
      authCredentialsUpdated = true;
    }

    const profileFields = usersRowToFirestoreProfile(
      {
        uid,
        department,
        name,
        email,
        password: '',
        confirmPassword: '',
        role: existing.role,
        status: existing.status,
      },
      email,
    );

    try {
      await this.usersFirestore.updateOwnProfileFields(uid, profileFields);
    } catch {
      return {
        ok: false,
        reason: authCredentialsUpdated
          ? 'ログイン情報は更新済みですが、プロフィールの保存に失敗しました。もう一度保存してください。'
          : 'プロフィールの保存に失敗しました。',
      };
    }

    this.loadedEmail = email;
    await this.authService.refreshSessionFromFirestore();
    return { ok: true };
  }

  private async applyAuthCredentialChanges(params: {
    currentPassword: string;
    newEmail?: string;
    newPassword?: string;
  }): Promise<ProfileSaveResult> {
    return this.firestoreContext.runAsync(async () => {
      const user = this.firebaseAuth.currentUser;
      if (!user) {
        return { ok: false, reason: 'ログイン情報を取得できません。再ログインしてください。' };
      }
      const authEmail = user.email?.trim();
      if (!authEmail) {
        return { ok: false, reason: 'ログイン用メールが設定されていません。管理者にお問い合わせください。' };
      }

      try {
        const credential = EmailAuthProvider.credential(authEmail, params.currentPassword);
        await reauthenticateWithCredential(user, credential);
      } catch (err: unknown) {
        return { ok: false, reason: mapFirebaseAuthError(err, 'reauth') };
      }

      try {
        if (params.newEmail) {
          await updateEmail(user, params.newEmail);
        }
        if (params.newPassword) {
          await updatePassword(user, params.newPassword);
        }
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, reason: mapFirebaseAuthError(err, 'update') };
      }
    });
  }
}

function mapFirebaseAuthError(err: unknown, phase: 'reauth' | 'update'): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: string }).code)
      : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'このメールアドレスは既に使用されています。';
    case 'auth/invalid-email':
      return '有効なメールアドレスを入力してください。';
    case 'auth/weak-password':
      return 'パスワードは8文字以上で、十分な強度が必要です。';
    case 'auth/requires-recent-login':
      return 'セキュリティのため、一度ログアウトして再ログインしてから再度お試しください。';
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。しばらく待ってから再度お試しください。';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return phase === 'reauth'
        ? '現在のパスワードが正しくありません。ログイン時と同じパスワードを入力してください。'
        : '現在のパスワードが正しくありません。';
    case 'auth/network-request-failed':
      return 'ネットワークエラーです。接続を確認して再度お試しください。';
    default:
      return phase === 'reauth'
        ? '再認証に失敗しました。ログアウト後、ログイン時と同じメール・パスワードで再ログインしてからお試しください。'
        : '認証情報の更新に失敗しました。';
  }
}
