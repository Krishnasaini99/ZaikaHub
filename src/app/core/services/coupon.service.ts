import { Injectable, inject } from '@angular/core';
import { DocumentData, Firestore, collection, collectionData, doc, docData, increment, setDoc, updateDoc } from '@angular/fire/firestore';
import { Observable, firstValueFrom, map } from 'rxjs';

import type { Coupon, CouponType } from '../models/coupon.model';
import { COUPON_TYPES } from '../models/coupon.model';
import { toDate } from '../utils/date.util';
import { normaliseCode } from '../utils/coupon.util';

const COUPONS = 'coupons';

export interface CouponInput {
  readonly code: string;
  readonly type: CouponType;
  readonly value: number;
  readonly minOrderAmount: number;
  readonly startsAt: Date | null;
  readonly expiresAt: Date | null;
  readonly maxRedemptions: number | null;
  readonly maxPerUser: number | null;
  readonly isActive: boolean;
  readonly description: string;
  /** Present when editing, absent when creating. */
  readonly id?: string;
  /** Carried through on edit so a save cannot silently reset the counter. */
  readonly usageCount?: number;
}

/**
 * Coupon storage.
 *
 * There is deliberately no "validate" method here. Evaluating a code is pure
 * arithmetic over a `Coupon` (see `coupon.util`) so it can be unit-tested, and
 * duplicating that logic in a service would mean the cart and the checkout
 * could disagree about what a code is worth. This service only stores and
 * reads; deciding happens in one shared place.
 */
@Injectable({ providedIn: 'root' })
export class CouponService {
  private readonly firestore = inject(Firestore);

  /** Live list for the admin table, newest first. */
  watchAll(): Observable<readonly Coupon[]> {
    return collectionData(collection(this.firestore, COUPONS), { idField: 'id' }).pipe(
      map((docs) =>
        docs
          .map((data) => normaliseCoupon(data, data['id'] as string))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
    );
  }

  watch(id: string): Observable<Coupon | null> {
    return docData(doc(this.firestore, `${COUPONS}/${id}`)).pipe(
      map((data) => (data ? normaliseCoupon(data, id) : null)),
    );
  }

  /**
   * Resolves a typed code to its document.
   *
   * The document id is the normalised code itself, so this is one point lookup
   * rather than a query over every coupon on every keystroke.
   */
  findByCode(code: string): Observable<Coupon | null> {
    return this.watch(normaliseCode(code)).pipe(map((coupon) => coupon ?? null));
  }

  /**
   * Reads one code synchronously-ish for the cart's apply button.
   *
   * `docData` is a live observable, so `firstValueFrom` takes the first emission
   * and stops — the cart wants an answer now, not a subscription it would have
   * to keep tearing down when the code is removed.
   */
  async snapshotByCode(code: string): Promise<Coupon | null> {
    const found = await firstValueFrom(this.watch(normaliseCode(code)));
    return found;
  }

  async save(input: CouponInput): Promise<string> {
    // Codes are their own document id: upper-cased, no spaces, and safe in a
    // path. That makes "did someone already create ZAIKA10?" a point read.
    const id = input.id ?? normaliseCode(input.code);
    await setDoc(
      doc(this.firestore, `${COUPONS}/${id}`),
      {
        code: normaliseCode(input.code),
        type: input.type,
        value: input.type === 'free_delivery' ? 0 : input.value,
        minOrderAmount: input.minOrderAmount,
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        maxRedemptions: input.maxRedemptions,
        maxPerUser: input.maxPerUser,
        isActive: input.isActive,
        description: input.description,
        usageCount: input.usageCount ?? 0,
        updatedAt: new Date(),
      },
      { merge: true },
    );
    return id;
  }

  /**
   * Records a redemption.
   *
   * A plain increment rather than a transaction: two simultaneous redemptions
   * could each read the same count and one increment would be lost. That only
   * matters when a limit is close to being hit, and the alternative (a
   * transaction) would make a shopper's checkout depend on contention. The
   * count is used for limits and display, never for money — the discount itself
   * was already written into the order's totals.
   */
  async recordRedemption(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, `${COUPONS}/${id}`), {
      usageCount: increment(1),
      updatedAt: new Date(),
    });
  }
}

/** Defensive projection: a hand-edited coupon cannot produce a NaN discount. */
export function normaliseCoupon(data: DocumentData, id: string): Coupon {
  const str = (key: string, fallback = ''): string =>
    typeof data[key] === 'string' && data[key] ? (data[key] as string) : fallback;
  const num = (key: string, fallback = 0): number =>
    typeof data[key] === 'number' && Number.isFinite(data[key])
      ? (data[key] as number)
      : fallback;
  const optNum = (key: string): number | null =>
    typeof data[key] === 'number' && Number.isFinite(data[key]) ? (data[key] as number) : null;
  const date = (key: string): Date | null => {
    const value = data[key];
    if (!value) {
      return null;
    }
    const parsed = toDate(value);
    return parsed.getTime() === 0 ? null : parsed;
  };
  const type = COUPON_TYPES.includes(data['type'] as CouponType)
    ? (data['type'] as CouponType)
    : 'percentage';

  return {
    id,
    code: str('code', id),
    type,
    value: num('value'),
    minOrderAmount: num('minOrderAmount'),
    startsAt: date('startsAt'),
    expiresAt: date('expiresAt'),
    maxRedemptions: optNum('maxRedemptions'),
    maxPerUser: optNum('maxPerUser'),
    usageCount: num('usageCount'),
    isActive: data['isActive'] !== false,
    description: str('description'),
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}