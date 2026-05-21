import { Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../services/auth-service/auth.service';
import { PermissionService } from '../../services/permission/permission.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly perm = inject(PermissionService);

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
