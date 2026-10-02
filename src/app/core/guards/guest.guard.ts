import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * Keeps signed-in users away from `/login`, `/register` and
 * `/forgot-password`. Without this, a signed-in user can still see the login
 * form and get silently redirected after submitting valid credentials.
 */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  return auth.isLoggedIn() ? router.createUrlTree(['/']) : true;
};
