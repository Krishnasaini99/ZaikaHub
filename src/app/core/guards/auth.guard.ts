import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * Blocks routes that need an account, remembering where the user was headed so
 * login can return them there.
 *
 * Waits on `whenReady()` first: without it, a hard refresh on `/checkout` would
 * evaluate `isLoggedIn()` as `false` for a few frames and wrongly redirect.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  if (auth.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { redirect: state.url },
  });
};
