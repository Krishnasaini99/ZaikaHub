import { Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

import { ToastService } from './toast.service';

/**
 * Turns service-worker version changes into user-visible hints.
 *
 * Angular's service worker can replace itself underneath a long-lived tab: the
 * visitor opened the site yesterday, a new build shipped overnight, and on their
 * next click they would still be running yesterday's bundle — with no way to
 * know it. This service closes that gap: when the worker announces a ready
 * version it raises a toast asking the visitor to refresh.
 *
 * The toast is informational rather than an auto-reload on purpose. Reloading
 * under someone mid-order is hostile; a food app may hold a half-filled cart on
 * screen for many minutes. The worker also re-checks on its own after every
 * navigation, and the *next* full page load always picks the new bundle, so the
 * freshest an install can lag is one deliberate refresh.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly sw = inject(SwUpdate);
  private readonly toast = inject(ToastService);

  constructor() {
    // There is no worker outside production (`ng serve` generates no
    // `ngsw-worker.js`), so there is nothing to subscribe to there.
    if (!this.sw.isEnabled) {
      return;
    }

    this.sw.versionUpdates
      .pipe(filter((event) => event.type === 'VERSION_READY'))
      .subscribe(() => {
        this.toast.info('A new version of ZaikaHub is ready — refresh the page to load it.');
      });

    this.sw.unrecoverable.subscribe(() => {
      // The worker downloaded two versions it cannot reconcile; a clean reload
      // rebuilds it from the current deploy. Never ignore this, because every
      // later request keeps failing until then.
      this.toast.error('ZaikaHub could not update itself. Please reload the page.');
    });

    // Minutes matter for a menu change made from the admin panel: without an
    // eager probe, a tab parked on one page would not re-check until its next
    // navigation. A failed probe is harmless — the worker still retries.
    void this.sw.checkForUpdate().catch(() => undefined);
  }
}
