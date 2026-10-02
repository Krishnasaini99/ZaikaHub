import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { environment } from '../../../environments/environment';

/** Everything a crawler or a social scraper needs to render one link. */
export interface SeoData {
  /** Page title, without the site-name suffix — that is appended for you. */
  readonly title: string;
  /** ~155 characters. Shown in the SERP snippet. */
  readonly description: string;
  /** Path only, e.g. `/restaurant/zaika-house`. Turned into an absolute URL. */
  readonly path: string;
  /** Absolute image URL for link previews. Omit to use the site default. */
  readonly imageUrl?: string | null;
  /** `noindex` for pages that must never reach a results page. */
  readonly noIndex?: boolean;
  /**
   * Schema.org payload injected as JSON-LD. Google reads this for rich
   * results — star ratings, price range, opening hours.
   */
  readonly jsonLd?: readonly Record<string, unknown>[] | null;
}

/**
 * Central place for `<title>`, meta and structured data.
 *
 * WHY THIS EXISTS IN A PLAIN SPA
 * ------------------------------
 * This app ships no server-rendered HTML, so every tag below is written *after*
 * JavaScript runs. Googlebot executes JavaScript and will usually index the
 * result, but most social scrapers (WhatsApp, Facebook, X, LinkedIn) do not —
 * they read whatever is in the raw response. That is why `index.html` still
 * carries a complete, sensible set of tags for the home page, and why this
 * service exists to upgrade them per route in the browser.
 *
 * For guaranteed indexing of every restaurant page, the real fix is prerendering
 * (see README → SEO). That is a build-step change, not a service change.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  /**
   * A real, hosted image. Social scrapers will not render a gradient or an
   * inline SVG, so this must be an absolute `https://` URL.
   */
  private static readonly DEFAULT_IMAGE =
    'https://res.cloudinary.com/wvw3fzud/image/upload/f_auto,q_auto,c_limit,w_1200,h_630/zaika-hub/og-default-v2.jpg';

  private static readonly SITE_NAME = 'ZaikaHub';
  private static readonly TWITTER_HANDLE = '@zaikahub';

  /** Builds an absolute URL from a path, tolerating a missing/leading slash. */
  absolute(path: string): string {
    const base = environment.siteUrl.replace(/\/$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
  }

  /** Applies every tag for one page. Safe to call repeatedly. */
  apply(data: SeoData): void {
    const fullTitle =
      data.title === SeoService.SITE_NAME
        ? data.title
        : `${data.title} | ${SeoService.SITE_NAME}`;
    const url = this.absolute(data.path);
    const image = data.imageUrl ?? SeoService.DEFAULT_IMAGE;

    this.title.setTitle(fullTitle);
    this.meta.updateTag({ name: 'description', content: data.description });
    this.meta.updateTag({ property: 'og:site_name', content: SeoService.SITE_NAME });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: data.description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    // Tells Facebook the image is reachable without JavaScript.
    this.meta.updateTag({ property: 'og:image:secure_url', content: image });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:site', content: SeoService.TWITTER_HANDLE });
    this.meta.updateTag({ name: 'twitter:title', content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: data.description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.setCanonical(url);
    this.setRobots(data.noIndex ?? false);
    this.setJsonLd(data.jsonLd ?? null);
  }

  /**
   * Canonical link, kept as a single element.
   *
   * Google uses it to pick which URL to index when the same page is reachable
   * several ways — which, with query parameters like `?redirect=/cart`, happens
   * constantly in this app.
   */
  private setCanonical(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private setRobots(noIndex: boolean): void {
    this.meta.updateTag({
      name: 'robots',
      content: noIndex
        ? 'noindex, nofollow'
        : 'index, follow, max-image-preview:large, max-snippet:-1',
    });
  }

  /**
   * Injects JSON-LD, replacing whatever the previous page left behind.
   *
   * Left to accumulate, each navigation would stack another `application/ld+json`
   * script and the page would describe several unrelated things at once.
   */
  private setJsonLd(payload: readonly Record<string, unknown>[] | null): void {
    this.document
      .querySelectorAll('script[data-seo="jsonld"]')
      .forEach((node) => node.remove());

    if (!payload || payload.length === 0) {
      return;
    }

    for (const item of payload) {
      const script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', 'jsonld');
      // `</script>` inside a string value would close the tag early and break
      // the document, so the sequence is escaped.
      script.textContent = JSON.stringify(item).replace(/</g, '\\u003c');
      this.document.head.appendChild(script);
    }
  }
}