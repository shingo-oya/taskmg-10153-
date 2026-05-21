import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuditHistoryService } from '../../../services/audit-history/audit-history.service';
import { AuthService } from '../../../services/auth-service/auth.service';
import { UsersService } from '../../../services/users-service/users-service';
import type { UsersRow } from '../users-row';

/** 親フォームの password と一致するか（confirmPassword 用） */
export function confirmPasswordMatchesValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const parent = control.parent;
    if (!parent) {
      return null;
    }
    const password = parent.get('password')?.value as string | undefined;
    const confirm = (control.value as string) ?? '';
    if (!confirm || password === undefined) {
      return null;
    }
    return password === confirm ? null : { passwordMismatch: true };
  };
}

@Component({
  selector: 'app-users-registered',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './users-registered.component.html',
  styleUrl: './users-registered.component.scss',
})
export class UsersRegisteredComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly usersService = inject(UsersService);
  private readonly auditHistory = inject(AuditHistoryService);
  private readonly auth = inject(AuthService);

  /** 権限セレクトの値と一致する id。右カラムの説明に使用 */
  readonly roleDescriptions = [
    {
      id: 'ゲスト',
      text: '閲覧中心のアクセスです。課題の参照など、作業に必要な範囲に限定されます。',
    },
    {
      id: 'メンバー',
      text: '一般的な利用者向けです。担当課題の作成・更新や、日常業務に必要な操作が行えます。',
    },
    {
      id: 'プロジェクト管理者',
      text: 'プロジェクト単位の管理が行えます。メンバー割り当てやプロジェクト設定の変更などが可能です。',
    },
    {
      id: '管理者',
      text: '組織横断の管理権限です。全体のダッシュボード確認など、広い範囲の操作が可能です。',
    },
    {
      id: 'マスター',
      text: 'システム上の最高権限です。ユーザー管理などの全機能・全データへのアクセスや運用向けの操作が可能です。',
    },
  ] as const;

  submitted = false;
  readonly submitError = signal('');
  /** 編集開始時のメール（更新時の検索キー）。null のときは新規登録 */
  editOriginalEmail: string | null = null;

  readonly form = this.fb.nonNullable.group({
    department: ['', Validators.required],
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: [
      '',
      [Validators.required, Validators.minLength(8), confirmPasswordMatchesValidator()],
    ],
    role: ['メンバー', Validators.required],
    status: ['有効' as string, Validators.required],
  });

  constructor() {
    const password = this.form.controls.password;
    const confirmPassword = this.form.controls.confirmPassword;
    password.valueChanges.subscribe(() => {
      if (confirmPassword.value) {
        confirmPassword.updateValueAndValidity({ emitEvent: false });
      }
    });

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((pm) => {
      const emailParam = pm.get('email');
      void this.usersService.ensureLoaded().then(() => {
        if (emailParam) {
          const user = this.usersService.getUserByEmail(emailParam);
          if (user) {
            this.editOriginalEmail = user.email;
            this.submitted = false;
            this.form.controls.password.clearValidators();
            this.form.controls.confirmPassword.clearValidators();
            this.form.patchValue({
              department: user.department,
              name: user.name,
              email: user.email,
              password: '',
              confirmPassword: '',
              role: user.role,
              status: user.status,
            });
          } else {
            this.editOriginalEmail = null;
            void this.router.navigate(['/settings/users']);
          }
        } else {
          this.editOriginalEmail = null;
          this.submitted = false;
          this.form.controls.password.setValidators([
            Validators.required,
            Validators.minLength(8),
          ]);
          this.form.controls.confirmPassword.setValidators([
            Validators.required,
            Validators.minLength(8),
            confirmPasswordMatchesValidator(),
          ]);
          this.form.reset({
            department: '',
            name: '',
            email: '',
            password: '',
            confirmPassword: '',
            role: 'メンバー',
            status: '有効',
          });
          this.form.controls.password.updateValueAndValidity({ emitEvent: false });
          this.form.controls.confirmPassword.updateValueAndValidity({ emitEvent: false });
        }
      });
    });
  }

  get isEditMode(): boolean {
    return this.editOriginalEmail !== null;
  }

  get departmentOptions(): string[] {
    return this.usersService.getDepartmentOptions();
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.submitError.set('');
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    const row: UsersRow = {
      department: v.department.trim(),
      name: v.name.trim(),
      email: v.email.trim(),
      password: v.password.trim(),
      confirmPassword: v.confirmPassword.trim(),
      role: v.role.trim(),
      status: v.status.trim(),
    };
    const actor = this.auth.currentUser();
    const changedByEmail = actor?.email ?? '';
    const changedByName = actor?.displayName ?? '';
    const changedByUid = actor?.userId;

    if (this.editOriginalEmail) {
      const previous = this.usersService.getUserByEmail(this.editOriginalEmail);
      if (previous && previous.role !== row.role) {
        this.auditHistory.recordRoleChange({
          targetUid: previous.uid,
          targetEmail: row.email,
          targetName: row.name,
          previousRole: previous.role,
          newRole: row.role,
          changedByUid,
          changedByEmail,
          changedByName,
        });
      }
      const result = await this.usersService.updateUser(this.editOriginalEmail, row);
      if (!result.ok) {
        this.submitError.set(result.reason);
        return;
      }
    } else {
      this.auditHistory.recordRoleChange({
        targetEmail: row.email,
        targetName: row.name,
        previousRole: '—',
        newRole: row.role,
        changedByUid,
        changedByEmail,
        changedByName,
      });
      const result = await this.usersService.addUsers(row);
      if (!result.ok) {
        this.submitError.set(result.reason);
        return;
      }
    }
    void this.router.navigate(['/settings/users']);
  }

  cancel(): void {
    void this.router.navigate(['/settings/users']);
  }
}
