import { describe, expect, it } from 'vitest';

import type { Coupon, CouponContext } from '../models/coupon.model';
import { checkCouponUsable, evaluateCoupon, normaliseCode } from './coupon.util';

function coupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'c1',
    code: 'SAVE20',
    type: 'percentage',
    value: 20,
    minOrderAmount: 0,
    startsAt: null,
    expiresAt: null,
    maxRedemptions: null,
    maxPerUser: null,
    usageCount: 0,
    isActive: true,
    description: '',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function context(overrides: Partial<CouponContext> = {}): CouponContext {
  return {
    subtotal: 1000,
    previousOrderCount: 0,
    now: new Date('2026-06-01T12:00:00Z'),
    ...overrides,
  };
}

describe('normaliseCode', () => {
  it('trims, upper-cases and drops inner spaces', () => {
    expect(normaliseCode('  save 20 ')).toBe('SAVE20');
  });

  it('is idempotent, so a stored code always matches a typed one', () => {
    expect(normaliseCode(normaliseCode('Zaika10'))).toBe('ZAIKA10');
  });
});

describe('checkCouponUsable', () => {
  it('refuses an unknown code', () => {
    const result = checkCouponUsable(null, context());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('refuses an inactive code', () => {
    expect(checkCouponUsable(coupon({ isActive: false }), context()).reason).toBe('inactive');
  });

  it('refuses before the start date and allows exactly at it', () => {
    const c = coupon({ startsAt: new Date('2026-06-01T12:00:00Z') });
    expect(checkCouponUsable(c, context({ now: new Date('2026-05-31T23:59:00Z') })).reason).toBe(
      'not_started',
    );
    expect(checkCouponUsable(c, context()).ok).toBe(true);
  });

  it('refuses at the expiry instant, not one second before', () => {
    const c = coupon({ expiresAt: new Date('2026-06-01T12:00:00Z') });
    expect(checkCouponUsable(c, context({ now: new Date('2026-06-01T11:59:59Z') })).ok).toBe(true);
    expect(checkCouponUsable(c, context({ now: new Date('2026-06-01T12:00:00Z') })).reason).toBe(
      'expired',
    );
  });

  it('refuses once redemptions are exhausted', () => {
    const c = coupon({ maxRedemptions: 5, usageCount: 5 });
    expect(checkCouponUsable(c, context()).reason).toBe('used_up');
  });

  it('refuses when the customer has used their share', () => {
    const c = coupon({ maxPerUser: 1 });
    expect(checkCouponUsable(c, context({ previousOrderCount: 1 })).reason).toBe('user_limit');
  });

  it('refuses an order below the minimum', () => {
    const c = coupon({ minOrderAmount: 500 });
    expect(checkCouponUsable(c, context({ subtotal: 499 })).reason).toBe('min_order');
    expect(checkCouponUsable(c, context({ subtotal: 500 })).ok).toBe(true);
  });

  it('reports the empty cart only for a coupon that would otherwise work', () => {
    // An unusable coupon keeps its own reason: telling someone "add something to
    // your cart" about a code that was switched off last week is a worse lie
    // than "that code is no longer active".
    expect(checkCouponUsable(coupon({ isActive: false }), context({ subtotal: 0 })).reason).toBe(
      'inactive',
    );
    expect(checkCouponUsable(coupon(), context({ subtotal: 0 })).reason).toBe('empty_cart');
  });
});

describe('evaluateCoupon', () => {
  it('takes a percentage off the subtotal', () => {
    const result = evaluateCoupon(coupon({ value: 20 }), context({ subtotal: 1000 }));
    expect(result.ok).toBe(true);
    expect(result.discount).toBe(200);
  });

  it('rounds money to paise', () => {
    const result = evaluateCoupon(coupon({ value: 33 }), context({ subtotal: 999 }));
    expect(result.discount).toBe(329.67);
  });

  it('takes a fixed amount off', () => {
    const result = evaluateCoupon(coupon({ type: 'fixed', value: 150 }), context({ subtotal: 1000 }));
    expect(result.discount).toBe(150);
  });

  it('never discounts more than the subtotal', () => {
    const result = evaluateCoupon(coupon({ type: 'fixed', value: 5000 }), context({ subtotal: 800 }));
    expect(result.discount).toBe(800);
  });

  it('never produces a negative bill from a 100% code', () => {
    const result = evaluateCoupon(coupon({ value: 100 }), context({ subtotal: 640.5 }));
    expect(result.discount).toBe(640.5);
  });

  it('treats free delivery as no subtotal discount', () => {
    const result = evaluateCoupon(coupon({ type: 'free_delivery' }), context());
    expect(result.ok).toBe(true);
    expect(result.discount).toBe(0);
    expect(result.message).toBe('Free delivery applied.');
  });

  it('clamps a percentage above 100 rather than over-discounting', () => {
    const result = evaluateCoupon(coupon({ value: 250 }), context({ subtotal: 400 }));
    expect(result.discount).toBe(400);
  });

  it('propagates a refusal without a discount', () => {
    const result = evaluateCoupon(coupon({ expiresAt: new Date('2026-01-01') }), context());
    expect(result.ok).toBe(false);
    expect(result.discount).toBe(0);
    expect(result.reason).toBe('expired');
  });
});