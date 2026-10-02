import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { SeoData, SeoService } from './seo.service';

/**
 * Route-data key under which a route carries its SEO payload.
 *
 * A named constant rather than a bare string so the routes that write it and
 * the strategy that reads it cannot silently drift apart.
 */
export const SEO_DATA_KEY = 'seo';

/**
 * Applies SEO from route data instead of from every component.
 *
 * Angular already lets a route carry `title`, but that only sets `<title>` —
 * it cannot set meta descriptions, canonicals or structured data, which is why
 * those usually end up copy-pasted into a constructor in every component.
 * Putting the payload on the route keeps it visible in `app.routes.ts`, right
 * next to the path it describes.
 *
 * Usage:
 * ```ts
 * {
 *   path: 'login',
 *   data: {
 *     seo: {
 *       title: 'Log in',
 *       description: 'Sign in to ZaikaHub to track orders.',
 *       path: '/login',
 *       noIndex: true,
 *     },
 *   },
 * }
 * ```
 *
 * Dynamic pages are unaffected: `SeoService.apply()` is idempotent, so a
 * component effect (see restaurant-detail) can overwrite whatever this set for
 * its own data once loading finishes.
 */
@Injectable({ providedIn: 'root' })
export class SeoTitleStrategy extends TitleStrategy {
  private readonly seo = inject(SeoService);
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const payload = this.findDeepestSeo(snapshot.root);

    if (!payload) {
      // Nothing declared on the route. Fall back to Angular's own `title`
      // handling so a route with no `seo` still gets the document title from
      // its `title:` property, rather than leaving the previous page's title.
      this.applyRouterTitle(snapshot);
      return;
    }

    this.seo.apply(payload);
  }

  /**
   * Inlined equivalent of `TitleStrategy`'s own default implementation.
   *
   * `updateTitle` is declared abstract, so `super.updateTitle(...)` is a
   * compile error and the base behaviour has to be reproduced here: build the
   * title from the deepest route that declares one, and leave the document
   * alone if none does.
   */
  private applyRouterTitle(snapshot: RouterStateSnapshot): void {
    let route: ActivatedRouteSnapshot | null = snapshot.root;
    let title: string | undefined;

    while (route) {
      if (route.title !== undefined) {
        title = typeof route.title === 'string' ? route.title : undefined;
      }
      route = route.firstChild;
    }

    if (title !== undefined) {
      this.title.setTitle(title);
    }
  }

  /**
   * Walks the activated route tree and keeps the payload from the deepest
   * route that has one, so a child can override its parent.
   */
  private findDeepestSeo(route: ActivatedRouteSnapshot | null): SeoData | null {
    let found: SeoData | null = null;
    let current: ActivatedRouteSnapshot | null = route;

    while (current) {
      const candidate = current.data?.[SEO_DATA_KEY];
      if (candidate) {
        found = candidate as SeoData;
      }
      current = current.firstChild;
    }

    return found;
  }
}