import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';

import { SeoService } from './seo.service';

/**
 * `SeoService` mutates the real document head, so these tests read the head back
 * the way a crawler would rather than asserting on mock calls. That is the whole
 * risk here: tags can be applied correctly and still be wrong in the document.
 */
describe('SeoService', () => {
  let service: SeoService;
  let document: Document;

  const metaContent = (selector: string): string | null =>
    document.head.querySelector<HTMLMetaElement>(selector)?.content ?? null;

  // Configured once, outside `beforeEach`: re-configuring an already-instantiated
  // TestBed throws, and this suite needs no per-test providers.
  TestBed.configureTestingModule({});

  beforeEach(() => {
    service = TestBed.inject(SeoService);
    document = TestBed.inject(DOCUMENT);

    // Start from a clean head so one test cannot leak tags into the next.
    document.head
      .querySelectorAll('link[rel="canonical"], script[data-seo="jsonld"]')
      .forEach((node) => node.remove());
    for (const name of ['description', 'robots', 'twitter:card', 'og:title', 'og:image']) {
      document.head.querySelector(`meta[name="${name}"]`)?.remove();
      document.head.querySelector(`meta[property="${name}"]`)?.remove();
    }
  });

  it('appends the site name to the title', () => {
    service.apply({ title: 'Restaurants near you', description: 'x', path: '/restaurants' });

    expect(TestBed.inject(Title).getTitle()).toBe('Restaurants near you | ZaikaHub');
  });

  it('does not double up the site name when the title is already the brand', () => {
    service.apply({ title: 'ZaikaHub', description: 'x', path: '/' });

    expect(TestBed.inject(Title).getTitle()).toBe('ZaikaHub');
  });

  it('writes an absolute canonical URL', () => {
    service.apply({ title: 'Cart', description: 'x', path: '/cart' });

    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe('https://zaika-hub-prod.web.app/cart');
  });

  it('keeps exactly one canonical element across navigations', () => {
    service.apply({ title: 'One', description: 'x', path: '/one' });
    service.apply({ title: 'Two', description: 'x', path: '/two' });

    const all = document.head.querySelectorAll('link[rel="canonical"]');
    expect(all).toHaveLength(1);
    expect(all[0].getAttribute('href')).toBe('https://zaika-hub-prod.web.app/two');
  });

  it('sets Open Graph and Twitter tags for link previews', () => {
    service.apply({ title: 'Zaika House', description: 'Biryani in Koramangala', path: '/restaurant/zaika-house' });

    expect(metaContent('meta[property="og:title"]')).toBe('Zaika House | ZaikaHub');
    expect(metaContent('meta[property="og:description"]')).toBe('Biryani in Koramangala');
    expect(metaContent('meta[property="og:url"]')).toBe(
      'https://zaika-hub-prod.web.app/restaurant/zaika-house',
    );
    // Scrapers will not render a placeholder, so the default must be a real
    // absolute https URL. No file extension is expected: Cloudinary serves
    // extensionless URLs and negotiates the format via `f_auto`.
    const ogImage = metaContent('meta[property="og:image"]');
    expect(ogImage).toMatch(/^https:\/\//);
    expect(ogImage).toContain('res.cloudinary.com');
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary_large_image');
  });

  it('prefers the page-specific image over the site default', () => {
    service.apply({
      title: 'Zaika House',
      description: 'x',
      path: '/restaurant/zaika-house',
      imageUrl: 'https://res.cloudinary.com/wvw3fzud/image/upload/cover.jpg',
    });

    expect(metaContent('meta[property="og:image"]')).toBe(
      'https://res.cloudinary.com/wvw3fzud/image/upload/cover.jpg',
    );
  });

  it('indexes by default and noindexes when asked', () => {
    service.apply({ title: 'Home', description: 'x', path: '/' });
    expect(metaContent('meta[name="robots"]')).toContain('index, follow');

    service.apply({ title: 'Cart', description: 'x', path: '/cart', noIndex: true });
    expect(metaContent('meta[name="robots"]')).toBe('noindex, nofollow');
  });

  it('replaces JSON-LD on navigation instead of stacking scripts', () => {
    service.apply({
      title: 'Home',
      description: 'x',
      path: '/',
      jsonLd: [{ '@type': 'WebSite' }],
    });
    expect(document.head.querySelectorAll('script[data-seo="jsonld"]')).toHaveLength(1);

    service.apply({
      title: 'Zaika House',
      description: 'x',
      path: '/restaurant/zaika-house',
      jsonLd: [{ '@type': 'Restaurant' }, { '@type': 'BreadcrumbList' }],
    });

    const scripts = document.head.querySelectorAll('script[data-seo="jsonld"]');
    expect(scripts).toHaveLength(2);
    // Only the newest page's data should remain.
    expect(scripts[0].textContent).toContain('Restaurant');
    expect(document.head.textContent).not.toContain('WebSite');
  });

  it('removes JSON-LD entirely when a page has none', () => {
    service.apply({ title: 'Home', description: 'x', path: '/', jsonLd: [{ '@type': 'WebSite' }] });
    service.apply({ title: 'Cart', description: 'x', path: '/cart' });

    expect(document.head.querySelectorAll('script[data-seo="jsonld"]')).toHaveLength(0);
  });

  // A `</script>` inside any description, dish name or review text would close
  // the tag early and silently drop the rest of the structured data.
  it('escapes angle brackets so a script cannot be terminated early', () => {
    service.apply({
      title: 'Tricky',
      description: 'x',
      path: '/',
      jsonLd: [{ '@type': 'Restaurant', name: '</script><img src=x onerror=alert(1)>' }],
    });

    const script = document.head.querySelector('script[data-seo="jsonld"]')!;
    expect(script.textContent).not.toContain('</script>');
    expect(script.textContent).toContain('\\u003c');
    // Still valid JSON that round-trips to the original string.
    expect(JSON.parse(script.textContent!).name).toBe('</script><img src=x onerror=alert(1)>');
  });

  it('builds absolute URLs with and without a leading slash', () => {
    expect(service.absolute('/cart')).toBe('https://zaika-hub-prod.web.app/cart');
    expect(service.absolute('cart')).toBe('https://zaika-hub-prod.web.app/cart');
  });
});