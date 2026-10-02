import type { MenuItem, Restaurant } from '../models/restaurant.model';

/**
 * Schema.org payloads for a restaurant page.
 *
 * This is the highest-leverage SEO work in the app. Google reads `Restaurant`
 * structured data to decide whether a result can carry a star rating, a price
 * range and opening hours — the visual difference between a plain blue link and
 * a rich result.
 *
 * Two rules the spec is strict about, and which Google actively penalises:
 *  - `aggregateRating` may only exist when `reviewCount` is real, so it is
 *    omitted entirely for an unrated restaurant rather than faked with `0`.
 *  - `menu` items need a name and a price. Dishes without one are dropped.
 */

/** Minutes-since-midnight to the `HH:MM` that Schema.org expects. */
function toTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Schema.org wants a currency symbol or an ISO code, not the app's internal
 * bucket name, so the numeric cost is used instead.
 */
const PRICE_RANGE: Record<Restaurant['priceBand'], string> = {
  budget: '₹₹',
  mid: '₹₹₹',
  premium: '₹₹₹₹',
};

/**
 * Groups the menu into Schema.org `MenuSection`s by category, which is how
 * Google understands a restaurant's offering. Sections with nothing worth
 * showing are dropped rather than emitted empty.
 */
function buildMenu(menu: readonly MenuItem[]): Record<string, unknown>[] | undefined {
  const byCategory = new Map<string, MenuItem[]>();
  for (const item of menu) {
    if (!item.name) {
      continue;
    }
    const bucket = byCategory.get(item.category);
    if (bucket) {
      bucket.push(item);
    } else {
      byCategory.set(item.category, [item]);
    }
  }

  const sections = [...byCategory.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([name, items]) => ({
      '@type': 'MenuSection',
      name,
      hasMenuItem: items.map((item) => ({
        '@type': 'MenuItem',
        name: item.name,
        description: item.description || undefined,
        offers: {
          '@type': 'Offer',
          price: item.price.toFixed(2),
          priceCurrency: 'INR',
        },
      })),
    }));

  return sections.length > 0 ? sections : undefined;
}

/**
 * Full JSON-LD graph for one restaurant.
 *
 * @param restaurant  the loaded restaurant
 * @param menu        its menu items, used for `hasMenuSection`
 * @param pageUrl     absolute canonical URL of this page
 * @param imageUrl    cover image, used as the share preview
 */
export function restaurantJsonLd(
  restaurant: Restaurant,
  menu: readonly MenuItem[],
  pageUrl: string,
  imageUrl: string | null,
): Record<string, unknown>[] {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': `${pageUrl}#restaurant`,
    name: restaurant.name,
    url: pageUrl,
    servesCuisine: [...restaurant.cuisines],
    priceRange: PRICE_RANGE[restaurant.priceBand],
    currenciesAccepted: 'INR',
    address: {
      '@type': 'PostalAddress',
      streetAddress: restaurant.address,
      addressLocality: restaurant.area,
      addressRegion: restaurant.city,
      addressCountry: 'IN',
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ],
      opens: toTime(restaurant.openingHours.open),
      closes: toTime(restaurant.openingHours.close),
    },
    // A cover image is worth far more to a crawler than the logo, so it is
    // preferred when both exist.
    image: imageUrl ?? undefined,
  };

  // Only emitted when there is a real rating. An unrated restaurant must not
  // declare `aggregateRating` at all — Google treats a rating of 0 with a
  // non-zero review count as invalid structured data.
  if (restaurant.rating > 0 && restaurant.ratingCount > 0) {
    schema['aggregateRating'] = {
      '@type': 'AggregateRating',
      ratingValue: restaurant.rating.toFixed(1),
      reviewCount: restaurant.ratingCount,
      bestRating: '5',
      worstRating: '1',
    };
  }

  const sections = buildMenu(menu);
  if (sections) {
    schema['hasMenuSection'] = sections;
  }

  return [schema];
}

/**
 * Maximum length worth targeting for a meta description.
 *
 * Google renders roughly 155–160 characters on a desktop result and less on a
 * phone, so anything past this is silently discarded. The audit tool
 * (`tools/audit-seo.mjs`) fails the build if a page exceeds it.
 */
const DESCRIPTION_LIMIT = 155;

/**
 * Appends `part` to `parts` while the result still fits the limit, dropping it
 * otherwise.
 *
 * Truncating a finished description on a word boundary was the first attempt and
 * it reads badly: a search result ending "...Popular dishes: Hyderabadi" tells a
 * potential customer nothing. Dropping whole clauses instead keeps the sentence
 * intact, which matters because this text is the pitch.
 */
function addIfItFits(parts: string[], part: string): void {
  const candidate = [...parts, part].join(' ');
  if (candidate.length <= DESCRIPTION_LIMIT) {
    parts.push(part);
  }
}

/**
 * Meta description for a restaurant page.
 *
 * Ordered by how much each clause is worth: who and where first, then the
 * rating (which is what a searcher scans for), then delivery time, then dish
 * names — the long-tail terms that let the page match a search for an actual
 * dish rather than only the restaurant's name.
 *
 * @param restaurant the loaded restaurant
 * @param menu       its dishes, used for the long-tail phrase
 */
export function restaurantDescription(
  restaurant: Restaurant,
  menu: readonly MenuItem[],
): string {
  const parts: string[] = [];

  addIfItFits(parts, `Order food online from ${restaurant.name}, ${restaurant.area}.`);

  if (restaurant.rating > 0 && restaurant.ratingCount > 0) {
    addIfItFits(parts, `Rated ${restaurant.rating.toFixed(1)} by ${restaurant.ratingCount} diners.`);
  }

  addIfItFits(parts, `${restaurant.deliveryTimeMinutes} min delivery.`);

  // One dish is often enough to fill the remaining space; adding a second only
  // fits when the first name is short.
  for (const dish of menu.slice(0, 3)) {
    if (!dish.name) {
      continue;
    }
    const before = parts.length;
    addIfItFits(parts, `Try ${dish.name}.`);
    if (parts.length === before) {
      break;
    }
  }

  return parts.join(' ');
}

/**
 * Breadcrumb JSON-LD, so the result shows "ZaikaHub > Restaurants > Zaika House"
 * instead of a bare URL. Returns an empty array when there is no trail.
 */
export function breadcrumbJsonLd(
  pageUrl: string,
  trail: readonly { readonly name: string; readonly path: string }[],
): Record<string, unknown>[] {
  if (trail.length === 0) {
    return [];
  }

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: trail.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: index === trail.length - 1 ? pageUrl : null,
      })),
    },
  ];
}