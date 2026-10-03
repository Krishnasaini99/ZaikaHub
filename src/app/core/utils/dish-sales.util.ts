import type { MenuItem } from '../models/restaurant.model';
import type { Order, OrderStatus } from '../models/order.model';

/**
 * Dish-sales counting and top-dish picking.
 *
 * Pure functions with no Firestore in them, for the same reason every other
 * util in this folder exists: the ranking is the part that can quietly go
 * wrong (counting cancelled orders, ranking by order count instead of units),
 * and it should be provable in a unit test rather than only observable on a
 * screenshots-and-hope basis.
 *
 * Two stages, kept separate because they fail differently:
 *   1. `aggregateSales` turns orders into per-dish counts.
 *   2. `pickTopDishes` turns counts plus the menu into ranked rows.
 */

/** How many rows appear under each home-page restaurant card. */
export const TOP_DISHES_PER_RESTAURANT = 3;

/**
 * Order statuses that count as a sale.
 *
 * `placed` is excluded on purpose: the restaurant has not accepted it yet, so
 * it may never become food. `cancelled` is excluded for the obvious reason.
 * Everything from `accepted` on is a committed sale even if the courier is
 * still riding.
 */
export const COUNTABLE_STATUSES: readonly OrderStatus[] = [
  'accepted',
  'preparing',
  'out_for_delivery',
  'delivered',
];

export interface DishSales {
  /** Total units sold. */
  readonly quantity: number;
  /** Orders the dish appeared in. */
  readonly orderCount: number;
}

/**
 * Sums sold units per dish across the given orders.
 *
 * Keyed by `menuItemId`, never by name: a renamed dish keeps its history, and
 * two dishes that happen to share a name never merge. Items inside
 * non-countable orders are skipped entirely rather than zeroed, so a dish
 * with only cancelled orders simply has no entry.
 */
export function aggregateSales(orders: readonly Order[]): ReadonlyMap<string, DishSales> {
  const totals = new Map<string, { quantity: number; orderCount: number }>();

  for (const order of orders) {
    if (!COUNTABLE_STATUSES.includes(order.status)) {
      continue;
    }
    const seenInThisOrder = new Set<string>();
    for (const item of order.items) {
      if (item.quantity <= 0) {
        continue;
      }
      const entry = totals.get(item.menuItemId) ?? { quantity: 0, orderCount: 0 };
      entry.quantity += item.quantity;
      if (!seenInThisOrder.has(item.menuItemId)) {
        seenInThisOrder.add(item.menuItemId);
        entry.orderCount += 1;
      }
      totals.set(item.menuItemId, entry);
    }
  }

  return totals;
}

export interface TopDish {
  readonly item: MenuItem;
  /** Sold units, or `null` when this row is a flag fallback with no count. */
  readonly soldQuantity: number | null;
}

/**
 * Picks the rows shown under one restaurant's card.
 *
 * Dishes with sales sort first by units sold (ties broken by menu `order`,
 * which is the owner's own merchandising sequence — a deterministic,
 * meaningful tiebreak rather than an arbitrary one). Dishes with no sales do
 * not vanish: `isBestseller`-flagged ones fill the remaining slots with a
 * `null` count, which the template renders as the "Bestseller" tag instead of
 * a number. If flags still leave the block short, the earliest menu items in
 * `order` sequence fill it, so the block keeps its shape on a brand-new menu.
 *
 * Unavailable dishes are skipped throughout — ranking an unorderable dish
 * first and then refusing to sell it is worse than ranking it nowhere.
 */
export function pickTopDishes(
  menuItems: readonly MenuItem[],
  sales: ReadonlyMap<string, DishSales>,
  limit: number = TOP_DISHES_PER_RESTAURANT,
): readonly TopDish[] {
  const available = menuItems.filter((item) => item.isAvailable);
  const ranked = available.filter((item) => sales.has(item.id));
  const unranked = available.filter((item) => !sales.has(item.id));

  ranked.sort((a, b) => {
    const gap = (sales.get(b.id)?.quantity ?? 0) - (sales.get(a.id)?.quantity ?? 0);
    return gap !== 0 ? gap : a.order - b.order;
  });

  const flagged = unranked
    .filter((item) => item.isBestseller)
    .sort((a, b) => a.order - b.order);
  const rest = unranked
    .filter((item) => !item.isBestseller)
    .sort((a, b) => a.order - b.order);

  const rows: TopDish[] = [
    ...ranked.map((item) => ({ item, soldQuantity: sales.get(item.id)?.quantity ?? 0 })),
    ...flagged.map((item) => ({ item, soldQuantity: null as number | null })),
    ...rest.map((item) => ({ item, soldQuantity: null as number | null })),
  ];

  return rows.slice(0, Math.max(0, limit));
}
