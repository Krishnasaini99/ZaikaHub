import { Injectable, inject } from '@angular/core';
import {
  DocumentData,
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import {
  CartItem,
  Order,
  OrderAddress,
  OrderItem,
  OrderStatus,
  OrderTotals,
  PaymentMethod,
} from '../models/order.model';
import { calculateTotals } from './cart.service';
import { toDate } from '../utils/date.util';

// The status state machine lives in `utils` so it can be tested without
// pulling in the Firebase SDK. Re-exported here for convenience at call sites.
export {
  ORDER_STATUS_FLOW,
  OWNER_SETTABLE_STATUSES,
  isCancellable,
  isTerminal,
  nextStatus,
} from '../utils/order-status.util';

const ORDERS = 'orders';

export interface PlaceOrderInput {
  readonly userId: string;
  readonly restaurantId: string;
  readonly restaurantName: string;
  readonly restaurantCoverImageUrl: string | null;
  readonly items: readonly CartItem[];
  readonly address: OrderAddress;
  readonly paymentMethod: PaymentMethod;
}

/**
 * Order persistence.
 *
 * SECURITY NOTE: totals are computed on the client from the cart prices. That
 * is acceptable for a demo but is **not** production-safe — a tampered client
 * could post its own prices. A real deployment must recompute totals from the
 * `menuItems` subcollection inside a callable function or Cloud Function. See
 * the README for the full note.
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly firestore = inject(Firestore);

  private ordersRef() {
    return collection(this.firestore, ORDERS);
  }

  private orderDoc(orderId: string) {
    return doc(this.firestore, `${ORDERS}/${orderId}`);
  }

  // ---------------------------------------------------------------- reading

  /** Live order history for a customer, newest first. */
  listForUser(userId: string): Observable<readonly Order[]> {
    const ref = query(
      this.ordersRef(),
      where('userId', '==', userId),
      orderBy('placedAt', 'desc'),
      limit(50),
    );
    return collectionData(ref, { idField: 'id' }).pipe(map(toOrders));
  }

  /** Live order list for a restaurant (needs the composite index in `firestore.indexes.json`). */
  listForRestaurant(restaurantId: string): Observable<readonly Order[]> {
    const ref = query(
      this.ordersRef(),
      where('restaurantId', '==', restaurantId),
      orderBy('placedAt', 'desc'),
      limit(100),
    );
    return collectionData(ref, { idField: 'id' }).pipe(map(toOrders));
  }

  /** Every order, for the admin dashboard. */
  listAll(): Observable<readonly Order[]> {
    const ref = query(this.ordersRef(), orderBy('placedAt', 'desc'), limit(200));
    return collectionData(ref, { idField: 'id' }).pipe(map(toOrders));
  }

  getOrder(orderId: string): Observable<Order | null> {
    return docData(this.orderDoc(orderId), { idField: 'id' }).pipe(
      map((data) => (data ? normaliseOrder(data, orderId) : null)),
    );
  }

  // ---------------------------------------------------------------- writing

  /**
   * Creates an order document.
   *
   * Line items are denormalised (name, price, quantity) so order history stays
   * readable forever, even if the restaurant later renames or deletes a dish.
   */
  async placeOrder(input: PlaceOrderInput): Promise<string> {
    const items: OrderItem[] = input.items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      lineTotal: round2(item.price * item.quantity),
      isVeg: item.isVeg,
    }));

    const totals: OrderTotals = calculateTotals(input.items);
    // `doc(collection(...))` generates the id server-side. Passing the
    // collection's path to `doc()` instead yields an odd number of segments
    // ("orders") and Firestore rejects it with an invalid-document-reference
    // error, so orders could never be placed.
    const ref = doc(this.ordersRef());

    await setDoc(ref, {
      userId: input.userId,
      restaurantId: input.restaurantId,
      restaurantName: input.restaurantName,
      restaurantCoverImageUrl: input.restaurantCoverImageUrl,
      items,
      address: input.address,
      totals,
      status: 'placed' satisfies OrderStatus,
      paymentMethod: input.paymentMethod,
      etaMinutes: null,
      cancelledReason: null,
      placedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return ref.id;
  }

  /**
   * Advances an order's status, optionally attaching an ETA.
   *
   * Callers only ever pass the *next* status (see `nextStatus`), so the
   * timeline can never jump a step.
   */
  async updateStatus(
    orderId: string,
    status: OrderStatus,
    etaMinutes: number | null = null,
  ): Promise<void> {
    await updateDoc(this.orderDoc(orderId), {
      status,
      ...(etaMinutes !== null ? { etaMinutes } : {}),
      updatedAt: serverTimestamp(),
    });
  }

  async cancelOrder(orderId: string, reason: string): Promise<void> {
    await updateDoc(this.orderDoc(orderId), {
      status: 'cancelled' satisfies OrderStatus,
      cancelledReason: reason,
      updatedAt: serverTimestamp(),
    });
  }
}

// ------------------------------------------------------------------ helpers

function toOrders(docs: readonly DocumentData[]): readonly Order[] {
  return docs.map((data) => normaliseOrder(data, data['id'] as string));
}

export function normaliseOrder(data: DocumentData, id: string): Order {
  return {
    id,
    userId: asString(data['userId']),
    restaurantId: asString(data['restaurantId']),
    restaurantName: asString(data['restaurantName']),
    restaurantCoverImageUrl:
      typeof data['restaurantCoverImageUrl'] === 'string' ? data['restaurantCoverImageUrl'] : null,
    items: Array.isArray(data['items']) ? (data['items'] as OrderItem[]) : [],
    address: (data['address'] as OrderAddress | undefined) ?? emptyAddress(),
    totals: (data['totals'] as OrderTotals | undefined) ?? emptyTotals(),
    status: (data['status'] as OrderStatus) ?? 'placed',
    paymentMethod: (data['paymentMethod'] as PaymentMethod) ?? 'cod',
    placedAt: toDate(data['placedAt']),
    updatedAt: toDate(data['updatedAt']),
    etaMinutes: typeof data['etaMinutes'] === 'number' ? data['etaMinutes'] : null,
    cancelledReason:
      typeof data['cancelledReason'] === 'string' ? data['cancelledReason'] : null,
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function emptyAddress(): OrderAddress {
  return { label: '', line1: '', line2: '', city: '', pincode: '' };
}

function emptyTotals(): OrderTotals {
  return { itemTotal: 0, deliveryFee: 0, taxes: 0, discount: 0, grandTotal: 0 };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
