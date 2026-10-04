import type { SiteContent } from '../models/site-content.model';

/**
 * Defaults and defensive merging for the editable site copy.
 *
 * Pure, so the rules that keep a bad edit from breaking the page are testable:
 * the stored document is untrusted input that any admin (or a mistyped save) can
 * put nonsense into, and a blank `heroTitle` would leave the home page with no
 * headline at all.
 */

/** What the site shows before anyone saves an edit. */
export const DEFAULT_SITE_CONTENT: SiteContent = {
  heroTitle: 'Order food online from restaurants near you',
  heroSubtitle: 'Freshly cooked, delivered hot. Browse biryani, pizza and more.',
  heroSearchPlaceholder: 'Search for a restaurant, cuisine or dish',

  sectionDishesTitle: 'Popular dishes near you',
  sectionCuisineTitle: 'Order by cuisine',
  sectionFeaturedTitle: 'Featured restaurants',
  sectionFeaturedLinkText: 'See all',
  sectionDishesLinkText: 'Browse restaurants',

  footerTagline: 'Order food online from the best restaurants near you.',
  footerNote: 'Built with Angular & Firebase.',

  heroVideoUrl: null,
  heroVideoEnabled: false,
  promoVideoUrl: null,
  promoVideoEnabled: false,
  promoTitle: 'Watch how it is made',
  promoBody: 'A short look at the kitchen behind your order.',

  updatedAt: new Date(0),
};

/** Longest a single heading may be, so an edit cannot break the hero layout. */
const HEADING_MAX = 120;
const BODY_MAX = 400;

/**
 * Only http(s) media is accepted.
 *
 * The admin form is behind authentication, but a stored `javascript:` or `data:`
 * URL would be rendered into `<video src>` and `<img src>` on a public page, so
 * the check belongs here rather than in the form alone.
 */
function safeMedia(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    return null;
  }
  return trimmed.length <= BODY_MAX ? trimmed : null;
}

/**
 * A string field: trimmed, length-capped, falling back when it is not a usable
 * string. A *deliberately* empty string is preserved only where that is
 * meaningful — see {@link mergeSiteContent}.
 */
function text(value: unknown, fallback: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return allowEmpty ? '' : fallback;
  }
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Merges a stored document over the defaults.
 *
 * `null`/missing data returns the defaults untouched, which is what makes the
 * site correct on a fresh install with no document at all.
 */
export function mergeSiteContent(raw: unknown): SiteContent {
  const data = (raw ?? {}) as Partial<Record<keyof SiteContent, unknown>>;
  const d = DEFAULT_SITE_CONTENT;

  const heroVideoUrl = safeMedia(data.heroVideoUrl);
  const promoVideoUrl = safeMedia(data.promoVideoUrl);

  return {
    heroTitle: text(data.heroTitle, d.heroTitle, HEADING_MAX),
    heroSubtitle: text(data.heroSubtitle, d.heroSubtitle, BODY_MAX, true),
    heroSearchPlaceholder: text(data.heroSearchPlaceholder, d.heroSearchPlaceholder, BODY_MAX),

    sectionDishesTitle: text(data.sectionDishesTitle, d.sectionDishesTitle, HEADING_MAX),
    sectionCuisineTitle: text(data.sectionCuisineTitle, d.sectionCuisineTitle, HEADING_MAX),
    sectionFeaturedTitle: text(data.sectionFeaturedTitle, d.sectionFeaturedTitle, HEADING_MAX),
    sectionFeaturedLinkText: text(
      data.sectionFeaturedLinkText,
      d.sectionFeaturedLinkText,
      BODY_MAX,
    ),
    sectionDishesLinkText: text(
      data.sectionDishesLinkText,
      d.sectionDishesLinkText,
      BODY_MAX,
    ),

    footerTagline: text(data.footerTagline, d.footerTagline, BODY_MAX, true),
    footerNote: text(data.footerNote, d.footerNote, BODY_MAX, true),

    // A cleared URL implies "off": leaving the toggle on with nothing to play
    // would reserve a full-bleed video box that renders as empty black.
    heroVideoUrl,
    heroVideoEnabled: bool(data.heroVideoEnabled, false) && heroVideoUrl !== null,
    promoVideoUrl,
    promoVideoEnabled: bool(data.promoVideoEnabled, false) && promoVideoUrl !== null,
    promoTitle: text(data.promoTitle, d.promoTitle, HEADING_MAX),
    promoBody: text(data.promoBody, d.promoBody, BODY_MAX, true),

    updatedAt: new Date(0),
  };
}