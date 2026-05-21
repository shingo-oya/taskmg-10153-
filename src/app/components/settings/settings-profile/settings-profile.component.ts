import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../../../services/auth-service/auth.service';
import { CurrentUserProfileService } from '../../../services/current-user-profile/current-user-profile.service';

@Component({
  selector: 'app-settings-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './settings-profile.component.html',
  styleUrl: './settings-profile.component.scss',
})
export class SettingsProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly profileService = inject(CurrentUserProfileService);
  private readonly authService = inject(AuthService);

  submitted = false;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly saveMessage = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly signInEmail = signal<string | null>(null);
  readonly emailOutOfSync = signal(false);

  readonly form = this.fb.nonNullable.group({
    department: ['', Validators.required],
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    currentPassword: [''],
    newPassword: ['', [Validators.minLength(8)]],
  });

  async ngOnInit(): Promise<void> {
    if (!this.authService.isLoggedIn()) {
      this.loading.set(false);
      this.saveError.set('ログインしていません。');
      return;
    }
    const profile = await this.profileService.loadOwnProfile();
    if (!profile) {
      this.saveError.set('プロフィールを読み込めませんでした。');
      this.loading.set(false);
      return;
    }
    this.form.patchValue({
      department: profile.department,
      name: profile.name,
      email: profile.email,
    });
    this.signInEmail.set(profile.signInEmail);
    this.emailOutOfSync.set(profile.emailOutOfSync);
    this.loading.set(false);
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.saveMessage.set(null);
    this.saveError.set(null);
    if (this.form.invalid || this.saving()) {
      return;
    }

    const { department, name, email, currentPassword, newPassword } = this.form.getRawValue();
    const loadedEmail = this.profileService.getLoadedEmail();
    const emailChanged = email.trim().toLowerCase() !== loadedEmail;
    const passwordChange = newPassword.trim().length > 0;

    if ((emailChanged || passwordChange) && !currentPassword.trim()) {
      this.saveError.set(
        'メールまたはパスワードを変更する場合は、現在のパスワードを入力してください。',
      );
      return;
    }

    this.saving.set(true);
    const result = await this.profileService.saveOwnProfile({
      department,
      name,
      email,
      currentPassword: currentPassword || undefined,
      newPassword: newPassword || undefined,
    });
    this.saving.set(false);

    if (!result.ok) {
      this.saveError.set(result.reason);
      return;
    }

    if (passwordChange) {
      this.form.patchValue({ newPassword: '', currentPassword: '' });
    } else if (emailChanged) {
      this.form.patchValue({ currentPassword: '' });
    }

    const reloaded = await this.profileService.loadOwnProfile();
    if (reloaded) {
      this.signInEmail.set(reloaded.signInEmail);
      this.emailOutOfSync.set(reloaded.emailOutOfSync);
    }

    this.saveMessage.set('保存しました');
    setTimeout(() => this.saveMessage.set(null), 2500);
  }
}
