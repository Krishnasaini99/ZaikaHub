import type { Coupon, CouponCheck, CouponContext, CouponRejection } from '../models/coupon.model';

/**
 * Coupon evaluation.
 *
 * Pure functions, no Firestore, so the rules that decide how much a customer
 * actually pays can be proven by tests rather than inferred from a receipt.
 * This is the one place in the app where a wrong answer is a financial bug, so
 * every branch below has a test.
 *
 * Two deliberate design decisions worth stating:
 *
 *  - **A percentage is capped at the subtotal.** A "100% off" coupon must never
 *    produce a negative bill; clamping here means callers can add the discount
 *    without re-checking the sign.
 *  - **`free_delivery` discounts the fee, not the subtotal.** The caller is told
 *    which via {@link CouponCheck.discount} on the subtotal *and* the type, so
 *    the cart can zero the delivery line instead of hiding money from it.
 */

/** Normalises what the customer typed: trims, upper-cases, drops inner spaces. */
export function normaliseCode(input: string): string {
  return input.trim().replace(/\s+/g, '').toUpperCase();
}

const REJECTIONS = {
  not_found: 'That code is not valid.',
  inactive: 'That code is no longer active.',
  not_started: 'That code is not active yet.',
  expired: 'That code has expired.',
  used_up: 'That code has been fully redeemed.',
  user_limit: 'You have already used that code the maximum number of times.',
  min_order: 'Your order is below the minimum for that code.',
  empty_cart: 'Add something to your cart before applying a code.',
} satisfies Record<CouponRejection, string>;

function refuse(reason: CouponRejection): CouponCheck {
  return { ok: false, discount: 0, reason, message: REJECTIONS[reason] };
}

/**
 * Whether a coupon may be used right now, ignoring the money.
 *
 * Split from {@link evaluateCoupon} so the cart can grey out a code the moment
 * it becomes invalid (expired while the tab was open) rather than only when the
 * customer tries to apply it.
 */
export function checkCouponUsable(
  coupon: Coupon | null,
  context: CouponContext,
): CouponCheck {
  if (!coupon) {
    return refuse('not_found');
  }
  if (!coupon.isActive) {
    return refuse('inactive');
  }
  if (context.subtotal <= 0) {
    return refuse('empty_cart');
  }
  if (coupon.startsAt && context.now < coupon.startsAt) {
    return refuse('not_started');
  }
  if (coupon.expiresAt && context.now >= coupon.expiresAt) {
    return refuse('expired');
  }
  if (coupon.maxRedemptions !== null && coupon.usageCount >= coupon.maxRedemptions) {
    return refuse('used_up');
  }
  if (coupon.maxPerUser !== null && context.previousOrderCount >= coupon.maxPerUser) {
    return refuse('user_limit');
  }
  if (coupon.minOrderAmount > 0 && context.subtotal < coupon.minOrderAmount) {
    return refuse('min_order');
  }
  return { ok: true, discount: 0, reason: null, message: '' };
}

/**
 * Works out what a coupon takes off, and refuses it cleanly if it cannot apply.
 */
export function evaluateCoupon(
  coupon: Coupon | null,
  context: CouponContext,
): CouponCheck {
  const usable = checkCouponUsable(coupon, context);
  if (!usable.ok || !coupon) {
    return usable;
  }

  const subtotal = round2(context.subtotal);
  let discount = 0;
  if (coupon.type === 'percentage') {
    const percent = Math.min(100, Math.max(0, coupon.value));
    discount = round2((subtotal * percent) / 100);
  } else if (coupon.type === 'fixed') {
    discount = round2(Math.max(0, coupon.value));
  }

  // Never more than the subtotal: a fixed coupon worth more than the order
  // must not turn the bill negative.
  discount = Math.min(discount, subtotal);

  const remaining = subtotal - discount;
  return {
    ok: true,
    discount,
    reason: null,
    message:
      coupon.type === 'free_delivery'
        ? 'Free delivery applied.'
        : `${formatRupees(discount)} off applied.`,
  };
}

/**
 * Whether the cart is small enough that applying this code would save nothing
 * — worth telling the customer, and worth not pretending is a win.
 */
export function isWorthApplying(discount: number): boolean {
  return discount > 0;
}

/** Mirrors the site-wide rounding so a discount never lands on a half-paisa. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatRupees(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}