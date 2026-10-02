import { describe, expect, it } from 'vitest';

import { calculateTotals, DELIVERY_FEE, FREE_DELIVERY_THRESHOLD } from './cart.service';
import { CartItem } from '../models/order.model';

function line(price: number, quantity = 1): CartItem {
  return {
    menuItemId: `m${price}-${quantity}`,
    restaurantId: 'r1',
    restaurantName: 'Test Kitchen',
    name: 'Dish',
    price,
    isVeg: true,
    imageUrl: null,
    quantity,
  };
}

describe('calculateTotals', () => {
  it('returns zeroes for an empty cart', () => {
    expect(calculateTotals([])).toEqual({
      itemCount: 0,
      itemTotal: 0,
      deliveryFee: 0,
      taxes: 0,
      discount: 0,
      grandTotal: 0,
    });
  });

  it('sums quantities and prices across lines', () => {
    const totals = calculateTotals([line(200, 2), line(100)]);

    expect(totals.itemCount).toBe(3);
    expect(totals.itemTotal).toBe(500);
  });

  it('charges the delivery fee below the free-delivery threshold', () => {
    const totals = calculateTotals([line(200)]);

    expect(totals.deliveryFee).toBe(DELIVERY_FEE);
    expect(totals.grandTotal).toBeGreaterThan(200);
  });

  it('waives the delivery fee at or above the threshold', () => {
    const totals = calculateTotals([line(FREE_DELIVERY_THRESHOLD)]);

    expect(totals.deliveryFee).toBe(0);
  });

  it('applies taxes and discount as a percentage of the item total', () => {
    const totals = calculateTotals([line(1000)]);

    expect(totals.taxes).toBe(50);
    expect(totals.discount).toBe(100);
  });

  it('rounds money to paise, avoiding float drift', () => {
    const totals = calculateTotals([line(33, 3)]);

    expect(totals.itemTotal).toBe(99);
    // 99 + 39 delivery + 4.95 tax - 9.90 discount = 133.05 exactly. Without
    // the round2 calls this would come out as 133.04999999999998 and render as
    // "₹133.04999999999998" in the bill.
    expect(totals.grandTotal).toBe(133.05);
    expect(totals.taxes).toBe(4.95);
    expect(totals.discount).toBe(9.9);
  });

  it('never returns a negative grand total', () => {
    const totals = calculateTotals([line(1)]);

    expect(totals.grandTotal).toBeGreaterThanOrEqual(0);
  });
});
