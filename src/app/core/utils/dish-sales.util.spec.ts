import { describe, expect, it } from 'vitest';

import type { MenuItem } from '../models/restaurant.model';
import type { Order } from '../models/order.model';
import { aggregateSales, pickTopDishes } from './dish-sales.util';

function order(
  id: string,
  status: Order['status'],
  items: { menuItemId: string; quantity: number }[],
): Order {
  return {
    id,
    userId: 'user-1',
    restaurantId: 'zaika-house',
    restaurantName: 'Zaika House',
    restaurantCoverImageUrl: null,
    items: items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.menuItemId,
      price: 100,
      quantity: item.quantity,
      lineTotal: 100 * item.quantity,
      isVeg: true,
    })),
    address: {
      label: 'Home',
      line1: '1 Main',
      line2: '',
      city: 'Bengaluru',
      pincode: '560001',
    },
    totals: {
      itemTotal: 0,
      deliveryFee: 0,
      taxes: 0,
      discount: 0,
      grandTotal: 0,
    },
    status,
    paymentMethod: 'cod',
    placedAt: new Date(),
    updatedAt: new Date(),
    etaMinutes: null,
    cancelledReason: null,
  };
}

function dish(id: string, overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id,
    restaurantId: 'zaika-house',
    name: id,
    description: '',
    price: 100,
    imageUrl: null,
    category: 'Test',
    isVeg: true,
    isAvailable: true,
    rating: null,
    isBestseller: false,
    order: 0,
    imageCredit: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('aggregateSales', () => {
  it('sums quantities per dish, not orders', () => {
    const sales = aggregateSales([
      order('o1', 'delivered', [{ menuItemId: 'biryani', quantity: 3 }]),
      order('o2', 'delivered', [{ menuItemId: 'biryani', quantity: 1 }]),
      order('o3', 'delivered', [{ menuItemId: 'naan', quantity: 1 }]),
    ]);

    // 4 units in 2 orders outranks 1 unit in 1 order either way you slice it.
    expect(sales.get('biryani')).toEqual({ quantity: 4, orderCount: 2 });
    expect(sales.get('naan')).toEqual({ quantity: 1, orderCount: 1 });
  });

  // The distinction that matters: one order of 3 beats three orders of 1.
  it('ranks by units so a bulk order beats many single orders', () => {
    const sales = aggregateSales([
      order('o1', 'delivered', [{ menuItemId: 'bulk', quantity: 3 }]),
      order('o2', 'delivered', [{ menuItemId: 'single', quantity: 1 }]),
      order('o3', 'delivered', [{ menuItemId: 'single', quantity: 1 }]),
      order('o4', 'delivered', [{ menuItemId: 'single', quantity: 1 }]),
    ]);

    expect(sales.get('bulk')?.quantity).toBe(3);
    expect(sales.get('single')?.quantity).toBe(3);
    expect(sales.get('single')?.orderCount).toBe(3);
    expect(sales.get('bulk')?.orderCount).toBe(1);
  });

  it('ignores placed and cancelled orders', () => {
    const sales = aggregateSales([
      order('o1', 'placed', [{ menuItemId: 'maybe', quantity: 5 }]),
      order('o2', 'cancelled', [{ menuItemId: 'never', quantity: 5 }]),
      order('o3', 'accepted', [{ menuItemId: 'yes', quantity: 2 }]),
      order('o4', 'preparing', [{ menuItemId: 'yes', quantity: 1 }]),
      order('o5', 'out_for_delivery', [{ menuItemId: 'yes', quantity: 1 }]),
    ]);

    expect(sales.has('maybe')).toBe(false);
    expect(sales.has('never')).toBe(false);
    expect(sales.get('yes')).toEqual({ quantity: 4, orderCount: 3 });
  });

  it('counts a dish once per order for orderCount even if listed twice', () => {
    const sales = aggregateSales([
      order('o1', 'delivered', [
        { menuItemId: 'dup', quantity: 1 },
        { menuItemId: 'dup', quantity: 2 },
      ]),
    ]);

    expect(sales.get('dup')).toEqual({ quantity: 3, orderCount: 1 });
  });

  it('skips zero and negative quantities', () => {
    const sales = aggregateSales([order('o1', 'delivered', [{ menuItemId: 'zero', quantity: 0 }])]);
    expect(sales.has('zero')).toBe(false);
  });
});

describe('pickTopDishes', () => {
  it('ranks by sold units and carries the count', () => {
    const menu = [dish('a', { order: 0 }), dish('b', { order: 1 }), dish('c', { order: 2 })];
    const sales = new Map([
      ['b', { quantity: 9, orderCount: 4 }],
      ['a', { quantity: 2, orderCount: 2 }],
    ]);

    const top = pickTopDishes(menu, sales, 3);

    expect(top.map((row) => row.item.id)).toEqual(['b', 'a', 'c']);
    expect(top[0]?.soldQuantity).toBe(9);
    // `c` has no sales and no flag: fallback row, count unknown.
    expect(top[2]?.soldQuantity).toBeNull();
  });

  it('breaks ties by the owner menu order', () => {
    const menu = [dish('first', { order: 0 }), dish('second', { order: 1 })];
    const sales = new Map([
      ['second', { quantity: 5, orderCount: 1 }],
      ['first', { quantity: 5, orderCount: 1 }],
    ]);

    expect(pickTopDishes(menu, sales, 2).map((row) => row.item.id)).toEqual(['first', 'second']);
  });

  it('fills short blocks with flagged dishes before plain ones', () => {
    const menu = [
      dish('plain-early', { order: 0 }),
      dish('flagged', { order: 1, isBestseller: true }),
      dish('plain-late', { order: 2 }),
    ];

    const top = pickTopDishes(menu, new Map(), 3);

    expect(top.map((row) => row.item.id)).toEqual(['flagged', 'plain-early', 'plain-late']);
    expect(top.every((row) => row.soldQuantity === null)).toBe(true);
  });

  it('never ranks an unavailable dish, however well it sold', () => {
    const menu = [
      dish('gone', { order: 0, isAvailable: false }),
      dish('here', { order: 1 }),
    ];
    const sales = new Map([['gone', { quantity: 99, orderCount: 9 }]]);

    const top = pickTopDishes(menu, sales, 3);

    expect(top.map((row) => row.item.id)).toEqual(['here']);
  });

  it('respects the limit and never returns more', () => {
    const menu = [dish('a'), dish('b'), dish('c'), dish('d')];
    expect(pickTopDishes(menu, new Map(), 3)).toHaveLength(3);
    expect(pickTopDishes(menu, new Map(), 0)).toHaveLength(0);
  });
});
