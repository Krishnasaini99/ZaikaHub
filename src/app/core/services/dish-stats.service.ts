import { Injectable, inject } from '@angular/core';
import {
  DocumentData,
  Firestore,
  collection,
  collectionData,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, firstValueFrom, map } from 'rxjs';

import type { DishStat } from '../models/restaurant.model';
import { toDate } from '../utils/date.util';
import { aggregateSales } from '../utils/dish-sales.util';
import { OrderService } from './order.service';

const DISH_STATS = 'dishStats';

/**
 * Publishes and reads per-dish sales counters.
 *
 * READS are public and cheap: the whole collection is a few dozen tiny
 * documents, so the home page takes it in one query and slices per
 * restaurant client-side — one read instead of one per card.
 *
 * WRITES happen in exactly one place, `syncRestaurant`, which recomputes a
 * restaurant's counters from its readable orders and writes back only what
 * changed. It is called by the owner panel (which is where the requester can
 * actually read those orders — see the rules on `orders`), never by the home
 * page and never by a customer. That is the whole integrity story: the only
 * account that can write a restaurant's numbers is the account that owns it,
 * and the numbers always come from its real orders rather than from input.
 */
@Injectable({ providedIn: 'root' })
export class DishStatsService {
  private readonly firestore = inject(Firestore);
  private readonly orders = inject(OrderService);

  private statsRef() {
    return collection(this.firestore, DISH_STATS);
  }

  private statDoc(id: string) {
    return doc(this.firestore, `${DISH_STATS}/${id}`);
  }

  /** Every published counter; the home page filters these per restaurant. */
  listStats(): Observable<readonly DishStat[]> {
    return collectionData(this.statsRef(), { idField: 'id' }).pipe(
      map((docs) => docs.map((data) => normaliseDishStat(data, data['id'] as string))),
    );
  }

  /**
   * Recomputes one restaurant's counters from its orders.
   *
   * Reads the restaurant's orders (readable to its owner by rule), aggregates
   * countable sales, and writes a document per dish that sold anything. Dishes
   * with no sales get no document — absence means zero, which keeps the
   * collection exactly as large as it needs to be and makes "no document" and
   * "zero sales" the same thing everywhere downstream.
   *
   * Writes only what changed: an unchanged counter is not rewritten, so an
   * owner opening their panel does not burn a write per dish per visit.
   *
   * @returns the number of documents written.
   */
  async syncRestaurant(restaurantId: string): Promise<number> {
    const [orders, existing] = await Promise.all([
      firstValueFrom(this.orders.listForRestaurant(restaurantId)),
      getDocs(query(this.statsRef(), where('restaurantId', '==', restaurantId))),
    ]);

    const sales = aggregateSales(orders);
    const current = new Map(
      existing.docs.map((snapshot) => {
        const stat = normaliseDishStat(snapshot.data(), snapshot.id);
        return [stat.menuItemId, stat];
      }),
    );

    let written = 0;
    for (const [menuItemId, totals] of sales) {
      const before = current.get(menuItemId);
      if (before?.quantity === totals.quantity && before?.orderCount === totals.orderCount) {
        continue;
      }
      await setDoc(
        this.statDoc(`${restaurantId}_${menuItemId}`),
        {
          restaurantId,
          menuItemId,
          quantity: totals.quantity,
          orderCount: totals.orderCount,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      written += 1;
    }
    return written;
  }
}

/**
 * Defensive projection: a hand-edited stat document renders as zero rather
 * than throwing inside the home page template.
 */
export function normaliseDishStat(data: DocumentData, id: string): DishStat {
  const num = (key: string): number => {
    const value = data[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  };
  const str = (key: string): string => (typeof data[key] === 'string' ? data[key] : '');

  return {
    id,
    restaurantId: str('restaurantId'),
    menuItemId: str('menuItemId'),
    quantity: num('quantity'),
    orderCount: num('orderCount'),
    updatedAt: toDate(data['updatedAt']),
  };
}
