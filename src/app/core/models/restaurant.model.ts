/** Delivery/pickup mode offered by a restaurant. */
export type FulfillmentMode = 'delivery' | 'pickup';

/** Coarse price bucket used by the cost filter on the home page. */
export type PriceBand = 'budget' | 'mid' | 'premium';

export const PRICE_BANDS: readonly PriceBand[] = ['budget', 'mid', 'premium'];

/** Zomato-style rating tiers. */
export type RatingTier = 'excellent' | 'great' | 'good';

export const RATING_TIERS: readonly RatingTier[] = ['excellent', 'great', 'good'];

/** Open/closed state derived from `openingHours` against the current time. */
export type OpenState = 'open' | 'closed';

/**
 * Firestore shape of `restaurants/{restaurantId}`.
 *
 * Menu items live in the `menuItems` subcollection so a busy restaurant with
 * 200 dishes does not force every home-page query to download its menu.
 */
export interface Restaurant {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly slug: string;
  readonly cuisines: readonly string[];
  readonly priceBand: PriceBand;
  readonly rating: number;
  readonly ratingCount: number;
  readonly deliveryTimeMinutes: number;
  readonly costForTwo: number;
  /** Storage download URL of the cover image. */
  readonly coverImageUrl: string | null;
  /** Storage download URL of the small circular logo. */
  readonly logoImageUrl: string | null;
  readonly city: string;
  readonly area: string;
  readonly address: string;
  readonly modes: readonly FulfillmentMode[];
  /** Minutes since midnight, e.g. `{ open: 570, close: 1380 }` = 09:30–23:00. */
  readonly openingHours: OpeningHours;
  readonly featured: boolean;
  readonly isActive: boolean;
  /**
   * Attribution for the cover photo, e.g. `"Title — Author (CC BY 2.0)"`.
   *
   * Required for legally reusing a CC BY image, so the UI renders it whenever
   * it is present. Null for images the owner uploaded themselves.
   */
  readonly imageCredit: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OpeningHours {
  readonly open: number;
  readonly close: number;
}

/** Lightweight card payload returned by the home-page listing query. */
export interface RestaurantSummary {
  readonly id: string;
  readonly name: string;
  readonly cuisines: readonly string[];
  readonly priceBand: PriceBand;
  readonly rating: number;
  readonly ratingCount: number;
  readonly deliveryTimeMinutes: number;
  readonly costForTwo: number;
  readonly coverImageUrl: string | null;
  readonly area: string;
  readonly city: string;
  readonly featured: boolean;
}

/** Firestore shape of `restaurants/{restaurantId}/menuItems/{itemId}`. */
export interface MenuItem {
  readonly id: string;
  readonly restaurantId: string;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly imageUrl: string | null;
  readonly category: string;
  /** Veg flag — drives the green/red dot in the Zomato UI. */
  readonly isVeg: boolean;
  readonly isAvailable: boolean;
  readonly rating: number | null;
  readonly isBestseller: boolean;
  readonly order: number;
  /** Attribution for the dish photo; see {@link Restaurant.imageCredit}. */
  readonly imageCredit: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MenuCategory {
  readonly name: string;
  readonly items: readonly MenuItem[];
}

/**
 * A merchandised dish on the home page.
 *
 * WHY A SEPARATE COLLECTION
 * -------------------------
 * The home page wants "dishes worth showing off" from across every restaurant,
 * but a dish lives inside `restaurants/{id}/menuItems` — a subcollection that
 * cannot be queried across parents in one read. Assembling it client-side would
 * mean one query per restaurant (an N+1 that grows with the catalogue) and no
 * way to control what is featured or in what order.
 *
 * So the merchandising decision is denormalised into its own top-level
 * collection: one query, curated contents, explicit ordering. `menuItemId` still
 * points back at the real dish, and the card links to the restaurant, so nothing
 * here can drift into being a second source of truth for prices.
 */
export interface HighlightDish {
  readonly id: string;
  readonly restaurantId: string;
  readonly restaurantName: string;
  readonly menuItemId: string;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly imageUrl: string | null;
  readonly isVeg: boolean;
  /** Curated position; lower sorts first. */
  readonly rank: number;
  readonly imageCredit: string | null;
}

/**
 * Firestore shape of `dishStats/{restaurantId}_{menuItemId}`.
 *
 * A denormalised sales counter, and deliberately nothing else: the home page
 * needs "127 ordered" for signed-out visitors, but `orders` is private by
 * rule, so the sum is published here where everyone may read it. Name, price
 * and photo stay on the menu item — this document never duplicates them, so
 * it cannot drift out of agreement with the menu.
 */
export interface DishStat {
  readonly id: string;
  readonly restaurantId: string;
  readonly menuItemId: string;
  /** Total units sold across countable orders (see `dish-sales.util`). */
  readonly quantity: number;
  /** Orders the dish appeared in. Shown nowhere; exists so a future
      "ordered by N people" variant does not need a backfill. */
  readonly orderCount: number;
  readonly updatedAt: Date;
}
