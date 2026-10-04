import { describe, expect, it } from 'vitest';

import type { SiteContent } from '../models/site-content.model';
import { DEFAULT_SITE_CONTENT, mergeSiteContent } from './site-content.util';

describe('mergeSiteContent', () => {
  it('falls back to every default when the document does not exist', () => {
    expect(mergeSiteContent(null)).toEqual(DEFAULT_SITE_CONTENT);
  });

  it('overrides only the fields the owner actually set', () => {
    const merged = mergeSiteContent({ heroTitle: 'Biryani, fast and hot' });
    expect(merged.heroTitle).toBe('Biryani, fast and hot');
    expect(merged.heroSubtitle).toBe(DEFAULT_SITE_CONTENT.heroSubtitle);
    expect(merged.footerTagline).toBe(DEFAULT_SITE_CONTENT.footerTagline);
  });

  it('refuses a blanked-out heading rather than rendering an empty one', () => {
    // An empty <h2> is both a visual gap and an accessibility fault (a heading
    // with no accessible name). Restoring the default is the kinder failure.
    const merged = mergeSiteContent({ sectionFeaturedTitle: '   ' });
    expect(merged.sectionFeaturedTitle).toBe(DEFAULT_SITE_CONTENT.sectionFeaturedTitle);
  });

  it('keeps a deliberately blank subtitle, which is fine to omit', () => {
    expect(mergeSiteContent({ heroSubtitle: '' }).heroSubtitle).toBe('');
  });

  it('never lets a stored value break a heading', () => {
    const merged = mergeSiteContent({ heroTitle: 42 as unknown as string });
    expect(merged.heroTitle).toBe(DEFAULT_SITE_CONTENT.heroTitle);
  });

  it('discards a non-http video URL rather than rendering a broken source', () => {
    expect(mergeSiteContent({ heroVideoUrl: 'javascript:alert(1)' }).heroVideoUrl).toBeNull();
  });

  it('keeps a real Storage video URL', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media';
    expect(mergeSiteContent({ heroVideoUrl: url }).heroVideoUrl).toBe(url);
  });

  it('disables a video slot when the owner clears its URL', () => {
    const cleared = mergeSiteContent({ heroVideoUrl: null, heroVideoEnabled: true });
    expect(cleared.heroVideoEnabled).toBe(false);
  });

  it('trims headings so a stray space cannot shift a layout', () => {
    expect(mergeSiteContent({ sectionCuisineTitle: '  Order by cuisine  ' }).sectionCuisineTitle).toBe(
      'Order by cuisine',
    );
  });

  it('falls back when a section link text is blank but a URL is still set', () => {
    const merged = mergeSiteContent({ sectionDishesLinkText: '   ' });
    expect(merged.sectionDishesLinkText).toBe(DEFAULT_SITE_CONTENT.sectionDishesLinkText);
  });
});