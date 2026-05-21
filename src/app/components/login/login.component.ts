import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import { Router } from '@angular/router';

import { postLoginCommands } from '../../shared/post-login-navigation';
import { AuthService } from '../../services/auth-service/auth.service';
import { PermissionService } from '../../services/permission/permission.service';
import { ProjectService } from '../../services/project-service/project-service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly perm = inject(PermissionService);
  private readonly projectService = inject(ProjectService);

  readonly loginError = signal('');
  
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submitted = false;

  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.loginError.set('');
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    const result = await this.auth.signIn(v.email, v.password);
    if (!result.ok) {
      this.loginError.set(result.reason);
      return;
    }
    void this.router.navigate(
      postLoginCommands({
        can: (p) => this.perm.can(p),
        orgRole: this.perm.orgRole(),
        projectRows: this.projectService.getProjectRows(),
        displayName: this.auth.currentUser()?.displayName ?? '',
      }),
    );
  }
}
