import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { UserRole } from '../models/user.model';
import { AuthService } from '../services/auth.service';

/**
 * Role-based access. Allowed roles come from route `data.roles`.
 *
 * This is a *UX* gate, not a security boundary — a user can always edit the
 * client. The real enforcement lives in `firestore.rules`, which re-reads the
 * role from the database and never trusts the client.
 */
export const roleGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const allowed = (route.data['roles'] as readonly UserRole[] | undefined) ?? [];
  if (allowed.length === 0) {
    return true;
  }

  await auth.whenReady();

  await auth.whenProfileReady();

  return allowed.includes(auth.role()) ? true : router.createUrlTree(['/']);
};
