import { Component, computed, HostListener, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../services/auth-service/auth.service';
import { PermissionService } from '../../services/permission/permission.service';
import { ProjectService } from '../../services/project-service/project-service';
import { guestProjectCommands } from '../../shared/post-login-navigation';

@Component({
  selector: 'app-settings.component',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  readonly perm = inject(PermissionService);

  readonly guestProjectLink = computed(() =>
    guestProjectCommands({
      can: (p) => this.perm.can(p),
      orgRole: this.perm.orgRole(),
      projectRows: this.projectService.getProjectRows(),
      displayName: this.auth.currentUser()?.displayName ?? '',
    }),
  );

  menuOpen = false;

  async logout(): Promise<void> {
    await this.auth.signOut();
    this.closeMenu();
    void this.router.navigate(['/login']);
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menuOpen) {
      this.closeMenu();
    }
  }
}
