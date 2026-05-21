import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';

import { AuthService } from '../services/auth-service/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.authReady).pipe(
    filter((ready) => ready),
    take(1),
    map(() => (auth.isLoggedIn() ? true : router.createUrlTree(['/login']))),
  );
};
