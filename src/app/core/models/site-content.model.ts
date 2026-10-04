/**
 * Every piece of copy the owner can edit without a deploy.
 *
 * One document (`siteContent/main`) rather than a row per string: the home page
 * needs all of it on first paint, so one read beats a dozen. Media is stored as
 * Storage URLs, never bytes, keeping the document small.
 */
export interface SiteContent {
  // Hero
  readonly heroTitle: string;
  readonly heroSubtitle: string;
  readonly heroSearchPlaceholder: string;

  // Home section headings
  readonly sectionDishesTitle: string;
  readonly sectionCuisineTitle: string;
  readonly sectionFeaturedTitle: string;
  readonly sectionFeaturedLinkText: string;
  readonly sectionDishesLinkText: string;

  // Footer
  readonly footerTagline: string;
  readonly footerNote: string;

  // Promotional video — hero background and a standalone promo block
  readonly heroVideoUrl: string | null;
  readonly heroVideoEnabled: boolean;
  readonly promoVideoUrl: string | null;
  readonly promoVideoEnabled: boolean;
  readonly promoTitle: string;
  readonly promoBody: string;

  readonly updatedAt: Date;
}

/** Firestore shape of `cuisineTiles/{tileId}` — the "Order by cuisine" row. */
export interface CuisineTile {
  readonly id: string;
  readonly name: string;
  /** Emoji fallback when a tile has no photograph. */
  readonly emoji: string;
  readonly imageUrl: string | null;
  /** CC BY attribution — required whenever `imageUrl` is set. */
  readonly imageCredit: string | null;
  /** Value sent to `/restaurants?cuisine=`, matched case-insensitively. */
  readonly filter: string;
  readonly order: number;
  readonly updatedAt: Date;
}