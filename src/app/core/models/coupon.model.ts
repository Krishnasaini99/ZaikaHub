/**
 * Discount codes.
 *
 * Read publicly on purpose: the cart and checkout must be able to evaluate a
 * code a customer typed before they sign in. That is safe because nothing here
 * is sensitive, and because the discount that actually applied is copied into
 * the order's `totals` at checkout — editing a coupon afterwards cannot rewrite
 * the price of a past order.
 */

export type CouponType = 'percentage' | 'fixed' | 'free_delivery';

/** Firestore shape of `coupons/{couponId}`. */
export interface Coupon {
  readonly id: string;
  /** What the customer types. Stored upper-case so matching is trivial. */
  readonly code: string;
  readonly type: CouponType;
  /** Percent (1–100) for `percentage`, rupees for `fixed`. Unused for free delivery. */
  readonly value: number;
  /** Minimum order subtotal required. `0` means no minimum. */
  readonly minOrderAmount: number;
  /** ISO date the code becomes usable; `null` means immediately. */
  readonly startsAt: Date | null;
  /** ISO date the code stops working. `null` means never. */
  readonly expiresAt: Date | null;
  /** Total times it may be redeemed across all customers; `null` means unlimited. */
  readonly maxRedemptions: number | null;
  /** Times one customer may use it; `null` means unlimited. */
  readonly maxPerUser: number | null;
  /** How many times it has been redeemed, incremented on each applied order. */
  readonly usageCount: number;
  readonly isActive: boolean;
  /** Shown to the customer, e.g. "20% off on orders over ₹500". */
  readonly description: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const COUPON_TYPES: readonly CouponType[] = ['percentage', 'fixed', 'free_delivery'];

/** Why a coupon was refused. Surfaced verbatim in the cart, so keep it plain. */
export type CouponRejection =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'used_up'
  | 'user_limit'
  | 'min_order'
  | 'empty_cart';

export interface CouponCheck {
  readonly ok: boolean;
  /** Rupees taken off the item subtotal. Delivery is handled separately. */
  readonly discount: number;
  /** Set when `ok` is false. */
  readonly reason: CouponRejection | null;
  /** Plain-English reason even when valid, e.g. "₹100 off applied". */
  readonly message: string;
}

/** Order subtotal the coupon is measured against. */
export interface CouponContext {
  /** Sum of item price × quantity, before taxes and delivery. */
  readonly subtotal: number;
  /** How many orders this customer has already placed. */
  readonly previousOrderCount: number;
  readonly now: Date;
}