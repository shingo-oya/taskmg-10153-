import { EnvironmentInjector, inject, Injectable, runInInjectionContext } from '@angular/core';

/**
 * Firestore API を Angular の Injection Context 内で実行する（AngularFire zones 準拠）。
 */
@Injectable({
  providedIn: 'root',
})
export class FirestoreContextService {
  private readonly injector = inject(EnvironmentInjector);

  run<T>(fn: () => T): T {
    return runInInjectionContext(this.injector, fn);
  }

  runAsync<T>(fn: () => Promise<T>): Promise<T> {
    return runInInjectionContext(this.injector, fn);
  }
}
