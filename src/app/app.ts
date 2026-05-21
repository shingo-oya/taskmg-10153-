import { afterNextRender, Component, effect, EnvironmentInjector, inject, runInInjectionContext } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './services/auth-service/auth.service';
import { BrowserPushService } from './services/browser-push/browser-push.service';
import { UsersService } from './services/users-service/users-service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly injector = inject(EnvironmentInjector);
  private readonly auth = inject(AuthService);
  private readonly users = inject(UsersService);
  private readonly browserPush = inject(BrowserPushService);

  constructor() {
    afterNextRender(() => {
      runInInjectionContext(this.injector, () => {
        void this.users.ensureLoaded();
      });
    });

    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        runInInjectionContext(this.injector, () => {
          void this.browserPush.restoreIfEnabled();
        });
      }
    });
  }
}
