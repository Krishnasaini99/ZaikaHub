import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { CartItem, CartTotals } from '../models/order.model';

const STORAGE_KEY = 'zaika-hub.cart.v1';

export const DELIVERY_FEE = 39;
export const TAX_RATE = 0.05;
export const FREE_DELIVERY_THRESHOLD = 399;
export const DISCOUNT_RATE = 0.1;

/**
 * Client-side cart.
 *
 * A cart is deliberately *not* scoped to a user and is never written to
 * Firestore: it is ephemeral, small, and must survive a page refresh on the
 * checkout screen. The order document created at checkout is the durable
 * record, with every line item denormalised into it.
 *
 * Only one restaurant is allowed in a cart at a time — matching real
 * food-delivery behaviour, and it keeps `restaurantId` unambiguous on the
 * resulting order.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly items = signal<readonly CartItem[]>(restoreCart());

  readonly cartItems = this.items.asReadonly();

  readonly restaurantId = computed(() => this.items()[0]?.restaurantId ?? null);
  readonly restaurantName = computed(() => this.items()[0]?.restaurantName ?? null);

  readonly isEmpty = computed(() => this.items().length === 0);
  readonly distinctRestaurants = computed(
    () => new Set(this.items().map((item) => item.restaurantId)).size,
  );

  readonly totals = computed<CartTotals>(() => calculateTotals(this.items()));

  readonly quantityOf = computed(() => {
    const map = new Map<string, number>();
    for (const item of this.items()) {
      map.set(item.menuItemId, item.quantity);
    }
    return (menuItemId: string) => map.get(menuItemId) ?? 0;
  });

  constructor() {
    // Persist on every mutation. Guarded so SSR/tests without storage do not throw.
    effect(() => {
      const value = this.items();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        // Quota exceeded or private browsing — the cart simply won't persist.
      }
    });
  }

  /**
   * Adds a dish. If the cart already holds a different restaurant, it is
   * cleared first, mirroring the "your cart has items from another restaurant"
   * prompt in the Zomato app.
   */
  add(item: Omit<CartItem, 'quantity'>, quantity = 1): void {
    this.items.update((current) => {
      const sameRestaurant = current.every((line) => line.restaurantId === item.restaurantId);
      const base = sameRestaurant ? current : [];
      const existing = base.find((line) => line.menuItemId === item.menuItemId);

      if (existing) {
        return base.map((line) =>
          line.menuItemId === item.menuItemId
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [...base, { ...item, quantity: Math.max(1, quantity) }];
    });
  }

  /** Sets an absolute quantity. A value ≤ 0 removes the line. */
  setQuantity(menuItemId: string, quantity: number): void {
    this.items.update((current) =>
      quantity <= 0
        ? current.filter((line) => line.menuItemId !== menuItemId)
        : current.map((line) =>
            line.menuItemId === menuItemId ? { ...line, quantity } : line,
          ),
    );
  }

  increment(menuItemId: string, step = 1): void {
    this.setQuantity(menuItemId, this.quantityOf()(menuItemId) + step);
  }

  remove(menuItemId: string): void {
    this.items.update((current) => current.filter((line) => line.menuItemId !== menuItemId));
  }

  /** Empties the cart. Called after a successful order. */
  clear(): void {
    this.items.set([]);
  }
}

export function calculateTotals(items: readonly CartItem[]): CartTotals {
  const itemTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = itemTotal === 0 || itemTotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  const taxes = round2(itemTotal * TAX_RATE);
  const discount = round2(itemTotal * DISCOUNT_RATE);

  return {
    itemCount,
    itemTotal: round2(itemTotal),
    deliveryFee,
    taxes,
    discount,
    grandTotal: Math.max(0, round2(itemTotal + deliveryFee + taxes - discount)),
  };
}

/** Money is rounded to paise to avoid floating-point drift in the UI. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function restoreCart(): readonly CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}
